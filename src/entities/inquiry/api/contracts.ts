import type { Database } from "@/shared/types/database.generated";

export type InquiryRow = Database["public"]["Tables"]["inquiries"]["Row"];

export type AdminInquiryListItem = Pick<
  InquiryRow,
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

export type AdminInquiryDetail = InquiryRow;

export type AdminInquiryStatusUpdateResponse = AdminInquiryDetail;
