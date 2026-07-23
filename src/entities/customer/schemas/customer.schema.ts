import { z } from "zod";

export const customerIdSchema = z.uuid();

export const createCustomerSchema = z.object({
  inquiryId: z.uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  email: z.email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  companyName: z.string().trim().max(120).optional().or(z.literal("")),
  websiteUrl: z.url().max(500).optional().or(z.literal("")),
  memo: z.string().trim().max(4000).optional().or(z.literal("")),
});

export const updateCustomerSchema = createCustomerSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one customer field is required",
);

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
