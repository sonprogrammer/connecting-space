import type { ApiResponse } from "../../../shared/types/api";

export type PublicContentState<T> =
  | { status: "loading" }
  | { status: "success"; items: T[] }
  | { status: "empty" }
  | { status: "error"; message: string };

export function toPublicContentState<T>(result: ApiResponse<T[]>): PublicContentState<T> {
  if ("error" in result) {
    return { status: "error", message: "콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  return result.data.length > 0 ? { status: "success", items: result.data } : { status: "empty" };
}
