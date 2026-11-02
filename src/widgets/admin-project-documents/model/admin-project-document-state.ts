import type {
  AdminProjectDocumentGenerationInput,
  AdminProjectDocumentJob,
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
