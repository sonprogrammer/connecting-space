import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { toPublicContentState } from "../src/widgets/public-automation-content/model/public-content-state";

describe("public automation content state", () => {
  test("distinguishes populated and empty API data", () => {
    assert.deepEqual(toPublicContentState({ data: [{ id: "1" }] }), {
      status: "success", items: [{ id: "1" }],
    });
    assert.deepEqual(toPublicContentState({ data: [] }), { status: "empty" });
  });

  test("uses a customer-facing error for API failures", () => {
    assert.deepEqual(toPublicContentState({
      error: { code: "READ_FAILED", message: "failed" },
    }), { status: "error", message: "콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." });
  });
});
