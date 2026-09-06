import type { NextRequest } from "next/server";

import type { AdminInquiryListItem } from "@/entities/inquiry";
import { adminCreateInquirySchema } from "@/entities/inquiry/schemas/admin-inquiry.schema";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import { verifyAdminAccessToken } from "@/shared/lib/auth/admin";
import { getAdminAccessTokenFromRequest } from "@/shared/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export async function GET(request: NextRequest) {
  const accessToken = getAdminAccessTokenFromRequest(request);
  const auth = await verifyAdminAccessToken(accessToken);

  if (!auth.ok) {
    return jsonError("ADMIN_AUTH_REQUIRED", auth.message, auth.status);
  }

  const supabase = createSupabaseServerClient(accessToken);
  const { data, error } = await supabase
    .from("inquiries")
    .select(
      "id, customer_name, email, phone, company_name, service_type, status, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return jsonError("ADMIN_INQUIRIES_READ_FAILED", error.message, 500);
  }

  return jsonOk<AdminInquiryListItem[]>(data);
}

export async function POST(request: NextRequest) {
  const verified = await getVerifiedAdminSupabase(request);
  if (!verified.ok) {
    return verified.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = adminCreateInquirySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid inquiry payload",
      400,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;
  const { data, error } = await verified.supabase
    .from("inquiries")
    .insert({
      customer_name: input.customerName,
      email: input.email || null,
      phone: input.phone || null,
      company_name: input.companyName || null,
      website_url: input.websiteUrl || null,
      service_type: input.serviceType,
      budget_min: input.budgetMin ?? null,
      budget_max: input.budgetMax ?? null,
      desired_launch_date: input.desiredLaunchDate || null,
      message: input.message,
      source: input.source,
      admin_notes: input.adminNotes || null,
    })
    .select("id,status")
    .single();

  if (error || !data) {
    return jsonError(
      "ADMIN_INQUIRY_CREATE_FAILED",
      "Failed to create inquiry",
      500,
    );
  }

  return jsonOk(data, { status: 201 });
}
