import { NextResponse, type NextRequest } from "next/server";

import { verifyAdminAccessToken } from "@/shared/lib/auth/admin";
import { getAdminAccessTokenFromRequest } from "@/shared/lib/auth/admin-session";

export async function proxy(request: NextRequest) {
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
  matcher: "/admin/:path*",
};
