import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { registerPathAlias } from "./helpers/register-path-alias";
registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const documentState = require("../src/widgets/admin-project-documents/model/admin-project-document-state") as typeof import("../src/widgets/admin-project-documents/model/admin-project-document-state");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const documentApi = require("../src/entities/document") as typeof import("../src/entities/document");

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

  test("dirty editor draft survives a background refetch with a newer server revision", () => {
    const serverDocument = makeDocument(2, "Server title");
    const dirtyEditor = {
      baseRevision: 1,
      base: { title: "Original", summary: "Original summary", scopeItems: ["Original scope"] },
      value: { title: "My unsaved title", summary: "My summary", scopeItems: ["My scope"] },
    };
    assert.deepEqual(documentState.reconcileAdminDocumentEditor(dirtyEditor, serverDocument), dirtyEditor);
    assert.equal(documentState.isAdminDocumentEditorDirty(dirtyEditor), true);
  });

  test("clean editor adopts a new server revision after refetch", () => {
    const editor = {
      baseRevision: 1,
      base: { title: "Old", summary: "Old summary", scopeItems: ["Old scope"] },
      value: { title: "Old", summary: "Old summary", scopeItems: ["Old scope"] },
    };
    assert.deepEqual(documentState.reconcileAdminDocumentEditor(editor, makeDocument(2, "Updated")), {
      baseRevision: 2,
      base: { title: "Updated", summary: "Server summary", scopeItems: ["Server scope"] },
      value: { title: "Updated", summary: "Server summary", scopeItems: ["Server scope"] },
    });
  });

  test("revision conflict exposes a safe message without clearing the editor", () => {
    const dirtyEditor = {
      baseRevision: 1,
      base: { title: "Original", summary: "Original summary", scopeItems: ["Original scope"] },
      value: { title: "Unsaved", summary: "Unsaved summary", scopeItems: ["Unsaved scope"] },
    };
    const conflict = new documentApi.AdminDocumentQueryError(409, "DOCUMENT_REVISION_CONFLICT");
    assert.match(documentState.getAdminDocumentSaveErrorMessage(conflict), /최신 문서와 충돌/);
    assert.equal(documentState.isAdminDocumentEditorDirty(dirtyEditor), true);
  });

  test("explicitly rebasing an unsaved draft uses the latest revision and keeps user edits", () => {
    const dirtyEditor = {
      baseRevision: 1,
      base: { title: "Original", summary: "Original summary", scopeItems: ["Original scope"] },
      value: { title: "Unsaved", summary: "Unsaved summary", scopeItems: ["Unsaved scope"] },
    };
    assert.deepEqual(documentState.rebaseAdminDocumentEditor(dirtyEditor, makeDocument(2, "Server latest")), {
      baseRevision: 2,
      base: { title: "Server latest", summary: "Server summary", scopeItems: ["Server scope"] },
      value: dirtyEditor.value,
    });
  });

  test("copy includes the review notice and questions but excludes project references", () => {
    assert.equal(documentState.buildAdminDocumentCopyText(makeContent()), [
      "초안 제목",
      "요약 내용",
      "• 범위 항목",
      "검토 전 안내입니다.",
      "확인 필요: 가격 조건을 확인해 주세요.",
    ].join("\n\n"));
  });

  test("editor only saves narrative fields and keeps a successful save clean", () => {
    const source = readFileSync("src/widgets/admin-project-documents/ui/admin-project-documents.tsx", "utf8");
    assert.match(source, /saveAdminProjectDocument\(projectId, input\)/);
    assert.match(source, /expectedRevision:\s*editor\.baseRevision/);
    assert.match(source, /content:\s*editor\.value/);
    assert.match(source, /onSuccess:\s*\(saved, input\)/);
    assert.match(source, /baseRevision:\s*saved\.version/);
    assert.match(source, /adminProjectDocumentQueryKeys\.project\(projectId, input\.type\)/);
    assert.match(source, /buildAdminDocumentCopyText\(\{ \.\.\.document\.content, \.\.\.editor\.value \}\)/);
    const rebaseStart = source.indexOf("const rebaseDraft = () => {");
    const rebaseEnd = source.indexOf("\n  };", rebaseStart);
    assert.ok(rebaseStart >= 0 && rebaseEnd > rebaseStart);
    assert.match(source.slice(rebaseStart, rebaseEnd), /save\.reset\(\)/);
    assert.match(source, /onClick=\{rebaseDraft\}/);
    assert.match(source, /aria-label="제목"/);
    assert.match(source, /aria-label="요약"/);
    assert.match(source, /범위 항목/);
  });

  test("dedicated project document route validates Next 16 promise params", () => {
    const source = readFileSync("src/app/admin/projects/[id]/documents/page.tsx", "utf8");
    assert.match(source, /params:\s*Promise<\{\s*id:\s*string\s*\}>/);
    assert.match(source, /await params/);
    assert.match(source, /projectIdSchema\.safeParse/);
    assert.match(source, /<AdminProjectDocuments projectId=\{parsed\.data\}/);
  });

  test("project editor links to the project-scoped documents route", () => {
    const source = readFileSync("src/widgets/admin-customer-projects/ui/admin-customer-project-manager.tsx", "utf8");
    assert.match(source, /href=\{`\/admin\/projects\/\$\{selectedId\}\/documents`\}/);
    assert.match(source, /제안서·계약서 초안/);
  });

  test("version history opens API-backed read-only content without changing the current editor", () => {
    const source = readFileSync("src/widgets/admin-project-documents/ui/admin-project-documents.tsx", "utf8");
    assert.match(source, /fetchAdminProjectDocumentVersion/);
    assert.match(source, /adminProjectDocumentQueryKeys\.version\(projectId, type, selectedVersion \?\? 0\)/);
    assert.match(source, /enabled:\s*selectedVersion !== null/);
    assert.match(source, /aria-label="이전 버전 이력"/);
    assert.match(source, /읽기 전용/);
    assert.match(source, /setSelectedVersion\(version\.version\)/);
    assert.match(source, /min-w-0/);
    assert.match(source, /Array\.from\(\{ length: historyPage \}/);
    assert.match(source, /getQueryData<AdminProjectDocumentResponse>/);
    assert.match(source, /role="tabpanel" aria-labelledby=\{`document-tab-\$\{type\}`\}/);
    assert.match(source, /fetchProjectDetail\(projectId\)/);
    assert.match(source, /customerProjectQueryKeys\.projects\.detail\(projectId\)/);
    assert.match(source, /xl:grid-cols-\[minmax\(0,2fr\)_minmax\(17rem,1fr\)\]/);
    assert.match(source, /aria-controls="document-panel"/);
    assert.match(source, /aria-readonly="true"/);
  });

  test("version history pages append in server order without duplicate entries", () => {
    const makeVersion = (version: number) => ({
      document_id: "doc-1", version, source: "manual" as const,
      request_key: `request-${version}`, created_by: null, created_at: `2026-10-0${version}T00:00:00Z`,
    });
    assert.deepEqual(documentState.collectAdminDocumentVersions([
      { document: null, versions: [makeVersion(3), makeVersion(2)], pagination: { page: 1, pageSize: 2, total: 3 }, jobs: [] },
      { document: null, versions: [makeVersion(2), makeVersion(1)], pagination: { page: 2, pageSize: 2, total: 3 }, jobs: [] },
    ]).map(({ version }) => version), [3, 2, 1]);
  });

  test("screen renders empty, processing, and safe cached-error states from the shared query", () => {
    const source = readFileSync("src/widgets/admin-project-documents/ui/admin-project-documents.tsx", "utf8");
    assert.match(source, /adminProjectDocumentQueryKeys\.detail\(projectId, type, historyPage\)/);
    assert.match(source, /queryKey: documentKey/);
    assert.match(source, /refetchInterval:\s*\(query\)\s*=>\s*getAdminDocumentPollingInterval/);
    assert.match(source, /!document \?/);
    assert.match(source, /status === "processing"/);
    assert.match(source, /getAdminDocumentQueryWarning\(Boolean\(query\.data\), query\.error\)/);
    assert.match(source, /useMutation/);
    assert.match(source, /disabled=\{generation\.isPending\}/);
    assert.match(source, /queryClient\.invalidateQueries\(\{\s*queryKey: adminProjectDocumentQueryKeys\.project\(projectId, input\.type\)\s*,?\s*\}\)/);
  });
});

function makeContent() {
  return {
    title: "초안 제목", summary: "요약 내용", scopeItems: ["범위 항목"], reviewOnly: true as const,
    reviewNotice: "검토 전 안내입니다.",
    needsConfirmation: [{ category: "price", question: "가격 조건을 확인해 주세요." }],
    references: { contractAmount: 900000, expectedStartDate: "2026-11-01", expectedLaunchDate: null, confirmed: false as const },
  };
}

function makeDocument(revision: number, title: string) {
  return {
    id: "document-1", project_id: "project-1", kind: "proposal" as const, revision,
    version_count: revision, content: { ...makeContent(), title, summary: "Server summary", scopeItems: ["Server scope"] },
  };
}
