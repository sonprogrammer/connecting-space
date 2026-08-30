import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { registerPathAlias } from "./helpers/register-path-alias";

registerPathAlias();

const previous = {
  secret: process.env.AUTOMATION_PROCESS_SECRET,
  slack: process.env.SLACK_INQUIRY_WEBHOOK_URL,
  admin: process.env.ADMIN_BASE_URL,
};

after(() => {
  for (const [name, value] of Object.entries({
    AUTOMATION_PROCESS_SECRET: previous.secret,
    SLACK_INQUIRY_WEBHOOK_URL: previous.slack,
    ADMIN_BASE_URL: previous.admin,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("automation process route", { concurrency: false }, () => {
  it("exposes a Vercel Cron-compatible GET and preserves secret auth", async () => {
    process.env.AUTOMATION_PROCESS_SECRET = "route-test-secret";
    const route = await import("../src/app/api/internal/automation/process/route");

    const unauthorized = await route.GET(new Request("https://example.test/api/internal/automation/process"));
    assert.equal(unauthorized.status, 401);

    const authorized = await route.GET(new Request("https://example.test/api/internal/automation/process", {
      headers: { authorization: "Bearer route-test-secret" },
    }));
    assert.notEqual(authorized.status, 405);
  });

  it("returns explicit Slack configuration details when Slack configuration is missing", async () => {
    process.env.AUTOMATION_PROCESS_SECRET = "route-test-secret";
    delete process.env.SLACK_INQUIRY_WEBHOOK_URL;
    delete process.env.ADMIN_BASE_URL;
    const route = await import("../src/app/api/internal/automation/process/route");
    const processJobs = async () => [{
      id: "job-id", status: "retry" as const, error: "Missing environment variables: SLACK_INQUIRY_WEBHOOK_URL, ADMIN_BASE_URL",
    }];

    const response = await route.processAutomationRequest(new Request("https://example.test/api/internal/automation/process", {
      method: "POST",
      headers: { authorization: "Bearer route-test-secret", "content-type": "application/json" },
      body: JSON.stringify({ limit: 1 }),
    }), true, processJobs);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: {
        code: "SLACK_NOT_CONFIGURED",
        message: "Slack notification configuration is missing",
        details: { missing: ["SLACK_INQUIRY_WEBHOOK_URL", "ADMIN_BASE_URL"] },
      },
    });
  });
});
