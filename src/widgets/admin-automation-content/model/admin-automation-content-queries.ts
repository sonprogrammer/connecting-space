import type { AdminFaqItem, AdminServiceOffering } from "@/entities/automation";
import type { ApiResponse } from "@/shared/types/api";

export const adminAutomationContentQueryKeys = {
  all: ["admin", "automation-content"] as const,
  services: { list: () => [...adminAutomationContentQueryKeys.all, "services", "list"] as const },
  faqs: { list: () => [...adminAutomationContentQueryKeys.all, "faqs", "list"] as const },
};

async function fetchList<T>(url: string, label: string, signal?: AbortSignal): Promise<T[]> {
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal });
  if (response.status === 401 || response.status === 403) throw new Error("관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.");
  const result = (await response.json()) as ApiResponse<T[]>;
  if (!response.ok || "error" in result) throw new Error("error" in result ? result.error.message : `${label} 목록을 불러오지 못했습니다.`);
  return result.data;
}

export const fetchAdminServices = ({ signal }: { signal?: AbortSignal } = {}) => fetchList<AdminServiceOffering>("/api/admin/service-offerings", "서비스", signal);
export const fetchAdminFaqs = ({ signal }: { signal?: AbortSignal } = {}) => fetchList<AdminFaqItem>("/api/admin/faqs", "FAQ", signal);
