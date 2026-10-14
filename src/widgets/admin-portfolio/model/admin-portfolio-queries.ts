import type { AdminPortfolioListItem } from "@/entities/portfolio";
import type { ApiResponse } from "@/shared/types/api";

export const adminPortfolioQueryKeys = {
  all: ["admin", "portfolio"] as const,
  list: () => [...adminPortfolioQueryKeys.all, "list"] as const,
};

export async function fetchAdminPortfolioList({ signal }: { signal?: AbortSignal } = {}) {
  const response = await fetch("/api/admin/portfolio", {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (response.status === 401 || response.status === 403) throw new Error("관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.");
  const result = (await response.json()) as ApiResponse<AdminPortfolioListItem[]>;
  if (!response.ok || "error" in result) {
    throw new Error("error" in result ? result.error.message : "포트폴리오 목록을 불러오지 못했습니다.");
  }
  return result.data;
}
