import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

describe("scheduled automation configuration", () => {
  it("uses GitHub Actions every five minutes instead of Vercel Cron", () => {
    assert.throws(() => readFileSync("vercel.json", "utf8"));
    const workflow = readFileSync(".github/workflows/automation-process.yml", "utf8");
    assert.match(workflow, /cron: ["']\*\/5 \* \* \* \*["']/);
    assert.match(workflow, /secrets\.AUTOMATION_PROCESS_SECRET/);
    assert.match(workflow, /api\/internal\/automation\/process/);
    assert.match(workflow, /Authorization: Bearer/);
  });
});
