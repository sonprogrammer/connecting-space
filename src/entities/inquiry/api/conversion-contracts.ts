import { z } from "zod";

export const inquiryIdSchema = z.uuid();

export const convertInquirySchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  customerMemo: z.string().trim().max(4000).optional().or(z.literal("")),
  projectName: z.string().trim().min(1).max(160),
  contractAmount: z.number().int().nonnegative(),
  expectedLaunchDate: z.iso.date().optional().or(z.literal("")),
  projectMemo: z.string().trim().max(4000).optional().or(z.literal("")),
});

export type ConvertInquiryInput = z.infer<typeof convertInquirySchema>;

export type ConvertInquiryResponse = {
  inquiry_id: string;
  customer_id: string;
  project_id: string;
  reused_customer: boolean;
  reused_project: boolean;
};
