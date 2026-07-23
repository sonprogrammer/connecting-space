import type { NextRequest } from "next/server";

import type { AdminInquiryListItem } from "@/entities/inquiry";
import { jsonError, jsonOk } from "@/shared/api/response";
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
