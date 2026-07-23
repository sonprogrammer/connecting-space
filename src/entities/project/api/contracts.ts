import type { ProjectRow } from "@/entities/project/model/types";

export type AdminProjectListItem = Pick<
  ProjectRow,
  | "id"
  | "customer_id"
  | "inquiry_id"
  | "name"
  | "status"
  | "contract_amount"
  | "expected_launch_date"
  | "created_at"
  | "updated_at"
>;

export type AdminProjectDetail = ProjectRow;
export type AdminProjectCreateResponse = AdminProjectDetail;
export type AdminProjectUpdateResponse = AdminProjectDetail;
