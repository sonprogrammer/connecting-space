import { z } from "zod";

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalTrimmed = (max: number) => z.string().trim().max(max).nullable().optional();
const stringItems = z.array(z.string().trim().min(1).max(200)).max(50);

const serviceFields = {
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  name: trimmed(120), description: trimmed(2000), priceLabel: trimmed(120),
  priceMin: z.number().int().nonnegative().nullable().optional(),
  priceMax: z.number().int().nonnegative().nullable().optional(),
  durationLabel: trimmed(120), includedItems: stringItems, excludedItems: stringItems,
  aiGuidance: optionalTrimmed(3000), isPublished: z.boolean(), sortOrder: z.number().int().nonnegative(),
};

function validPriceRange(value: { priceMin?: number | null; priceMax?: number | null }) {
  return value.priceMin == null || value.priceMax == null || value.priceMin <= value.priceMax;
}

export const createServiceOfferingSchema = z.object(serviceFields).strict().refine(validPriceRange, {
  message: "priceMin must not exceed priceMax", path: ["priceMax"],
});
export const updateServiceOfferingSchema = z.object(serviceFields).partial().strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required")
  .refine(validPriceRange, { message: "priceMin must not exceed priceMax", path: ["priceMax"] });

const faqFields = {
  question: trimmed(500), answer: trimmed(4000), aiGuidance: optionalTrimmed(3000),
  isPublished: z.boolean(), sortOrder: z.number().int().nonnegative(),
};
export const createFaqSchema = z.object(faqFields).strict();
export const updateFaqSchema = z.object(faqFields).partial().strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const updateReplyDraftSchema = z.object({
  summary: z.string().trim().max(2000).optional(),
  draft: z.string().trim().min(1).max(12000).optional(),
  needsConfirmation: z.array(z.object({
    topic: trimmed(200), reason: trimmed(1000), suggestedQuestion: trimmed(1000),
  }).strict()).max(30).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");
