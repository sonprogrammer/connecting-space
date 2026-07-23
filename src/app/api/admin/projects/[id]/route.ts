import type { NextRequest } from "next/server";

import {
  projectIdSchema,
  type AdminProjectDetail,
  type AdminProjectUpdateResponse,
  updateProjectSchema,
} from "@/entities/project";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import type { Database } from "@/shared/types/database.generated";

type AdminProjectRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function getValidProjectId(context: AdminProjectRouteContext) {
  const { id } = await context.params;
  const parsed = projectIdSchema.safeParse(id);

  if (!parsed.success) {
    return {
      ok: false as const,
      response: jsonError(
        "INVALID_PROJECT_ID",
        "Invalid project id",
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
  context: AdminProjectRouteContext,
) {
  const idResult = await getValidProjectId(context);

  if (!idResult.ok) {
    return idResult.response;
  }

  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const { data, error } = await admin.supabase
    .from("projects")
    .select("*")
    .eq("id", idResult.id)
    .maybeSingle();

  if (error) {
    return jsonError("ADMIN_PROJECT_READ_FAILED", error.message, 500);
  }

  if (!data) {
    return jsonError("ADMIN_PROJECT_NOT_FOUND", "Project not found", 404);
  }

  return jsonOk<AdminProjectDetail>(data);
}

export async function PATCH(
  request: NextRequest,
  context: AdminProjectRouteContext,
) {
  const idResult = await getValidProjectId(context);

  if (!idResult.ok) {
    return idResult.response;
  }

  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid project payload",
      400,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;
  const update: Database["public"]["Tables"]["projects"]["Update"] = {
    ...(input.customerId !== undefined ? { customer_id: input.customerId } : {}),
    ...(input.inquiryId !== undefined ? { inquiry_id: input.inquiryId } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined
      ? { description: input.description || null }
      : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.contractAmount !== undefined
      ? { contract_amount: input.contractAmount }
      : {}),
    ...(input.expectedStartDate !== undefined
      ? { expected_start_date: input.expectedStartDate || null }
      : {}),
    ...(input.expectedLaunchDate !== undefined
      ? { expected_launch_date: input.expectedLaunchDate || null }
      : {}),
    ...(input.launchedAt !== undefined
      ? { launched_at: input.launchedAt || null }
      : {}),
    ...(input.memo !== undefined ? { memo: input.memo || null } : {}),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin.supabase
    .from("projects")
    .update(update)
    .eq("id", idResult.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return jsonError("ADMIN_PROJECT_UPDATE_FAILED", error.message, 500);
  }

  if (!data) {
    return jsonError("ADMIN_PROJECT_NOT_FOUND", "Project not found", 404);
  }

  return jsonOk<AdminProjectUpdateResponse>(data);
}
