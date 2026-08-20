const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: publicSupabaseUrl
    ? normalizeSupabaseProjectUrl(publicSupabaseUrl)
    : "",
  supabaseAnonKey: publicSupabaseAnonKey ?? "",
};

export function assertPublicSupabaseEnv() {
  if (!publicSupabaseUrl || !publicSupabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return {
    supabaseUrl: normalizeSupabaseProjectUrl(publicSupabaseUrl),
    supabaseAnonKey: publicSupabaseAnonKey,
  };
}

export function assertServerSupabaseEnv() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return {
    ...assertPublicSupabaseEnv(),
    serviceRoleKey,
  };
}

export function assertAutomationEnv() {
  const values = {
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_INQUIRY_REPLY_MODEL,
    slackWebhookUrl: process.env.SLACK_INQUIRY_WEBHOOK_URL,
    processSecret: process.env.AUTOMATION_PROCESS_SECRET,
    adminBaseUrl: process.env.ADMIN_BASE_URL,
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing automation environment variables: ${missing.join(", ")}`);
  return values as { [K in keyof typeof values]: string };
}

export function normalizeSupabaseProjectUrl(value: string) {
  const url = new URL(value);

  url.pathname = url.pathname.replace(/\/(?:rest|auth|storage)\/v1\/?$/, "");
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}
