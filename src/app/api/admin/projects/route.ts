import type { NextRequest } from "next/server";

import {
  createProjectSchema,
  type AdminProjectCreateResponse,
  type AdminProjectListItem,
} from "@/entities/project";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

export async function GET(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const { data, error } = await admin.supabase
    .from("projects")
    .select(
      "id, customer_id, inquiry_id, name, status, contract_amount, expected_launch_date, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return jsonError("ADMIN_PROJECTS_READ_FAILED", error.message, 500);
  }

  return jsonOk<AdminProjectListItem[]>(data);
}

export async function POST(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid project payload",
      400,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;
  const { data, error } = await admin.supabase
    .from("projects")
    .insert({
      customer_id: input.customerId,
      inquiry_id: input.inquiryId ?? null,
      name: input.name,
      description: input.description || null,
      status: input.status ?? "planning",
      contract_amount: input.contractAmount ?? 0,
      expected_start_date: input.expectedStartDate || null,
      expected_launch_date: input.expectedLaunchDate || null,
      launched_at: input.launchedAt || null,
      memo: input.memo || null,
    })
    .select("*")
    .single();

  if (error) {
    return jsonError("ADMIN_PROJECT_CREATE_FAILED", error.message, 500);
  }

  return jsonOk<AdminProjectCreateResponse>(data, { status: 201 });
}
