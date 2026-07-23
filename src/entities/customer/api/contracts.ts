import type { CustomerRow } from "@/entities/customer/model/types";

export type AdminCustomerListItem = Pick<
  CustomerRow,
  | "id"
  | "inquiry_id"
  | "name"
  | "email"
  | "phone"
  | "company_name"
  | "website_url"
  | "created_at"
  | "updated_at"
>;

export type AdminCustomerDetail = CustomerRow;
export type AdminCustomerCreateResponse = AdminCustomerDetail;
export type AdminCustomerUpdateResponse = AdminCustomerDetail;
