import type { NextRequest } from "next/server";

import {
  createProjectSchema,
  type AdminProjectCreateResponse,
  type AdminProjectListItem,
  type AdminProjectListResponse,
} from "@/entities/project";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import { paginatedResponse, parseListQuery } from "@/shared/api/list-query";

export async function GET(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const query = parseListQuery(request.nextUrl.searchParams, {
    sortFields: ["created_at", "name", "status", "expected_launch_date"],
  });
  if (!query.ok) return jsonError("VALIDATION_ERROR", "Invalid project list query", 400, { errors: query.errors });

  const status = request.nextUrl.searchParams.get("status");
  const allowedStatuses = ["planning", "in_progress", "review", "completed", "paused", "cancelled"] as const;
  if (status && !allowedStatuses.includes(status as typeof allowedStatuses[number])) {
    return jsonError("VALIDATION_ERROR", "Invalid project status", 400);
  }
  const { q, page, pageSize, sort, direction } = query.value;
  let builder = admin.supabase
    .from("projects")
    .select(
      "id, customer_id, inquiry_id, name, status, contract_amount, expected_launch_date, created_at, updated_at",
      { count: "exact" },
    );
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    builder = builder.or(`name.ilike.*${safe}*,description.ilike.*${safe}*`);
  }
  if (status) builder = builder.eq("status", status as typeof allowedStatuses[number]);
  const { data, error, count } = await builder
    .order(sort as "created_at" | "name" | "status" | "expected_launch_date", { ascending: direction === "asc" })
    .order("id", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) {
    return jsonError("ADMIN_PROJECTS_READ_FAILED", error.message, 500);
  }

  return jsonOk<AdminProjectListResponse>(paginatedResponse(data as AdminProjectListItem[], count ?? 0, query.value));
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
