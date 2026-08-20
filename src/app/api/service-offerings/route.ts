import { mapService } from "@/entities/automation/api/contracts";
import { jsonError, jsonOk } from "@/shared/api/response";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/server";

export async function GET() {
  const { data, error } = await createSupabaseAdminClient().from("service_offerings").select("*")
    .eq("is_published", true).order("sort_order").order("created_at");
  if (error) return jsonError("SERVICE_OFFERINGS_READ_FAILED", "Failed to read service offerings", 500);
  return jsonOk(data.map((row) => mapService(row)));
}
