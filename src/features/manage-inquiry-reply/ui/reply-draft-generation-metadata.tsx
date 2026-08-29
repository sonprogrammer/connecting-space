import type { InquiryReplyDraft } from "../../../entities/automation/model/frontend";

export function ReplyDraftGenerationMetadata({
  generationRecord,
}: Readonly<{
  generationRecord: InquiryReplyDraft["generationRecord"];
}>) {
  if (!generationRecord) {
    return (
      <p className="sm:col-span-2 xl:col-span-3">
        생성 메타데이터 없음
      </p>
    );
  }

  return (
    <>
      <p>
        제공자: <strong className="break-all text-[#3c4941]">{generationRecord.provider}</strong>
      </p>
      <p>
        모델: <strong className="break-all text-[#3c4941]">{generationRecord.model}</strong>
      </p>
      <p>
        생성 시각:{" "}
        <time dateTime={generationRecord.createdAt} className="font-semibold text-[#3c4941]">
          {formatDateTime(generationRecord.createdAt)}
        </time>
      </p>
    </>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
