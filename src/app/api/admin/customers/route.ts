import type { NextRequest } from "next/server";

import {
  createCustomerSchema,
  type AdminCustomerCreateResponse,
  type AdminCustomerListItem,
  type AdminCustomerListResponse,
} from "@/entities/customer";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import { paginatedResponse, parseListQuery } from "@/shared/api/list-query";

export async function GET(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const query = parseListQuery(request.nextUrl.searchParams, {
    sortFields: ["created_at", "name", "company_name"],
  });
  if (!query.ok) return jsonError("VALIDATION_ERROR", "Invalid customer list query", 400, { errors: query.errors });

  const { q, page, pageSize, sort, direction } = query.value;
  let builder = admin.supabase
    .from("customers")
    .select(
      "id, inquiry_id, name, email, phone, company_name, website_url, created_at, updated_at",
      { count: "exact" },
    );
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    builder = builder.or(`name.ilike.*${safe}*,company_name.ilike.*${safe}*,email.ilike.*${safe}*,phone.ilike.*${safe}*,website_url.ilike.*${safe}*`);
  }
  const { data, error, count } = await builder
    .order(sort as "created_at" | "name" | "company_name", { ascending: direction === "asc" })
    .order("id", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    return jsonError("ADMIN_CUSTOMERS_READ_FAILED", error.message, 500);
  }

  return jsonOk<AdminCustomerListResponse>(paginatedResponse(data as AdminCustomerListItem[], count ?? 0, query.value));
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
