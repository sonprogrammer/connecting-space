import type { AdminInquiryDetail } from "../api/contracts";
import type { AdminInquiryListItem } from "./admin-inquiry";
import type { ApiResponse } from "@/shared/types/api";

export class AdminInquiryQueryError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AdminInquiryQueryError";
  }
}

export async function readAdminInquiryResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  if (response.status === 401 || response.status === 403) {
    throw new AdminInquiryQueryError("관리자 로그인이 필요합니다.", response.status);
  }

  let result: ApiResponse<T>;
  try {
    result = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new AdminInquiryQueryError(fallbackMessage, response.status);
  }

  if (!response.ok || "error" in result) {
    throw new AdminInquiryQueryError(
      "error" in result ? result.error.message : fallbackMessage,
      response.status,
    );
  }
  return result.data;
}

export async function fetchAdminInquiryList({ signal }: { signal?: AbortSignal } = {}) {
  const response = await fetch("/api/admin/inquiries", {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  return readAdminInquiryResponse<AdminInquiryListItem[]>(
    response,
    "문의 목록을 불러오지 못했습니다.",
  );
}

export async function fetchAdminInquiryDetail(
  id: string,
  { signal }: { signal?: AbortSignal } = {},
) {
  const response = await fetch(`/api/admin/inquiries/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  return readAdminInquiryResponse<AdminInquiryDetail>(
    response,
    "문의 상세를 불러오지 못했습니다.",
  );
}
