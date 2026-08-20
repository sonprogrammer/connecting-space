import type { NextRequest } from "next/server";
import { createServiceOfferingSchema } from "@/entities/automation/schemas/content.schema";
import { mapService, serviceInputToRow } from "@/entities/automation/api/contracts";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import type { Database } from "@/shared/types/database.generated";

export async function GET(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const { data, error } = await admin.supabase.from("service_offerings").select("*").order("sort_order").order("updated_at", { ascending: false }).limit(100);
  if (error) return jsonError("ADMIN_SERVICE_OFFERINGS_READ_FAILED", "Failed to read service offerings", 500);
  return jsonOk(data.map((row) => mapService(row, true)));
}
export async function POST(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const parsed = createServiceOfferingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid service offering payload", 400, parsed.error.flatten());
  const row = serviceInputToRow(parsed.data) as Database["public"]["Tables"]["service_offerings"]["Insert"];
  const { data, error } = await admin.supabase.from("service_offerings").insert(row).select("*").single();
  if (error?.code === "23505") return jsonError("SERVICE_OFFERING_SLUG_CONFLICT", "Service offering slug already exists", 409);
  if (error) return jsonError("ADMIN_SERVICE_OFFERING_CREATE_FAILED", "Failed to create service offering", 500);
  return jsonOk(mapService(data, true), { status: 201 });
}
