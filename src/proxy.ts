import { NextResponse, type NextRequest } from "next/server";

import { verifyAdminAccessToken } from "@/shared/lib/auth/admin";
import { getAdminAccessTokenFromRequest } from "@/shared/lib/auth/admin-session";
import {
  enforceCookieMutationSecurity,
  enforcePublicRequestSecurity,
} from "@/shared/lib/security/request-security";

export async function proxy(request: NextRequest) {
  const publicSecurity = await enforcePublicRequestSecurity(request);
  if (publicSecurity) return publicSecurity;

  if (isCookieMutation(request)) {
    const csrf = await enforceCookieMutationSecurity(request);
    if (csrf) return csrf;
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }

  const auth = await verifyAdminAccessToken(getAdminAccessTokenFromRequest(request));

  if (auth.ok) {
    return NextResponse.next();
  }

  const redirectUrl = new URL("/admin/login", request.url);
  redirectUrl.searchParams.set("next", request.nextUrl.pathname);

  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};

function isCookieMutation(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/auth/logout") return request.method === "POST";
  return pathname.startsWith("/api/admin/") && ["POST", "PATCH", "DELETE"].includes(request.method);
}
