import type { NextRequest } from "next/server";
import { createFaqSchema } from "@/entities/automation/schemas/content.schema";
import { faqInputToRow, mapFaq } from "@/entities/automation/api/contracts";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import type { Database } from "@/shared/types/database.generated";

export async function GET(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const { data, error } = await admin.supabase.from("faq_items").select("*").order("sort_order").order("updated_at", { ascending: false }).limit(100);
  if (error) return jsonError("ADMIN_FAQS_READ_FAILED", "Failed to read FAQ items", 500);
  return jsonOk(data.map((row) => mapFaq(row, true)));
}
export async function POST(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const parsed = createFaqSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid FAQ payload", 400, parsed.error.flatten());
  const row = faqInputToRow(parsed.data) as Database["public"]["Tables"]["faq_items"]["Insert"];
  const { data, error } = await admin.supabase.from("faq_items").insert(row).select("*").single();
  if (error) return jsonError("ADMIN_FAQ_CREATE_FAILED", "Failed to create FAQ item", 500);
  return jsonOk(mapFaq(data, true), { status: 201 });
}
