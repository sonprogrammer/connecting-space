import { timingSafeEqual } from "node:crypto";
import { jsonError, jsonOk } from "@/shared/api/response";
import { assertAutomationProcessEnv } from "@/shared/config/env";
import { processAutomationJobs } from "@/shared/lib/automation/processor";

function isAuthorized(request: Request, expected: string) {
  const supplied = request.headers.get("x-automation-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(supplied); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function POST(request: Request) {
  let env: ReturnType<typeof assertAutomationProcessEnv>;
  try { env = assertAutomationProcessEnv(); } catch { return jsonError("AUTOMATION_NOT_CONFIGURED", "Automation is not configured", 503); }
  if (!isAuthorized(request, env.processSecret)) return jsonError("AUTOMATION_AUTH_REQUIRED", "Automation authorization required", 401);
  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const limit = typeof body.limit === "number" && Number.isInteger(body.limit) ? Math.max(1, Math.min(body.limit, 20)) : 5;
  try { return jsonOk({ results: await processAutomationJobs({ limit }) }); }
  catch { return jsonError("AUTOMATION_PROCESS_FAILED", "Failed to process automation jobs", 500); }
}
