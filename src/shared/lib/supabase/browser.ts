"use client";

import { createClient } from "@supabase/supabase-js";

import { assertPublicSupabaseEnv } from "@/shared/config/env";
import type { Database } from "@/shared/types/database.generated";

let browserClient: ReturnType<typeof createClient<Database>> | null = null;

export function createSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const { supabaseUrl, supabaseAnonKey } = assertPublicSupabaseEnv();
  browserClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

  return browserClient;
}
