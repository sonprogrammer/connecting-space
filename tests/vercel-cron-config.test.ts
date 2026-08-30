import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

describe("Vercel Cron configuration", () => {
  it("registers the automation processor in production", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };
    assert.deepEqual(config.crons, [{ path: "/api/internal/automation/process", schedule: "*/5 * * * *" }]);
  });
});
