import { AlertCircle, CheckCircle2, Clock3, Loader2 } from "lucide-react";

import type { InquiryReplyDraft } from "@/entities/automation";

type GenerationJob = NonNullable<InquiryReplyDraft["generationJob"]>;

const statusPresentation = {
  pending: {
    label: "AI 생성 대기",
    description: "생성 작업이 대기열에 등록되었습니다.",
    icon: Clock3,
    className: "border-[#ead7aa] bg-[#fffbf1] text-[#72551b]",
  },
  processing: {
    label: "AI 생성 중",
    description: "문의와 운영 기준을 바탕으로 답변을 작성하고 있습니다.",
    icon: Loader2,
    className: "border-[#ead7aa] bg-[#fffbf1] text-[#72551b]",
  },
  retry: {
    label: "AI 생성 재시도 대기",
    description: "일시적인 오류로 다음 생성을 준비하고 있습니다.",
    icon: Clock3,
    className: "border-[#ead7aa] bg-[#fffbf1] text-[#72551b]",
  },
  completed: {
    label: "AI 생성 완료",
    description: "최신 AI 답변 초안이 준비되었습니다.",
    icon: CheckCircle2,
    className: "border-[#cfe3d5] bg-[#edf7f0] text-[#23583f]",
  },
  failed: {
    label: "AI 생성 최종 실패",
    description: "오류 내용을 확인한 뒤 다시 생성해 주세요.",
    icon: AlertCircle,
    className: "border-[#f0cdc8] bg-[#fff1ee] text-[#912018]",
  },
} satisfies Record<GenerationJob["status"], {
  label: string;
  description: string;
  icon: typeof AlertCircle;
  className: string;
}>;

export function ReplyDraftGenerationJobStatus({
  generationJob,
  action,
}: Readonly<{
  generationJob: InquiryReplyDraft["generationJob"] | undefined;
  action?: React.ReactNode;
}>) {
  if (!generationJob) return null;

  const presentation = statusPresentation[generationJob.status];
  const Icon = presentation.icon;

  return (
    <div
      role={generationJob.status === "failed" ? "alert" : "status"}
      className={`mt-5 rounded-md border p-4 text-sm ${presentation.className}`}
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden
          className={`mt-0.5 size-5 shrink-0 ${generationJob.status === "processing" ? "animate-spin" : ""}`}
        />
        <div className="min-w-0">
          <h4 className="font-semibold">{presentation.label}</h4>
          <p className="mt-1 leading-6">{presentation.description}</p>
          <p className="mt-2 text-xs">
            시도 {generationJob.attemptCount} / {generationJob.maxAttempts}회
            {generationJob.availableAt ? (
              <>
                {" · 다음 재시도 "}
                <time dateTime={generationJob.availableAt}>{formatDateTime(generationJob.availableAt)}</time>
              </>
            ) : null}
          </p>
          {generationJob.lastError ? <p className="mt-2 break-words text-xs">{generationJob.lastError}</p> : null}
          {generationJob.status === "failed" && action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
