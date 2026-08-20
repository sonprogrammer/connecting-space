import { mapFaq } from "@/entities/automation/api/contracts";
import { jsonError, jsonOk } from "@/shared/api/response";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/server";

export async function GET() {
  const { data, error } = await createSupabaseAdminClient().from("faq_items").select("*")
    .eq("is_published", true).order("sort_order").order("created_at");
  if (error) return jsonError("FAQS_READ_FAILED", "Failed to read FAQ items", 500);
  return jsonOk(data.map((row) => mapFaq(row)));
}
