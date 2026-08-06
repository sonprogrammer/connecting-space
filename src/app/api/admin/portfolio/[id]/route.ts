import type { NextRequest } from "next/server";

import {
  type AdminPortfolioDetail,
  type AdminPortfolioUpdateResponse,
  portfolioIdSchema,
  resolvePublishedAt,
  updatePortfolioSchema,
} from "@/entities/portfolio";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import type { Database } from "@/shared/types/database.generated";

type AdminPortfolioRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function getValidPortfolioId(context: AdminPortfolioRouteContext) {
  const { id } = await context.params;
  const parsed = portfolioIdSchema.safeParse(id);

  if (!parsed.success) {
    return {
      ok: false as const,
      response: jsonError(
        "INVALID_PORTFOLIO_ID",
        "Invalid portfolio id",
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
  context: AdminPortfolioRouteContext,
) {
  const idResult = await getValidPortfolioId(context);

  if (!idResult.ok) {
    return idResult.response;
  }

  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const { data, error } = await admin.supabase
    .from("portfolio_items")
    .select("*")
    .eq("id", idResult.id)
    .maybeSingle();

  if (error) {
    return jsonError(
      "ADMIN_PORTFOLIO_READ_FAILED",
      "Failed to read portfolio item",
      500,
    );
  }

  if (!data) {
    return jsonError(
      "ADMIN_PORTFOLIO_NOT_FOUND",
      "Portfolio item not found",
      404,
    );
  }

  return jsonOk<AdminPortfolioDetail>(data);
}

export async function PATCH(
  request: NextRequest,
  context: AdminPortfolioRouteContext,
) {
  const idResult = await getValidPortfolioId(context);

  if (!idResult.ok) {
    return idResult.response;
  }

  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = updatePortfolioSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid portfolio payload",
      400,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;
  const { data: existing, error: readError } = await admin.supabase
    .from("portfolio_items")
    .select("*")
    .eq("id", idResult.id)
    .maybeSingle();

  if (readError) {
    return jsonError(
      "ADMIN_PORTFOLIO_READ_FAILED",
      "Failed to read portfolio item",
      500,
    );
  }

  if (!existing) {
    return jsonError(
      "ADMIN_PORTFOLIO_NOT_FOUND",
      "Portfolio item not found",
      404,
    );
  }

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

  const now = new Date().toISOString();
  const publicationUpdate =
    input.isPublished === undefined
      ? {}
      : {
          is_published: input.isPublished,
          published_at: resolvePublishedAt(
            existing.is_published,
            existing.published_at,
            input.isPublished,
            now,
          ),
        };
  const update: Database["public"]["Tables"]["portfolio_items"]["Update"] = {
    ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.summary !== undefined
      ? { summary: input.summary || null }
      : {}),
    ...(input.imageUrl !== undefined
      ? { image_url: input.imageUrl || null }
      : {}),
    ...(input.siteUrl !== undefined
      ? { site_url: input.siteUrl || null }
      : {}),
    ...(input.industry !== undefined
      ? { industry: input.industry || null }
      : {}),
    ...publicationUpdate,
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    updated_at: now,
  };

  const { data, error } = await admin.supabase
    .from("portfolio_items")
    .update(update)
    .eq("id", idResult.id)
    .select("*")
    .maybeSingle();

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
      "ADMIN_PORTFOLIO_UPDATE_FAILED",
      "Failed to update portfolio item",
      500,
    );
  }

  if (!data) {
    return jsonError(
      "ADMIN_PORTFOLIO_NOT_FOUND",
      "Portfolio item not found",
      404,
    );
  }

  return jsonOk<AdminPortfolioUpdateResponse>(data);
}
