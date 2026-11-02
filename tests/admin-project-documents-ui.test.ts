import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { registerPathAlias } from "./helpers/register-path-alias";
registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const documentState = require("../src/widgets/admin-project-documents/model/admin-project-document-state") as typeof import("../src/widgets/admin-project-documents/model/admin-project-document-state");

describe("admin project documents generation UI", () => {
  test("empty documents create a fresh generation request", () => {
    assert.deepEqual(
      documentState.buildAdminDocumentGenerationInput("proposal", undefined, () => "fresh-key"),
      { type: "proposal", requestKey: "fresh-key" },
    );
  });

  test("failed job retry reuses its request key and explicitly enables retry", () => {
    assert.deepEqual(
      documentState.buildAdminDocumentGenerationInput("contract", {
        id: "job-id", request_key: "failed-key", status: "failed", base_revision: 0,
        version: null, applied: false, attempt_count: 1, history: [], created_at: "2026-10-26T00:00:00Z",
      }, () => "must-not-be-used"),
      { type: "contract", requestKey: "failed-key", retry: true },
    );
  });

  test("processing job polls only through a bounded GET interval", () => {
    const toQuery = (jobs: Array<{ status: "processing" | "completed" | "failed" }> | undefined) => ({
      state: { data: jobs ? { jobs } : undefined },
    }) as unknown as Parameters<typeof documentState.getAdminDocumentPollingInterval>[0];
    assert.equal(documentState.getAdminDocumentPollingInterval(toQuery([
      { status: "processing" },
    ])), 2500);
    assert.equal(documentState.getAdminDocumentPollingInterval(toQuery([
      { status: "completed" },
      { status: "failed" },
    ])), false);
    assert.equal(documentState.getAdminDocumentPollingInterval(toQuery(undefined)), false);
  });

  test("cached document query errors use a safe retry warning", () => {
    assert.equal(documentState.getAdminDocumentQueryWarning(true, new Error("secret provider detail")), "문서 정보를 새로 불러오지 못했습니다. 현재 저장된 내용을 확인하고 다시 시도해 주세요.");
    assert.equal(documentState.getAdminDocumentQueryWarning(false, new Error("secret provider detail")), undefined);
  });

  test("screen renders empty, processing, and safe cached-error states from the shared query", () => {
    const source = readFileSync("src/widgets/admin-project-documents/ui/admin-project-documents.tsx", "utf8");
    assert.match(source, /adminProjectDocumentQueryKeys\.detail\(projectId, type\)/);
    assert.match(source, /queryKey: documentKey/);
    assert.match(source, /refetchInterval:\s*\(query\)\s*=>\s*getAdminDocumentPollingInterval/);
    assert.match(source, /!document \?/);
    assert.match(source, /status === "processing"/);
    assert.match(source, /getAdminDocumentQueryWarning\(Boolean\(query\.data\), query\.error\)/);
    assert.match(source, /useMutation/);
    assert.match(source, /disabled=\{generation\.isPending\}/);
    assert.match(source, /queryClient\.invalidateQueries\(\{ queryKey: documentKey \}\)/);
  });
});
