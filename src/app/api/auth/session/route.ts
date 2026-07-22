import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/shared/api/response";
import { verifyAdminAccessToken } from "@/shared/lib/auth/admin";
import { getAdminAccessTokenFromRequest } from "@/shared/lib/auth/admin-session";

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccessToken(getAdminAccessTokenFromRequest(request));

  if (!auth.ok) {
    return jsonError("ADMIN_AUTH_REQUIRED", auth.message, auth.status);
  }

  return jsonOk({
    user: {
      id: auth.user.id,
      email: auth.user.email,
    },
  });
}
