import type { NextRequest } from "next/server";

import {
  createCustomerSchema,
  type AdminCustomerCreateResponse,
  type AdminCustomerListItem,
} from "@/entities/customer";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

export async function GET(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const { data, error } = await admin.supabase
    .from("customers")
    .select(
      "id, inquiry_id, name, email, phone, company_name, website_url, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return jsonError("ADMIN_CUSTOMERS_READ_FAILED", error.message, 500);
  }

  return jsonOk<AdminCustomerListItem[]>(data);
}

export async function POST(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid customer payload",
      400,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;
  const { data, error } = await admin.supabase
    .from("customers")
    .insert({
      inquiry_id: input.inquiryId ?? null,
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      company_name: input.companyName || null,
      website_url: input.websiteUrl || null,
      memo: input.memo || null,
    })
    .select("*")
    .single();

  if (error) {
    return jsonError("ADMIN_CUSTOMER_CREATE_FAILED", error.message, 500);
  }

  return jsonOk<AdminCustomerCreateResponse>(data, { status: 201 });
}
