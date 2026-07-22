import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export type AdminAuthResult =
  | {
      ok: true;
      user: User;
    }
  | {
      ok: false;
      status: 401 | 403;
      message: string;
    };

export async function verifyAdminAccessToken(
  accessToken: string | null,
): Promise<AdminAuthResult> {
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      message: "Authentication required",
    };
  }

  const supabase = createSupabaseServerClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(
    accessToken,
  );

  if (userError || !userData.user) {
    return {
      ok: false,
      status: 401,
      message: "Invalid admin session",
    };
  }

  const { data: admin, error: adminError } = await supabase
    .from("admins")
    .select("id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (adminError || !admin) {
    return {
      ok: false,
      status: 403,
      message: "Admin access required",
    };
  }

  return {
    ok: true,
    user: userData.user,
  };
}
