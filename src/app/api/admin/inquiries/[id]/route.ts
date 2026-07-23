import type { NextRequest } from "next/server";
import { z } from "zod";

import type {
  AdminInquiryDetail,
  AdminInquiryStatusUpdateResponse,
} from "@/entities/inquiry";
import { updateInquiryStatusSchema } from "@/features/update-inquiry-status";
import { jsonError, jsonOk } from "@/shared/api/response";
import { verifyAdminAccessToken } from "@/shared/lib/auth/admin";
import { getAdminAccessTokenFromRequest } from "@/shared/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

const inquiryIdSchema = z.uuid();

type AdminInquiryRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function getVerifiedAdminSupabase(request: NextRequest) {
  const accessToken = getAdminAccessTokenFromRequest(request);
  const auth = await verifyAdminAccessToken(accessToken);

  if (!auth.ok) {
    return {
      ok: false as const,
      response: jsonError("ADMIN_AUTH_REQUIRED", auth.message, auth.status),
    };
  }

  return {
    ok: true as const,
    supabase: createSupabaseServerClient(accessToken),
  };
}

async function getValidInquiryId(context: AdminInquiryRouteContext) {
  const { id } = await context.params;
  const parsed = inquiryIdSchema.safeParse(id);

  if (!parsed.success) {
    return {
      ok: false as const,
      response: jsonError(
        "INVALID_INQUIRY_ID",
        "Invalid inquiry id",
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
  context: AdminInquiryRouteContext,
) {
  const idResult = await getValidInquiryId(context);

  if (!idResult.ok) {
    return idResult.response;
  }

  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const { data, error } = await admin.supabase
    .from("inquiries")
    .select("*")
    .eq("id", idResult.id)
    .maybeSingle();

  if (error) {
    return jsonError("ADMIN_INQUIRY_READ_FAILED", error.message, 500);
  }

  if (!data) {
    return jsonError("ADMIN_INQUIRY_NOT_FOUND", "Inquiry not found", 404);
  }

  return jsonOk<AdminInquiryDetail>(data);
}

export async function PATCH(
  request: NextRequest,
  context: AdminInquiryRouteContext,
) {
  const idResult = await getValidInquiryId(context);

  if (!idResult.ok) {
    return idResult.response;
  }

  const admin = await getVerifiedAdminSupabase(request);

  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateInquiryStatusSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid inquiry status payload",
      400,
      parsed.error.flatten(),
    );
  }

  const { data, error } = await admin.supabase
    .from("inquiries")
    .update({
      status: parsed.data.status,
      ...(parsed.data.adminNotes !== undefined
        ? { admin_notes: parsed.data.adminNotes }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", idResult.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return jsonError("ADMIN_INQUIRY_UPDATE_FAILED", error.message, 500);
  }

  if (!data) {
    return jsonError("ADMIN_INQUIRY_NOT_FOUND", "Inquiry not found", 404);
  }

  return jsonOk<AdminInquiryStatusUpdateResponse>(data);
}
