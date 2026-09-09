import { assertManualTokenKey } from "./manual-token";

function requireManualEnvironmentVariables<const T extends Record<string, string | undefined>>(
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

export function assertQuoteManualDeliveryEnv() {
  const values = requireManualEnvironmentVariables({
    QUOTE_MANUAL_DELIVERY_TOKEN_KEY: process.env.QUOTE_MANUAL_DELIVERY_TOKEN_KEY,
    QUOTE_PUBLIC_BASE_URL: process.env.QUOTE_PUBLIC_BASE_URL,
  });
  const publicBaseUrl = new URL(values.QUOTE_PUBLIC_BASE_URL);
  if (publicBaseUrl.protocol !== "https:" && publicBaseUrl.protocol !== "http:") {
    throw new Error("QUOTE_PUBLIC_BASE_URL must use http or https");
  }
  return {
    tokenKey: assertManualTokenKey(values.QUOTE_MANUAL_DELIVERY_TOKEN_KEY),
    publicBaseUrl: publicBaseUrl.origin,
  };
}
