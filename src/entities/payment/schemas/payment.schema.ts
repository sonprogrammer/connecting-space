import { z } from "zod";

export const paymentIdSchema = z.uuid();
export const paymentKindSchema = z.enum(["deposit", "balance", "extra"]);
export const paymentStatusSchema = z.enum(["expected", "paid", "overdue", "cancelled"]);

const optionalDate = z.iso.date().optional().or(z.literal(""));
const optionalMemo = z.string().trim().max(4000).optional().or(z.literal(""));

export const createPaymentSchema = z.object({
  kind: paymentKindSchema,
  amount: z.number().int().positive(),
  dueDate: optionalDate,
  memo: optionalMemo,
});

export const updatePaymentSchema = z
  .object({
    kind: paymentKindSchema.optional(),
    status: paymentStatusSchema.optional(),
    amount: z.number().int().positive().optional(),
    dueDate: optionalDate,
    paidAt: optionalDate,
    memo: optionalMemo,
  })
  .refine((value) => Object.keys(value).length > 0, "At least one payment field is required");

export const createPaymentReceiptSchema = z.object({
  amount: z.number().int().positive(),
  receivedAt: z.iso.datetime({ offset: true }).optional(),
  idempotencyKey: z.uuid(),
  memo: optionalMemo,
});

export const updatePaymentReceiptSchema = z
  .object({
    amount: z.number().int().positive().optional(),
    receivedAt: z.iso.datetime({ offset: true }).optional(),
    memo: optionalMemo,
  })
  .refine((value) => Object.keys(value).length > 0, "At least one receipt field is required");

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type CreatePaymentReceiptInput = z.infer<typeof createPaymentReceiptSchema>;
export type UpdatePaymentReceiptInput = z.infer<typeof updatePaymentReceiptSchema>;
