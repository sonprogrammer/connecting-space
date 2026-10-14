export type ReplyDraftFormState = {
  inquiryId: string | null;
  summary: string;
  draft: string;
  serverSummary: string | null;
  serverDraft: string | null;
};

export const emptyReplyDraftFormState: ReplyDraftFormState = {
  inquiryId: null,
  summary: "",
  draft: "",
  serverSummary: null,
  serverDraft: null,
};

export function syncReplyDraftFormState(
  current: ReplyDraftFormState,
  incoming: { inquiryId: string; summary: string; draft: string },
): ReplyDraftFormState {
  const isNewInquiry = current.inquiryId !== incoming.inquiryId;

  return {
    inquiryId: incoming.inquiryId,
    summary:
      isNewInquiry || current.summary === current.serverSummary
        ? incoming.summary
        : current.summary,
    draft:
      isNewInquiry || current.draft === current.serverDraft
        ? incoming.draft
        : current.draft,
    serverSummary: incoming.summary,
    serverDraft: incoming.draft,
  };
}
