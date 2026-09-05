import type {
  AdminCustomerDetail,
  AdminCustomerListItem,
} from "@/entities/customer";
import type {
  AdminProjectDetail,
  AdminProjectListItem,
  ProjectStatus,
} from "@/entities/project";
import type { AdminInquiryDetail } from "@/entities/inquiry";
import type { ApiFailure, ApiResponse } from "@/shared/types/api";

export type AdminCustomerListState =
  | { status: "loading" }
  | { status: "success"; items: AdminCustomerListItem[]; page: number; totalPages: number }
  | { status: "empty"; page: number; totalPages: number }
  | { status: "error"; message: string };

export type AdminProjectListState =
  | { status: "loading" }
  | { status: "success"; items: AdminProjectListItem[]; page: number; totalPages: number }
  | { status: "empty"; page: number; totalPages: number }
  | { status: "error"; message: string };

export type CustomerFormValues = {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  websiteUrl: string;
  memo: string;
};

export type ProjectFormValues = {
  name: string;
  description: string;
  status: ProjectStatus;
  contractAmount: string;
  expectedStartDate: string;
  expectedLaunchDate: string;
  launchedAt: string;
  memo: string;
};

export const projectStatuses: ProjectStatus[] = [
  "planning",
  "in_progress",
  "review",
  "completed",
  "paused",
  "cancelled",
];

export const projectStatusLabels: Record<ProjectStatus, string> = {
  planning: "기획",
  in_progress: "제작 중",
  review: "검수",
  completed: "완료",
  paused: "보류",
  cancelled: "취소",
};

export function getConvertedProjectId(inquiry: Pick<AdminInquiryDetail, "converted_project_id">) {
  return inquiry.converted_project_id;
}

export function getCustomerDetailUrl(customerId: string) {
  return `/api/admin/customers/${customerId}`;
}

export function getProjectDetailUrl(projectId: string) {
  return `/api/admin/projects/${projectId}`;
}

export function getInquiryDetailUrl(inquiryId: string) {
  return `/api/admin/inquiries/${inquiryId}`;
}

export const emptyCustomerForm: CustomerFormValues = {
  name: "",
  email: "",
  phone: "",
  companyName: "",
  websiteUrl: "",
  memo: "",
};

export const emptyProjectForm: ProjectFormValues = {
  name: "",
  description: "",
  status: "planning",
  contractAmount: "",
  expectedStartDate: "",
  expectedLaunchDate: "",
  launchedAt: "",
  memo: "",
};

export function customerToFormValues(customer: AdminCustomerDetail | AdminCustomerListItem): CustomerFormValues {
  return {
    name: customer.name,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    companyName: customer.company_name ?? "",
    websiteUrl: customer.website_url ?? "",
    memo: "memo" in customer ? customer.memo ?? "" : "",
  };
}

export function projectToFormValues(project: AdminProjectDetail | AdminProjectListItem): ProjectFormValues {
  return {
    name: project.name,
    description: "description" in project ? project.description ?? "" : "",
    status: project.status,
    contractAmount: project.contract_amount == null ? "" : String(project.contract_amount),
    expectedStartDate: "expected_start_date" in project ? project.expected_start_date ?? "" : "",
    expectedLaunchDate: project.expected_launch_date ?? "",
    launchedAt: "launched_at" in project ? project.launched_at ?? "" : "",
    memo: "memo" in project ? project.memo ?? "" : "",
  };
}

export function buildCustomerPayload(values: CustomerFormValues) {
  return {
    name: values.name,
    email: values.email,
    phone: values.phone,
    companyName: values.companyName,
    websiteUrl: values.websiteUrl,
    memo: values.memo,
  };
}

export function buildProjectPayload(values: ProjectFormValues) {
  return {
    name: values.name,
    description: values.description,
    status: values.status,
    contractAmount: values.contractAmount === "" ? undefined : Number(values.contractAmount),
    expectedStartDate: values.expectedStartDate,
    expectedLaunchDate: values.expectedLaunchDate,
    launchedAt: values.launchedAt,
    memo: values.memo,
  };
}

function listError(status: number | undefined, entity: string) {
  if (status === 401 || status === 403) {
    return "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.";
  }
  return `${entity} 목록을 불러오지 못했습니다.`;
}

export function toCustomerListState(
  result: ApiResponse<{ items: AdminCustomerListItem[]; page: number; totalPages: number }>,
  status?: number,
): AdminCustomerListState {
  if ("error" in result) return { status: "error", message: listError(status, "고객") };
  return result.data.items.length === 0
    ? { status: "empty", page: result.data.page, totalPages: result.data.totalPages }
    : { status: "success", items: result.data.items, page: result.data.page, totalPages: result.data.totalPages };
}

export function toProjectListState(
  result: ApiResponse<{ items: AdminProjectListItem[]; page: number; totalPages: number }>,
  status?: number,
): AdminProjectListState {
  if ("error" in result) return { status: "error", message: listError(status, "프로젝트") };
  return result.data.items.length === 0
    ? { status: "empty", page: result.data.page, totalPages: result.data.totalPages }
    : { status: "success", items: result.data.items, page: result.data.page, totalPages: result.data.totalPages };
}

export function getSaveFailure(status: number, result: ApiFailure, entity: string) {
  if (status === 401 || status === 403) {
    return { fieldErrors: {} as Record<string, string[]>, message: "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요." };
  }
  if (result.error.code === "VALIDATION_ERROR") {
    const details = result.error.details;
    const fieldErrors = details && typeof details === "object" && "fieldErrors" in details && details.fieldErrors && typeof details.fieldErrors === "object"
      ? (details.fieldErrors as Record<string, string[]>)
      : {};
    return { fieldErrors, message: "입력값을 다시 확인해 주세요." };
  }
  return { fieldErrors: {} as Record<string, string[]>, message: `${entity}를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.` };
}
