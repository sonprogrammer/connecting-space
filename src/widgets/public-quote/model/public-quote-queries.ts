import type { PublicQuoteSnapshot } from "@/entities/quote/api/contracts";

export class PublicQuoteRequestError extends Error {
  constructor(readonly status: number, readonly code?: string) {
    super("공개 견적 요청을 처리할 수 없습니다.");
    this.name = "PublicQuoteRequestError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    throw new PublicQuoteRequestError(0);
  }

  const payload = (await response.json().catch(() => undefined)) as
    | { data?: T; error?: { code?: string } }
    | undefined;
  if (!response.ok || !payload?.data) {
    throw new PublicQuoteRequestError(response.status, payload?.error?.code);
  }
  return payload.data;
}

export function fetchPublicQuote(token: string): Promise<PublicQuoteSnapshot> {
  return request<PublicQuoteSnapshot>(`/api/quotes/${encodeURIComponent(token)}`);
}

export function approvePublicQuote(token: string): Promise<{ quoteId: string; quoteVersionId: string; approvedAt: string }> {
  return request(`/api/quotes/${encodeURIComponent(token)}/approve`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
}
