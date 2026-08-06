import { z } from "zod";

const optionalHttpUrl = z
  .union([z.literal(""), z.url().max(500)])
  .refine(
    (value) => value === "" || /^https?:\/\//.test(value),
    "URL must use http or https",
  );

export const portfolioIdSchema = z.uuid();

export const createPortfolioSchema = z.object({
  projectId: z.uuid().optional().nullable(),
  title: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().trim().max(1000).optional().or(z.literal("")),
  imageUrl: optionalHttpUrl.optional(),
  siteUrl: optionalHttpUrl.optional(),
  industry: z.string().trim().max(80).optional().or(z.literal("")),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const updatePortfolioSchema = createPortfolioSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one portfolio field is required",
);

export type CreatePortfolioInput = z.infer<typeof createPortfolioSchema>;
export type UpdatePortfolioInput = z.infer<typeof updatePortfolioSchema>;
