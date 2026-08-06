import type { NextRequest } from "next/server";

import {
  type AdminPortfolioCreateResponse,
  type AdminPortfolioListItem,
  createPortfolioSchema,
  resolvePublishedAt,
} from "@/entities/portfolio";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

export async function GET(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const { data, error } = await admin.supabase
    .from("portfolio_items")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return jsonError(
      "ADMIN_PORTFOLIO_READ_FAILED",
      "Failed to read portfolio items",
      500,
    );
  }

  return jsonOk<AdminPortfolioListItem[]>(data);
}

export async function POST(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createPortfolioSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid portfolio payload",
      400,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;

  if (input.projectId) {
    const { data: project, error: projectError } = await admin.supabase
      .from("projects")
      .select("id")
      .eq("id", input.projectId)
      .maybeSingle();

    if (projectError) {
      return jsonError(
        "ADMIN_PORTFOLIO_PROJECT_READ_FAILED",
        "Failed to validate portfolio project",
        500,
      );
    }

    if (!project) {
      return jsonError(
        "INVALID_PORTFOLIO_PROJECT",
        "Portfolio project not found",
        400,
      );
    }
  }

  const isPublished = input.isPublished ?? false;
  const now = new Date().toISOString();
  const { data, error } = await admin.supabase
    .from("portfolio_items")
    .insert({
      project_id: input.projectId ?? null,
      title: input.title,
      slug: input.slug,
      summary: input.summary || null,
      image_url: input.imageUrl || null,
      site_url: input.siteUrl || null,
      industry: input.industry || null,
      is_published: isPublished,
      published_at: resolvePublishedAt(false, null, isPublished, now),
      sort_order: input.sortOrder ?? 0,
    })
    .select("*")
    .single();

  if (error?.code === "23505") {
    return jsonError(
      "PORTFOLIO_SLUG_CONFLICT",
      "Portfolio slug already exists",
      409,
    );
  }

  if (error?.code === "23503") {
    return jsonError(
      "INVALID_PORTFOLIO_PROJECT",
      "Portfolio project not found",
      400,
    );
  }

  if (error) {
    return jsonError(
      "ADMIN_PORTFOLIO_CREATE_FAILED",
      "Failed to create portfolio item",
      500,
    );
  }

  return jsonOk<AdminPortfolioCreateResponse>(data, { status: 201 });
}
