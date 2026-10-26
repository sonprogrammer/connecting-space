import { queryOptions } from "@tanstack/react-query";
import {
  financialSummaryQuerySchema,
  financialSummarySchema,
  type AdminFinancialSummaryResponse,
} from "../api/financial-summary";

export type AdminFinancialSummaryStatus = typeof financialSummaryQuerySchema extends { _output: infer T }
  ? T extends { status: infer Status } ? Status : never
  : never;

export class AdminFinancialSummaryQueryError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AdminFinancialSummaryQueryError";
  }
}

export const adminFinancialSummaryQueryKeys = {
  all: ["admin", "financial-summary"] as const,
  byStatus: (status: AdminFinancialSummaryStatus) => ["admin", "financial-summary", status] as const,
};

type ApiEnvelope<T> = { data: T } | { error: { code: string; message: string } };

export async function fetchAdminFinancialSummary(
  status: AdminFinancialSummaryStatus,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AdminFinancialSummaryResponse> {
  const response = await fetcher(`/api/admin/financial-summary?status=${encodeURIComponent(status)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  let envelope: ApiEnvelope<unknown>;
  try {
    envelope = await response.json() as ApiEnvelope<unknown>;
  } catch {
    throw new AdminFinancialSummaryQueryError("관리자 금융 요약을 불러오지 못했습니다.", response.status);
  }

  if (response.status === 401 || response.status === 403) {
    throw new AdminFinancialSummaryQueryError("관리자 로그인이 필요합니다.", response.status);
  }
  if (!response.ok || "error" in envelope) {
    throw new AdminFinancialSummaryQueryError(
      "error" in envelope ? envelope.error.message : "관리자 금융 요약을 불러오지 못했습니다.",
      response.status,
    );
  }

  const parsed = financialSummarySchema.safeParse(envelope.data);
  if (!parsed.success || parsed.data.status !== status) {
    throw new AdminFinancialSummaryQueryError("관리자 금융 요약 응답 형식이 올바르지 않습니다.", response.status);
  }
  return parsed.data;
}

export function adminFinancialSummaryQueryOptions(
  status: AdminFinancialSummaryStatus,
  fetcher?: typeof fetch,
) {
  return queryOptions({
    queryKey: adminFinancialSummaryQueryKeys.byStatus(status),
    queryFn: ({ signal }) => fetchAdminFinancialSummary(status, fetcher, signal),
  });
}
