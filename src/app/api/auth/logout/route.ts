import { jsonOk } from "@/shared/api/response";
import {
  adminAccessCookieName,
  adminRefreshCookieName,
  getAdminCookieOptions,
} from "@/shared/lib/auth/admin-session";

export async function POST() {
  const response = jsonOk({ ok: true });
  const expiredCookieOptions = getAdminCookieOptions(0);

  response.cookies.set(adminAccessCookieName, "", expiredCookieOptions);
  response.cookies.set(adminRefreshCookieName, "", expiredCookieOptions);

  return response;
}
