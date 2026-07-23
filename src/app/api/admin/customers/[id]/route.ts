import type { NextRequest } from "next/server";

import {
  customerIdSchema,
  type AdminCustomerDetail,
  type AdminCustomerUpdateResponse,
  updateCustomerSchema,
} from "@/entities/customer";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import type { Database } from "@/shared/types/database.generated";

type AdminCustomerRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function getValidCustomerId(context: AdminCustomerRouteContext) {
  const { id } = await context.params;
  const parsed = customerIdSchema.safeParse(id);

  if (!parsed.success) {
    return {
      ok: false as const,
      response: jsonError(
        "INVALID_CUSTOMER_ID",
        "Invalid customer id",
        400,
        parsed.error.flatten(),
      ),
    };
  }

  return {
    ok: true as const,
    id: parsed.data,
  };
}

export async function GET(
  request: NextRequest,
  context: AdminCustomerRouteContext,
) {
  const idResult = await getValidCustomerId(context);

  if (!idResult.ok) {
    return idResult.response;
  }

  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const { data, error } = await admin.supabase
    .from("customers")
    .select("*")
    .eq("id", idResult.id)
    .maybeSingle();

  if (error) {
    return jsonError("ADMIN_CUSTOMER_READ_FAILED", error.message, 500);
  }

  if (!data) {
    return jsonError("ADMIN_CUSTOMER_NOT_FOUND", "Customer not found", 404);
  }

  return jsonOk<AdminCustomerDetail>(data);
}

export async function PATCH(
  request: NextRequest,
  context: AdminCustomerRouteContext,
) {
  const idResult = await getValidCustomerId(context);

  if (!idResult.ok) {
    return idResult.response;
  }

  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid customer payload",
      400,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;
  const update: Database["public"]["Tables"]["customers"]["Update"] = {
    ...(input.inquiryId !== undefined ? { inquiry_id: input.inquiryId } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: input.email || null } : {}),
    ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
    ...(input.companyName !== undefined
      ? { company_name: input.companyName || null }
      : {}),
    ...(input.websiteUrl !== undefined
      ? { website_url: input.websiteUrl || null }
      : {}),
    ...(input.memo !== undefined ? { memo: input.memo || null } : {}),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin.supabase
    .from("customers")
    .update(update)
    .eq("id", idResult.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return jsonError("ADMIN_CUSTOMER_UPDATE_FAILED", error.message, 500);
  }

  if (!data) {
    return jsonError("ADMIN_CUSTOMER_NOT_FOUND", "Customer not found", 404);
  }

  return jsonOk<AdminCustomerUpdateResponse>(data);
}
