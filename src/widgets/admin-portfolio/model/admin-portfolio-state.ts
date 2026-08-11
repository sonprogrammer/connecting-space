import type { AdminPortfolioListItem } from "@/entities/portfolio";
import type { ApiFailure, ApiResponse } from "@/shared/types/api";

export type AdminPortfolioListState =
  | { status: "loading" }
  | { status: "success"; items: AdminPortfolioListItem[] }
  | { status: "error"; message: string };

export type PortfolioSaveFailure = {
  fieldErrors: Record<string, string[]>;
  message: string;
};

export function toAdminPortfolioListState(
  result: ApiResponse<AdminPortfolioListItem[]>,
  status?: number,
): AdminPortfolioListState {
  if ("error" in result) {
    if (status === 401 || status === 403) {
      return {
        status: "error",
        message: "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.",
      };
    }

    return {
      status: "error",
      message: "포트폴리오 목록을 불러오지 못했습니다.",
    };
  }

  return { status: "success", items: result.data };
}

export function getPortfolioSaveFailure(
  status: number,
  result: ApiFailure,
): PortfolioSaveFailure {
  if (status === 401 || status === 403) {
    return {
      fieldErrors: {},
      message: "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.",
    };
  }

  if (result.error.code === "PORTFOLIO_SLUG_CONFLICT") {
    return {
      fieldErrors: { slug: ["이미 사용 중인 slug입니다."] },
      message: "입력값을 다시 확인해 주세요.",
    };
  }

  if (result.error.code === "INVALID_PORTFOLIO_PROJECT") {
    return {
      fieldErrors: {
        projectId: ["존재하는 프로젝트 ID를 입력해 주세요."],
      },
      message: "입력값을 다시 확인해 주세요.",
    };
  }

  if (result.error.code === "VALIDATION_ERROR") {
    const details = result.error.details;
    const fieldErrors =
      details &&
      typeof details === "object" &&
      "fieldErrors" in details &&
      details.fieldErrors &&
      typeof details.fieldErrors === "object"
        ? (details.fieldErrors as Record<string, string[]>)
        : {};

    return {
      fieldErrors,
      message: "입력값을 다시 확인해 주세요.",
    };
  }

  return {
    fieldErrors: {},
    message: "포트폴리오를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
