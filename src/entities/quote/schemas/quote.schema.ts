import { z } from "zod";

const moneySchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const optionalDateSchema = z
  .union([z.iso.date(), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null);

export const quoteIdSchema = z.uuid();
export const quoteVersionIdSchema = z.uuid();

export const quoteSnapshotSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10_000),
    scopeItems: z
      .array(z.string().trim().min(1).max(500))
      .min(1)
      .max(100),
    totalAmount: moneySchema.positive(),
    estimatedStartDate: optionalDateSchema,
    estimatedEndDate: optionalDateSchema,
    depositAmount: moneySchema,
    balanceAmount: moneySchema,
    depositTerms: z.string().trim().min(1).max(1000),
    balanceTerms: z.string().trim().min(1).max(1000),
  })
  .superRefine((value, context) => {
    if (value.depositAmount + value.balanceAmount !== value.totalAmount) {
      context.addIssue({
        code: "custom",
        path: ["balanceAmount"],
        message: "Deposit and balance must equal the total amount",
      });
    }

    if (
      value.estimatedStartDate &&
      value.estimatedEndDate &&
      value.estimatedEndDate < value.estimatedStartDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["estimatedEndDate"],
        message: "Estimated end date must not be before the start date",
      });
    }
  });

export const createQuoteSchema = z.object({
  inquiryId: z.uuid(),
  ...quoteSnapshotSchema.shape,
});

export type QuoteSnapshotInput = z.infer<typeof quoteSnapshotSchema>;
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
