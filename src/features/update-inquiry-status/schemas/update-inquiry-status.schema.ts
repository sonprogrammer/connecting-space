import { z } from "zod";

export const inquiryStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "converted",
  "closed",
]);

export const updateInquiryStatusSchema = z.object({
  status: inquiryStatusSchema,
  adminNotes: z.string().trim().max(4000).nullable().optional(),
});

export type UpdateInquiryStatusInput = z.infer<
  typeof updateInquiryStatusSchema
>;
