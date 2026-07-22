import type { NextRequest } from "next/server";

export const adminAccessCookieName = "imweb-admin-access-token";
export const adminRefreshCookieName = "imweb-admin-refresh-token";

export type AdminSessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export function getAdminAccessTokenFromRequest(request: NextRequest) {
  return request.cookies.get(adminAccessCookieName)?.value ?? null;
}

export function getAdminAccessTokenFromHeader(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

export function getAdminCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure:
      process.env.ADMIN_AUTH_COOKIE_SECURE === "true" ||
      process.env.NODE_ENV === "production",
  };
}
