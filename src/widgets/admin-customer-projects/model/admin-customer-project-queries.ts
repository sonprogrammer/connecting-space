import type { AdminInquiryDetail } from "@/entities/inquiry";
import type {
  AdminCustomerDetail,
  AdminCustomerListItem,
  AdminCustomerListResponse,
} from "@/entities/customer";
import type {
  AdminProjectDetail,
  AdminProjectListItem,
  AdminProjectListResponse,
  ProjectStatus,
} from "@/entities/project";
import type { ApiResponse } from "@/shared/types/api";

export class AdminQueryError extends Error {
  readonly status: number;
  readonly code: string;
  readonly isAuthExpired: boolean;

  constructor(status: number, code: string, message: string) {
    super(
      status === 401 || status === 403
        ? "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요."
        : message,
    );
    this.name = "AdminQueryError";
    this.status = status;
    this.code = code;
    this.isAuthExpired = status === 401 || status === 403;
  }
}

export const customerProjectQueryKeys = {
  customers: {
    all: ["admin", "customers"] as const,
    lists: () => [...customerProjectQueryKeys.customers.all, "list"] as const,
    list: (page: number, query: string) =>
      [...customerProjectQueryKeys.customers.lists(), { page, query }] as const,
    details: () => [...customerProjectQueryKeys.customers.all, "detail"] as const,
    detail: (id: string) => [...customerProjectQueryKeys.customers.details(), id] as const,
  },
  projects: {
    all: ["admin", "projects"] as const,
    lists: () => [...customerProjectQueryKeys.projects.all, "list"] as const,
    list: (page: number, query: string, status: ProjectStatus | "") =>
      [...customerProjectQueryKeys.projects.lists(), { page, query, status }] as const,
    details: () => [...customerProjectQueryKeys.projects.all, "detail"] as const,
    detail: (id: string) => [...customerProjectQueryKeys.projects.details(), id] as const,
  },
  inquiries: {
    all: ["admin", "inquiries"] as const,
    detail: (id: string) => [...customerProjectQueryKeys.inquiries.all, "detail", id] as const,
  },
};

export async function parseAdminQueryResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiResponse<T>;
  if (!response.ok || "error" in result) {
    if ("error" in result) {
      throw new AdminQueryError(response.status, result.error.code, result.error.message);
    }
    throw new AdminQueryError(response.status, "ADMIN_QUERY_FAILED", "관리자 데이터를 불러오지 못했습니다.");
  }
  return result.data;
}

async function fetchAdmin<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  return parseAdminQueryResponse<T>(response);
}

export function fetchCustomerList(page: number, query: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: "20", sort: "created_at", direction: "desc" });
  if (query) params.set("q", query);
  return fetchAdmin<AdminCustomerListResponse>(`/api/admin/customers?${params}`);
}

export function fetchProjectList(page: number, query: string, status: ProjectStatus | "") {
  const params = new URLSearchParams({ page: String(page), pageSize: "20", sort: "created_at", direction: "desc" });
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  return fetchAdmin<AdminProjectListResponse>(`/api/admin/projects?${params}`);
}

export function fetchCustomerDetail(id: string) {
  return fetchAdmin<AdminCustomerDetail>(`/api/admin/customers/${id}`);
}

export function fetchProjectDetail(id: string) {
  return fetchAdmin<AdminProjectDetail>(`/api/admin/projects/${id}`);
}

export function fetchInquiryDetail(id: string) {
  return fetchAdmin<AdminInquiryDetail>(`/api/admin/inquiries/${id}`);
}

export type CustomerListData = AdminCustomerListResponse & { items: AdminCustomerListItem[] };
export type ProjectListData = AdminProjectListResponse & { items: AdminProjectListItem[] };
