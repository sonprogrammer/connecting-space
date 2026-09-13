import { z } from "zod";

export const confirmQuoteContractSchema = z.object({
  idempotencyKey: z.uuid(),
  confirmedAt: z.iso.datetime({ offset: true }),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerMemo: z.string().trim().max(4000).optional(),
  projectName: z.string().trim().min(1).max(160).optional(),
  projectMemo: z.string().trim().max(4000).optional(),
  depositPercentage: z.number().int().min(0).max(100).optional(),
  balancePercentage: z.number().int().min(0).max(100).optional(),
  depositAmount: z.number().int().nonnegative().optional(),
  balanceAmount: z.number().int().nonnegative().optional(),
  depositDueDate: z.iso.date().optional().nullable(),
  balanceDueDate: z.iso.date().optional().nullable(),
}).strict();

export type ConfirmQuoteContractInput = z.infer<typeof confirmQuoteContractSchema>;

export type ConfirmQuoteContractResponse = {
  quoteId: string;
  quoteVersionId: string;
  confirmationId: string;
  customerId: string;
  projectId: string;
  depositPaymentId: string;
  balancePaymentId: string;
  status: "approved";
  reused: boolean;
};
