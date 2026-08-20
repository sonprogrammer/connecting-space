import type { NextRequest } from "next/server";
import { z } from "zod";
import { mapService, serviceInputToRow } from "@/entities/automation/api/contracts";
import { updateServiceOfferingSchema } from "@/entities/automation/schemas/content.schema";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

type Context = { params: Promise<{ id: string }> };
async function idFrom(context: Context) { return z.string().uuid().safeParse((await context.params).id); }
export async function GET(request: NextRequest, context: Context) {
  const id = await idFrom(context); if (!id.success) return jsonError("INVALID_SERVICE_OFFERING_ID", "Invalid service offering id", 400);
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const { data, error } = await admin.supabase.from("service_offerings").select("*").eq("id", id.data).maybeSingle();
  if (error) return jsonError("ADMIN_SERVICE_OFFERING_READ_FAILED", "Failed to read service offering", 500);
  if (!data) return jsonError("SERVICE_OFFERING_NOT_FOUND", "Service offering not found", 404);
  return jsonOk(mapService(data, true));
}
export async function PATCH(request: NextRequest, context: Context) {
  const id = await idFrom(context); if (!id.success) return jsonError("INVALID_SERVICE_OFFERING_ID", "Invalid service offering id", 400);
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const parsed = updateServiceOfferingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid service offering payload", 400, parsed.error.flatten());
  const { data, error } = await admin.supabase.from("service_offerings").update(serviceInputToRow(parsed.data)).eq("id", id.data).select("*").maybeSingle();
  if (error?.code === "23505") return jsonError("SERVICE_OFFERING_SLUG_CONFLICT", "Service offering slug already exists", 409);
  if (error) return jsonError("ADMIN_SERVICE_OFFERING_UPDATE_FAILED", "Failed to update service offering", 500);
  if (!data) return jsonError("SERVICE_OFFERING_NOT_FOUND", "Service offering not found", 404);
  return jsonOk(mapService(data, true));
}
