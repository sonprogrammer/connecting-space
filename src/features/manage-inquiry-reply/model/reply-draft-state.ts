import type { ApiFailure } from "../../../shared/types/api";

export type DraftViewStatus = "missing" | "generating" | "ready" | "failed";

export function getDraftStatusCopy(status: DraftViewStatus) {
  const copy = {
    missing: { title: "AI 초안 생성 대기", description: "아직 생성된 답변 초안이 없습니다." },
    generating: { title: "AI 초안 생성 중", description: "문의와 운영 기준을 바탕으로 답변을 작성하고 있습니다." },
    ready: { title: "AI 답변 초안", description: "발송 전 내용을 검토하고 필요한 부분을 수정해 주세요." },
    failed: { title: "AI 초안 생성 실패", description: "오류 내용을 확인한 뒤 다시 생성할 수 있습니다." },
  } as const;
  return copy[status];
}

export function getSlackDeliveryPresentation(delivery: {
  status: "pending" | "processing" | "retry" | "sent" | "failed";
  attempt_count: number; last_error: string | null; sent_at: string | null;
} | null) {
  if (!delivery) return { label: "Slack 전송 기록 없음", tone: "neutral" as const, canRetry: false };
  const values = {
    pending: { label: "Slack 전송 대기", tone: "warning" as const, canRetry: false },
    processing: { label: "Slack 전송 중", tone: "warning" as const, canRetry: false },
    retry: { label: "Slack 재시도 대기", tone: "warning" as const, canRetry: false },
    sent: { label: "Slack 전송 완료", tone: "success" as const, canRetry: false },
    failed: { label: "Slack 전송 실패", tone: "danger" as const, canRetry: true },
  };
  return values[delivery.status];
}

export function getReplyDraftFailure(status: number, result: ApiFailure) {
  if (status === 401 || status === 403) return "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.";
  if (result.error.code === "VALIDATION_ERROR") return "답변 초안을 확인해 주세요.";
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
