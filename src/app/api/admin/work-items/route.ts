import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

const workItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  group: z.enum(["all", "newInquiry", "quote", "projectConversion", "overduePayment"]).default("all"),
  asOf: z.string().datetime({ offset: true }).optional(),
});

export async function GET(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request);
  if (!admin.ok) {
    return admin.response;
  }

  const parsed = workItemsQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
    group: request.nextUrl.searchParams.get("group") ?? undefined,
    asOf: request.nextUrl.searchParams.get("asOf") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", "Invalid work items query", 400, parsed.error.flatten());
  }

  const { data, error } = await admin.supabase.rpc("get_admin_work_items", {
    p_page: parsed.data.page,
    p_page_size: parsed.data.pageSize,
    p_group: parsed.data.group,
    ...(parsed.data.asOf ? { p_now: parsed.data.asOf } : {}),
  });
  if (error || !data) {
    const status = error?.code === "42501" ? 403 : error?.code === "22023" ? 400 : 500;
    return jsonError("ADMIN_WORK_ITEMS_READ_FAILED", "Failed to load admin work items", status);
  }

  return jsonOk(data);
}
