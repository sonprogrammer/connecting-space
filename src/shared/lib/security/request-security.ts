import { jsonError } from "@/shared/api/response";

const INQUIRY_LIMIT = 5;
const INQUIRY_WINDOW_SECONDS = 60;
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 10 * 60;
const INQUIRY_BODY_LIMIT = 64 * 1024;
const LOGIN_BODY_LIMIT = 16 * 1024;

export type RateLimitStore = {
  increment(key: string, windowSeconds: number): Promise<number>;
};

type SecurityOptions = {
  store?: RateLimitStore;
  hashSecret?: string;
  allowedOrigins?: string[];
};

class RateLimitUnavailableError extends Error {}

export class UpstashRateLimitStore implements RateLimitStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async increment(key: string, windowSeconds: number) {
    const response = await fetch(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSeconds)],
      ]),
      cache: "no-store",
    }).catch(() => null);

    if (!response?.ok) throw new RateLimitUnavailableError("Rate limit provider unavailable");

    const result = await response.json().catch(() => null) as unknown;
    const count = isSuccessfulPipeline(result) ? result[0].result : null;
    if (count === null) throw new RateLimitUnavailableError("Invalid rate limit provider response");
    return count;
  }
}

function isSuccessfulPipeline(value: unknown): value is [{ result: number }, { result: number }] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [increment, expiry] = value;
  if (!value.every((entry) => {
    if (entry === null || typeof entry !== "object" || "error" in entry) return false;
    const result = (entry as { result?: unknown }).result;
    return typeof result === "number" && Number.isFinite(result);
  })) return false;
  return (expiry as { result: number }).result === 1
    && (increment as { result: number }).result >= 1;
}

export function createConfiguredRateLimitStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new RateLimitUnavailableError("Rate limit provider is not configured");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".upstash.io")) {
      throw new Error("Upstash URL must use an Upstash HTTPS host");
    }
  } catch {
    throw new RateLimitUnavailableError("Rate limit provider is not configured");
  }
  return new UpstashRateLimitStore(url, token);
}

export async function enforcePublicRequestSecurity(
  request: Request,
  options: SecurityOptions = {},
) {
  const policy = publicPolicy(request.url);
  if (!policy) return null;

  const bodySize = await getBodySize(request, policy.bodyLimit);
  if (bodySize === "too_large") {
    return jsonError("REQUEST_BODY_TOO_LARGE", "Request body is too large", 413);
  }

  if (!isJsonContentType(request.headers.get("content-type"))) {
    return jsonError("UNSUPPORTED_MEDIA_TYPE", "JSON content type is required", 415);
  }

  const hashSecret = options.hashSecret ?? process.env.RATE_LIMIT_HASH_SECRET;
  if (!hashSecret) {
    return jsonError("RATE_LIMIT_UNAVAILABLE", "Rate limiting is temporarily unavailable", 503, undefined, {
      "Retry-After": "30",
    });
  }

  try {
    const store = options.store ?? createConfiguredRateLimitStore();
    const dimensions = [
      { label: "ip", value: getClientIp(request), limit: policy.limit, windowSeconds: policy.windowSeconds },
    ];
    const body = await request.clone().json().catch(() => null) as { email?: unknown } | null;
    if (typeof body?.email === "string" && body.email.trim()) {
      dimensions.push({
        label: "email",
        value: body.email.trim().toLowerCase(),
        limit: policy.emailLimit,
        windowSeconds: policy.emailWindowSeconds,
      });
    }

    for (const dimension of dimensions) {
      const hashed = await hmacSha256Hex(hashSecret, dimension.value);
      const count = await store.increment(`${policy.name}:${dimension.label}:${hashed}`, dimension.windowSeconds);
      if (count > dimension.limit) {
        return jsonError("RATE_LIMITED", "Too many requests", 429, undefined, {
          "Retry-After": String(dimension.windowSeconds),
        });
      }
    }
  } catch {
    return jsonError("RATE_LIMIT_UNAVAILABLE", "Rate limiting is temporarily unavailable", 503, undefined, {
      "Retry-After": "30",
    });
  }

  return null;
}

export async function enforceCookieMutationSecurity(
  request: Request,
  options: Pick<SecurityOptions, "allowedOrigins"> = {},
) {
  const origin = request.headers.get("origin");
  const allowedOrigins = options.allowedOrigins ?? getConfiguredOrigins();
  if (!origin || origin === "null" || !allowedOrigins.includes(normalizeOrigin(origin))) {
    return jsonError("CSRF_ORIGIN_INVALID", "Request origin is not allowed", 403);
  }

  if (!isBodylessAdminMutation(request) && !isJsonContentType(request.headers.get("content-type"))) {
    return jsonError("UNSUPPORTED_MEDIA_TYPE", "JSON content type is required", 415);
  }
  return null;
}

export function getConfiguredOrigins() {
  const configured = (process.env.CSRF_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
  const fallback = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return [...new Set([normalizeOrigin(fallback), ...configured].filter(Boolean))];
}

export function isJsonContentType(value: string | null) {
  return value?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function publicPolicy(url: string) {
  const pathname = new URL(url).pathname;
  if (pathname === "/api/inquiries") {
    return {
      name: "inquiry",
      bodyLimit: INQUIRY_BODY_LIMIT,
      limit: INQUIRY_LIMIT,
      windowSeconds: INQUIRY_WINDOW_SECONDS,
      emailLimit: 3,
      emailWindowSeconds: 60 * 60,
    };
  }
  if (pathname === "/api/auth/login") {
    return {
      name: "login",
      bodyLimit: LOGIN_BODY_LIMIT,
      limit: LOGIN_LIMIT,
      windowSeconds: LOGIN_WINDOW_SECONDS,
      emailLimit: 5,
      emailWindowSeconds: 15 * 60,
    };
  }
  return null;
}

async function getBodySize(request: Request, limit: number) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > limit) return "too_large" as const;
  if (!request.body) return "ok" as const;
  const reader = request.clone().body?.getReader();
  if (!reader) return "ok" as const;
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return "too_large" as const;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return "ok" as const;
}

function isBodylessAdminMutation(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/auth/logout") return true;
  if (request.method === "DELETE") return true;
  if (request.method !== "POST") return false;
  return /\/reply-draft\/regenerate$|\/notifications\/slack\/retry$|\/quote-email-jobs\/[^/]+\/retry$|\/quotes\/[^/]+\/cancel$|\/quote-versions\/[^/]+\/(send|approval-token)$/.test(url.pathname);
}

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
