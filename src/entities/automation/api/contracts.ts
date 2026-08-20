import type { z } from "zod";
import type { Database, Json } from "@/shared/types/database.generated";
import type { createFaqSchema, createServiceOfferingSchema, updateFaqSchema, updateServiceOfferingSchema } from "../schemas/content.schema";

export type ServiceInput = z.infer<typeof createServiceOfferingSchema> | z.infer<typeof updateServiceOfferingSchema>;
export type FaqInput = z.infer<typeof createFaqSchema> | z.infer<typeof updateFaqSchema>;
type ServiceRow = Database["public"]["Tables"]["service_offerings"]["Row"];
type FaqRow = Database["public"]["Tables"]["faq_items"]["Row"];

export function serviceInputToRow(input: ServiceInput) {
  return {
    ...(input.slug !== undefined ? { slug: input.slug } : {}), ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}), ...(input.priceLabel !== undefined ? { price_label: input.priceLabel } : {}),
    ...(input.priceMin !== undefined ? { price_min: input.priceMin } : {}), ...(input.priceMax !== undefined ? { price_max: input.priceMax } : {}),
    ...(input.durationLabel !== undefined ? { duration_label: input.durationLabel } : {}),
    ...(input.includedItems !== undefined ? { included_items: input.includedItems as Json } : {}),
    ...(input.excludedItems !== undefined ? { excluded_items: input.excludedItems as Json } : {}),
    ...(input.aiGuidance !== undefined ? { ai_guidance: input.aiGuidance || null } : {}),
    ...(input.isPublished !== undefined ? { is_published: input.isPublished } : {}), ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
  };
}
export function faqInputToRow(input: FaqInput) {
  return { ...(input.question !== undefined ? { question: input.question } : {}), ...(input.answer !== undefined ? { answer: input.answer } : {}),
    ...(input.aiGuidance !== undefined ? { ai_guidance: input.aiGuidance || null } : {}), ...(input.isPublished !== undefined ? { is_published: input.isPublished } : {}),
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}) };
}
export function mapService(row: ServiceRow, includeInternal = false) {
  return { id: row.id, slug: row.slug, name: row.name, description: row.description, priceLabel: row.price_label,
    priceMin: row.price_min, priceMax: row.price_max, durationLabel: row.duration_label,
    includedItems: row.included_items, excludedItems: row.excluded_items, isPublished: row.is_published, sortOrder: row.sort_order,
    ...(includeInternal ? { aiGuidance: row.ai_guidance, createdAt: row.created_at, updatedAt: row.updated_at } : {}) };
}
export function mapFaq(row: FaqRow, includeInternal = false) {
  return { id: row.id, question: row.question, answer: row.answer, isPublished: row.is_published, sortOrder: row.sort_order,
    ...(includeInternal ? { aiGuidance: row.ai_guidance, createdAt: row.created_at, updatedAt: row.updated_at } : {}) };
}
