import type { Database } from "@/shared/types/database.generated";

export type AdminInquiryStatus =
  Database["public"]["Enums"]["inquiry_status"];

export type AdminInquiryListItem = Pick<
  Database["public"]["Tables"]["inquiries"]["Row"],
  | "id"
  | "customer_name"
  | "email"
  | "phone"
  | "company_name"
  | "service_type"
  | "status"
  | "created_at"
  | "updated_at"
>;

export type InquiryContact = Pick<AdminInquiryListItem, "email" | "phone">;

const statusLabels: Record<AdminInquiryStatus, string> = {
  new: "신규",
  contacted: "상담 중",
  qualified: "검토 완료",
  converted: "전환 완료",
  closed: "종료",
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const wonFormatter = new Intl.NumberFormat("ko-KR");

export function getInquiryStatusLabel(status: AdminInquiryStatus) {
  return statusLabels[status];
}

export function getInquiryPrimaryContact(inquiry: InquiryContact) {
  return inquiry.phone || inquiry.email || "연락처 없음";
}

export function formatAdminInquiryCreatedAt(createdAt: string) {
  return dateFormatter.format(new Date(createdAt));
}

export function formatInquiryBudget(
  budgetMin: number | null,
  budgetMax: number | null,
) {
  const min = budgetMin === null ? null : `${wonFormatter.format(budgetMin / 10000)}만원`;
  const max = budgetMax === null ? null : `${wonFormatter.format(budgetMax / 10000)}만원`;

  if (min && max) {
    return `${min} ~ ${max}`;
  }

  if (min) {
    return `${min} 이상`;
  }

  if (max) {
    return `${max} 이하`;
  }

  return "예산 미정";
}

export function formatInquiryDesiredLaunchDate(
  desiredLaunchDate: string | null,
) {
  if (!desiredLaunchDate) {
    return "희망일 미정";
  }

  return dateFormatter.format(new Date(`${desiredLaunchDate}T00:00:00+09:00`));
}
