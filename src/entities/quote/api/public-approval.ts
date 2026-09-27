import { z } from "zod";

export const publicQuoteApprovalSchema = z.object({
  approverName: z.string().trim().min(1).max(100).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "invalid approver name"),
  consentAccepted: z.literal(true),
}).strict();

export type PublicQuoteApprovalInput = z.infer<typeof publicQuoteApprovalSchema>;
export const PUBLIC_CONSENT_VERSION = "2026-09-14";
