import { createClient } from "@supabase/supabase-js";

import { assertPublicSupabaseEnv, assertServerSupabaseEnv } from "@/shared/config/env";
import type { Database } from "@/shared/types/database.generated";

export function createSupabaseServerClient(accessToken?: string | null) {
  const { supabaseUrl, supabaseAnonKey } = assertPublicSupabaseEnv();

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export function createSupabaseAdminClient() {
  const { supabaseUrl, serviceRoleKey } = assertServerSupabaseEnv();

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
