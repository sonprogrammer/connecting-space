import type { ApiResponse } from "@/shared/types/api";
import type { ProjectDocumentKind, ProjectDocumentContent } from "../index";

export type AdminProjectDocument = {
  id: string;
  project_id: string;
  kind: ProjectDocumentKind;
  revision: number;
  version_count: number;
  content: ProjectDocumentContent | null;
};

export type AdminProjectDocumentVersion = {
  document_id: string;
  version: number;
  source: "generated" | "manual";
  request_key: string;
  content: ProjectDocumentContent;
  created_by: string | null;
  created_at: string;
};

export type AdminProjectDocumentVersionSummary = Omit<AdminProjectDocumentVersion, "content">;

export type AdminProjectDocumentJob = {
  id: string;
  request_key: string;
  status: "processing" | "completed" | "failed";
  base_revision: number;
  version: number | null;
  applied: boolean;
  attempt_count: number;
  history: Array<{
    attempt: number;
    provider: string | null;
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    errorCode: string | null;
    at: string;
  }>;
  created_at: string;
};

export type AdminProjectDocumentResponse = {
  document: AdminProjectDocument | null;
  versions: AdminProjectDocumentVersionSummary[];
  pagination: { page: number; pageSize: number; total: number };
  jobs: AdminProjectDocumentJob[];
};

export type AdminProjectDocumentGenerationInput = {
  type: ProjectDocumentKind;
  requestKey: string;
  retry?: boolean;
};

export type AdminProjectDocumentSaveInput = {
  type: ProjectDocumentKind;
  requestKey: string;
  expectedRevision: number;
  content: { title: string; summary: string; scopeItems: string[] };
};

export class AdminDocumentQueryError extends Error {
  readonly status: number;
  readonly code: string;
  readonly isAuthExpired: boolean;

  constructor(status: number, code: string) {
    super(status === 401 || status === 403
      ? "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요."
      : "문서 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    this.name = "AdminDocumentQueryError";
    this.status = status;
    this.code = code;
    this.isAuthExpired = status === 401 || status === 403;
  }
}

export const adminProjectDocumentQueryKeys = {
  all: ["admin", "project-documents"] as const,
  details: () => [...adminProjectDocumentQueryKeys.all, "detail"] as const,
  detail: (projectId: string, type: ProjectDocumentKind, page = 1) =>
    [...adminProjectDocumentQueryKeys.details(), projectId, type, { page, pageSize: 20 }] as const,
  version: (projectId: string, type: ProjectDocumentKind, version: number) =>
    [...adminProjectDocumentQueryKeys.details(), projectId, type, "version", version] as const,
};

async function parseAdminDocumentResponse<T>(response: Response): Promise<T> {
  let payload: ApiResponse<T>;
  try {
    payload = await response.json() as ApiResponse<T>;
  } catch {
    throw new AdminDocumentQueryError(response.status, "INVALID_RESPONSE");
  }
  if (!response.ok || "error" in payload) {
    throw new AdminDocumentQueryError(
      response.status,
      "error" in payload ? payload.error.code : "ADMIN_DOCUMENT_REQUEST_FAILED",
    );
  }
  return payload.data;
}

function documentsUrl(projectId: string, query: URLSearchParams) {
  return `/api/admin/projects/${encodeURIComponent(projectId)}/documents?${query.toString()}`;
}

export function fetchAdminProjectDocument(projectId: string, type: ProjectDocumentKind, page = 1) {
  const query = new URLSearchParams({ type, page: String(page), pageSize: "20" });
  return fetch(documentsUrl(projectId, query), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  }).then((response) => parseAdminDocumentResponse<AdminProjectDocumentResponse>(response));
}

export function fetchAdminProjectDocumentVersion(projectId: string, type: ProjectDocumentKind, version: number) {
  const query = new URLSearchParams({ type, version: String(version) });
  return fetch(documentsUrl(projectId, query), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  }).then((response) => parseAdminDocumentResponse<AdminProjectDocumentVersion>(response));
}

export function generateAdminProjectDocument(projectId: string, input: AdminProjectDocumentGenerationInput) {
  return fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/documents`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((response) => parseAdminDocumentResponse<AdminProjectDocumentJob>(response));
}

export function saveAdminProjectDocument(projectId: string, input: AdminProjectDocumentSaveInput) {
  return fetch(`/api/admin/projects/${encodeURIComponent(projectId)}/documents`, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((response) => parseAdminDocumentResponse<AdminProjectDocumentVersion>(response));
}
