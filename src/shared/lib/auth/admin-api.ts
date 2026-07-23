import type { NextRequest } from "next/server";

import { jsonError } from "@/shared/api/response";
import { verifyAdminAccessToken } from "@/shared/lib/auth/admin";
import { getAdminAccessTokenFromRequest } from "@/shared/lib/auth/admin-session";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export async function getVerifiedAdminSupabase(request: NextRequest) {
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
