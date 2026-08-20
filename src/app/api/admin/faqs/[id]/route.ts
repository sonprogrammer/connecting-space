import type { NextRequest } from "next/server";
import { z } from "zod";
import { faqInputToRow, mapFaq } from "@/entities/automation/api/contracts";
import { updateFaqSchema } from "@/entities/automation/schemas/content.schema";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

type Context = { params: Promise<{ id: string }> };
async function idFrom(context: Context) { return z.string().uuid().safeParse((await context.params).id); }
export async function GET(request: NextRequest, context: Context) {
  const id = await idFrom(context); if (!id.success) return jsonError("INVALID_FAQ_ID", "Invalid FAQ id", 400);
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const { data, error } = await admin.supabase.from("faq_items").select("*").eq("id", id.data).maybeSingle();
  if (error) return jsonError("ADMIN_FAQ_READ_FAILED", "Failed to read FAQ item", 500);
  if (!data) return jsonError("FAQ_NOT_FOUND", "FAQ item not found", 404);
  return jsonOk(mapFaq(data, true));
}
export async function PATCH(request: NextRequest, context: Context) {
  const id = await idFrom(context); if (!id.success) return jsonError("INVALID_FAQ_ID", "Invalid FAQ id", 400);
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const parsed = updateFaqSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid FAQ payload", 400, parsed.error.flatten());
  const { data, error } = await admin.supabase.from("faq_items").update(faqInputToRow(parsed.data)).eq("id", id.data).select("*").maybeSingle();
  if (error) return jsonError("ADMIN_FAQ_UPDATE_FAILED", "Failed to update FAQ item", 500);
  if (!data) return jsonError("FAQ_NOT_FOUND", "FAQ item not found", 404);
  return jsonOk(mapFaq(data, true));
}
