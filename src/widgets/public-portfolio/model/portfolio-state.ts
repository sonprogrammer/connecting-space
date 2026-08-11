import type { PublicPortfolioListItem } from "@/entities/portfolio";
import type { ApiResponse } from "@/shared/types/api";

export type PublicPortfolioState =
  | { status: "loading" }
  | { status: "success"; items: PublicPortfolioListItem[] }
  | { status: "error"; message: string };

export function toPublicPortfolioState(
  result: ApiResponse<PublicPortfolioListItem[]>,
): PublicPortfolioState {
  if ("error" in result) {
    return { status: "error", message: result.error.message };
  }

  return { status: "success", items: result.data };
}
