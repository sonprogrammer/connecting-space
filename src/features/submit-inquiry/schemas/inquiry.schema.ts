import { z } from "zod";

export const createInquirySchema = z.object({
  customerName: z.string().trim().min(1).max(80),
  email: z.email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().min(7).max(40).optional().or(z.literal("")),
  companyName: z.string().trim().max(120).optional().or(z.literal("")),
  websiteUrl: z.url().max(500).optional().or(z.literal("")),
  serviceType: z.string().trim().min(1).max(80),
  budgetMin: z.number().int().nonnegative().optional(),
  budgetMax: z.number().int().nonnegative().optional(),
  desiredLaunchDate: z.iso.date().optional().or(z.literal("")),
  message: z.string().trim().min(10).max(4000),
  source: z.string().trim().max(80).optional().or(z.literal("")),
});

export type CreateInquiryInput = z.infer<typeof createInquirySchema>;
