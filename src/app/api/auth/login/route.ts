import { adminLoginSchema } from "@/features/admin-auth/schemas/admin-login.schema";
import { jsonError, jsonOk } from "@/shared/api/response";
import {
  adminAccessCookieName,
  adminRefreshCookieName,
  getAdminCookieOptions,
} from "@/shared/lib/auth/admin-session";
import { verifyAdminAccessToken } from "@/shared/lib/auth/admin";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = adminLoginSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid login payload",
      400,
      parsed.error.flatten(),
    );
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.session) {
    return jsonError("LOGIN_FAILED", "Invalid email or password", 401);
  }

  const auth = await verifyAdminAccessToken(data.session.access_token);

  if (!auth.ok) {
    return jsonError("ADMIN_AUTH_REQUIRED", auth.message, auth.status);
  }

  const response = jsonOk({
    user: {
      id: auth.user.id,
      email: auth.user.email,
    },
  });

  response.cookies.set(
    adminAccessCookieName,
    data.session.access_token,
    getAdminCookieOptions(data.session.expires_in),
  );
  response.cookies.set(
    adminRefreshCookieName,
    data.session.refresh_token,
    getAdminCookieOptions(60 * 60 * 24 * 30),
  );

  return response;
}
