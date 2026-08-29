import type { AdminInquiryReplyDraftResponse } from "../api/contracts";

export type ServiceOffering = {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceLabel: string;
  priceMin: number | null;
  priceMax: number | null;
  durationLabel: string;
  includedItems: string[];
  excludedItems: string[];
  isPublished: boolean;
  sortOrder: number;
};

export type AdminServiceOffering = ServiceOffering & {
  aiGuidance: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  isPublished: boolean;
  sortOrder: number;
};

export type AdminFaqItem = FaqItem & {
  aiGuidance: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConfirmationItem = {
  topic: string;
  reason: string;
  suggestedQuestion: string;
};

export type SlackDelivery = {
  id: string;
  inquiry_id: string;
  draft_id: string;
  channel: "slack";
  status: "pending" | "processing" | "retry" | "sent" | "failed";
  attempt_count: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InquiryReplyDraft = {
  id: string;
  inquiryId: string;
  generationRecordId: string | null;
  generationRecord: AdminInquiryReplyDraftResponse["generationRecord"];
  summary: string;
  draft: string;
  needsConfirmation: ConfirmationItem[];
  status: "generating" | "ready" | "failed";
  lastError: string | null;
  updatedAt: string;
  generationJob: AdminInquiryReplyDraftResponse["generationJob"];
  slackDelivery: SlackDelivery | null;
};
