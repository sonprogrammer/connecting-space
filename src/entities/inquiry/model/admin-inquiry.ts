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

export function getInquiryStatusLabel(status: AdminInquiryStatus) {
  return statusLabels[status];
}

export function getInquiryPrimaryContact(inquiry: InquiryContact) {
  return inquiry.phone || inquiry.email || "연락처 없음";
}

export function formatAdminInquiryCreatedAt(createdAt: string) {
  return dateFormatter.format(new Date(createdAt));
}
