import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  getCachedQueryListState,
  syncEditableFormState,
} from "../src/shared/lib/admin-editable-query-state";

describe("admin editable query state", () => {
  test("preserves dirty values while refreshing untouched values", () => {
    const initial = { title: "Saved title", published: false };
    const edited = { title: "Unsaved title", published: false };
    const synced = syncEditableFormState({
      currentId: "item-1",
      incomingId: "item-1",
      current: edited,
      baseline: initial,
      incoming: { title: "Server title", published: true },
    });

    assert.deepEqual(synced, {
      values: { title: "Unsaved title", published: true },
      baseline: { title: "Server title", published: true },
    });
  });

  test("hydrates all values when the selected item changes", () => {
    assert.deepEqual(
      syncEditableFormState({
        currentId: "item-1",
        incomingId: "item-2",
        current: { title: "Unsaved title" },
        baseline: { title: "Saved title" },
        incoming: { title: "Other item" },
      }),
      { values: { title: "Other item" }, baseline: { title: "Other item" } },
    );
  });

  test("keeps cached rows and exposes a refresh warning after a refetch failure", () => {
    assert.deepEqual(
      getCachedQueryListState({
        data: ["cached"],
        isPending: false,
        isError: true,
        errorMessage: "network error",
      }),
      {
        status: "success",
        items: ["cached"],
        warning: "목록을 새로고침하지 못했습니다. 현재 표시된 데이터는 이전 조회 결과입니다.",
      },
    );
  });

  test("shows an error state when a failed query has no cached rows", () => {
    assert.deepEqual(
      getCachedQueryListState({ data: undefined, isPending: false, isError: true, errorMessage: "failed" }),
      { status: "error", message: "failed" },
    );
  });

  test("connects portfolio, service, and FAQ editors to the same dirty-field sync", () => {
    const portfolio = readFileSync("src/widgets/admin-portfolio/ui/admin-portfolio-manager.tsx", "utf8");
    const automation = readFileSync("src/widgets/admin-automation-content/ui/admin-automation-content-manager.tsx", "utf8");

    assert.match(portfolio, /syncEditableFormState/);
    assert.match(portfolio, /getCachedQueryListState/);
    assert.match(automation, /syncEditableFormState/);
    assert.match(automation, /getCachedQueryListState/);
    assert.match(automation, /faqToFormValues/);
    assert.match(automation, /serviceToFormValues/);
  });
});
