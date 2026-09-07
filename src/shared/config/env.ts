import { aiProviderSchema, resolveAiProviderConfig } from "../lib/automation/ai";

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

function requireEnvironmentVariables<const T extends Record<string, string | undefined>>(
  required: T,
) {
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
  return required as { [K in keyof T]: string };
}

export function assertAiEnv() {
  const values = requireEnvironmentVariables({
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
  });
  const provider = aiProviderSchema.safeParse(values.AI_PROVIDER);
  if (!provider.success) throw new Error("AI_PROVIDER must be groq, gemini, openai, or custom");
  return resolveAiProviderConfig({
    provider: provider.data,
    apiKey: values.AI_API_KEY,
    model: values.AI_MODEL,
    baseUrl: process.env.AI_BASE_URL,
  });
}

export function assertSlackEnv() {
  const values = requireEnvironmentVariables({
    SLACK_INQUIRY_WEBHOOK_URL: process.env.SLACK_INQUIRY_WEBHOOK_URL,
    ADMIN_BASE_URL: process.env.ADMIN_BASE_URL,
  });
  return {
    slackWebhookUrl: values.SLACK_INQUIRY_WEBHOOK_URL,
    adminBaseUrl: values.ADMIN_BASE_URL,
  };
}

export function assertQuoteEmailEnv() {
  const values = requireEnvironmentVariables({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    QUOTE_EMAIL_ENCRYPTION_KEY: process.env.QUOTE_EMAIL_ENCRYPTION_KEY,
    QUOTE_PUBLIC_BASE_URL: process.env.QUOTE_PUBLIC_BASE_URL,
  });
  if (Buffer.from(values.QUOTE_EMAIL_ENCRYPTION_KEY, "base64").length !== 32) {
    throw new Error("QUOTE_EMAIL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  const publicBaseUrl = new URL(values.QUOTE_PUBLIC_BASE_URL);
  if (publicBaseUrl.protocol !== "https:" && publicBaseUrl.protocol !== "http:") {
    throw new Error("QUOTE_PUBLIC_BASE_URL must use http or https");
  }
  return {
    apiKey: values.RESEND_API_KEY,
    fromEmail: values.RESEND_FROM_EMAIL,
    encryptionKey: values.QUOTE_EMAIL_ENCRYPTION_KEY,
    publicBaseUrl: publicBaseUrl.origin,
  };
}

export function assertAutomationProcessEnv() {
  const values = requireEnvironmentVariables({
    AUTOMATION_PROCESS_SECRET: process.env.AUTOMATION_PROCESS_SECRET,
  });
  return { processSecret: values.AUTOMATION_PROCESS_SECRET };
}

export function normalizeSupabaseProjectUrl(value: string) {
  const url = new URL(value);

  url.pathname = url.pathname.replace(/\/(?:rest|auth|storage)\/v1\/?$/, "");
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}
