import type {
  AdminProjectDocumentGenerationInput,
  AdminProjectDocumentJob,
  AdminProjectDocument,
  AdminProjectDocumentResponse,
  AdminProjectDocumentVersionSummary,
  ProjectDocumentContent,
  ProjectDocumentKind,
} from "@/entities/document";
import { AdminDocumentQueryError } from "@/entities/document";

export function buildAdminDocumentGenerationInput(
  type: ProjectDocumentKind,
  latestJob: AdminProjectDocumentJob | undefined,
  createRequestKey: () => string = () => crypto.randomUUID(),
): AdminProjectDocumentGenerationInput {
  if (latestJob?.status === "failed") {
    return { type, requestKey: latestJob.request_key, retry: true };
  }
  return { type, requestKey: createRequestKey() };
}

export function collectAdminDocumentVersions(
  pages: readonly (AdminProjectDocumentResponse | undefined)[],
): AdminProjectDocumentVersionSummary[] {
  const seen = new Set<string>();
  return pages.flatMap((page) => page?.versions ?? []).filter((version) => {
    const key = `${version.document_id}:${version.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getAdminDocumentPollingInterval(query: {
  state: { data?: { jobs: Array<Pick<AdminProjectDocumentJob, "status">> } };
}) {
  return query.state.data?.jobs.some((job) => job.status === "processing") ? 2500 : false;
}

export function getAdminDocumentQueryWarning(hasCachedData: boolean, error: unknown) {
  if (!error) return undefined;
  if (error instanceof AdminDocumentQueryError && error.isAuthExpired) {
    return error.message;
  }
  if (!hasCachedData) return undefined;
  return "문서 정보를 새로 불러오지 못했습니다. 현재 저장된 내용을 확인하고 다시 시도해 주세요.";
}

export type AdminDocumentNarrative = Pick<ProjectDocumentContent, "title" | "summary" | "scopeItems">;

export type AdminDocumentEditorState = {
  baseRevision: number;
  base: AdminDocumentNarrative;
  value: AdminDocumentNarrative;
};

export function isAdminDocumentEditorDirty(editor: AdminDocumentEditorState) {
  return JSON.stringify(editor.base) !== JSON.stringify(editor.value);
}

export function reconcileAdminDocumentEditor(
  editor: AdminDocumentEditorState | null,
  document: AdminProjectDocument | null | undefined,
): AdminDocumentEditorState | null {
  if (!document?.content) {
    return editor && isAdminDocumentEditorDirty(editor) ? editor : null;
  }
  if (editor && document.revision < editor.baseRevision) return editor;
  if (editor && isAdminDocumentEditorDirty(editor)) return editor;

  const narrative: AdminDocumentNarrative = {
    title: document.content.title,
    summary: document.content.summary,
    scopeItems: [...document.content.scopeItems],
  };
  return { baseRevision: document.revision, base: narrative, value: narrative };
}

export function rebaseAdminDocumentEditor(
  editor: AdminDocumentEditorState,
  document: AdminProjectDocument,
): AdminDocumentEditorState {
  if (!document.content) return editor;
  return {
    baseRevision: document.revision,
    base: {
      title: document.content.title,
      summary: document.content.summary,
      scopeItems: [...document.content.scopeItems],
    },
    value: editor.value,
  };
}

export function getAdminDocumentSaveErrorMessage(error: unknown) {
  if (error instanceof AdminDocumentQueryError) {
    if (error.status === 409) return "최신 문서와 충돌했습니다. 저장하지 않은 내용을 보존했습니다. 최신 상태를 확인해 다시 저장해 주세요.";
    if (error.isAuthExpired) return error.message;
  }
  return "문서를 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.";
}

export function buildAdminDocumentCopyText(content: ProjectDocumentContent) {
  return [
    content.title,
    content.summary,
    content.scopeItems.map((item) => `• ${item}`).join("\n"),
    content.reviewNotice,
    content.needsConfirmation.map((item) => `확인 필요: ${item.question}`).join("\n"),
  ].filter(Boolean).join("\n\n");
}
