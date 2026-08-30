import { timingSafeEqual } from "node:crypto";

import { jsonError, jsonOk } from "@/shared/api/response";
import { assertAutomationProcessEnv } from "@/shared/config/env";
import { processAutomationJobs } from "@/shared/lib/automation/processor";

function isAuthorized(request: Request, expected: string) {
  const supplied = request.headers.get("x-automation-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function missingSlackVariables(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = message.match(/Missing environment variables: (.+)$/);
  if (!match) return [];
  return match[1].split(", ").filter((name) =>
    name === "SLACK_INQUIRY_WEBHOOK_URL" || name === "ADMIN_BASE_URL",
  );
}

export async function processAutomationRequest(
  request: Request,
  parseBody: boolean,
  processJobs: typeof processAutomationJobs = processAutomationJobs,
) {
  let env: ReturnType<typeof assertAutomationProcessEnv>;
  try {
    env = assertAutomationProcessEnv();
  } catch {
    return jsonError("AUTOMATION_NOT_CONFIGURED", "Automation is not configured", 503);
  }
  if (!isAuthorized(request, env.processSecret)) {
    return jsonError("AUTOMATION_AUTH_REQUIRED", "Automation authorization required", 401);
  }
  const body = parseBody
    ? await request.json().catch(() => ({})) as { limit?: unknown }
    : {};
  const limit = typeof body.limit === "number" && Number.isInteger(body.limit)
    ? Math.max(1, Math.min(body.limit, 20))
    : 5;
  try {
    const results = await processJobs({ limit });
    const missing = [...new Set(results.flatMap((result) => missingSlackVariables(result.error)))];
    if (missing.length) {
      return jsonError("SLACK_NOT_CONFIGURED", "Slack notification configuration is missing", 503, { missing });
    }
    return jsonOk({ results });
  } catch {
    return jsonError("AUTOMATION_PROCESS_FAILED", "Failed to process automation jobs", 500);
  }
}
