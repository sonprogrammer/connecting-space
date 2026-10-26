import { queryOptions } from "@tanstack/react-query";
import type { AdminInquiryListItem } from "@/entities/inquiry";
import { fetchAdminInquiryList } from "@/entities/inquiry/model/admin-inquiry-queries";
import { adminInquiryQueryKeys } from "@/entities/inquiry/model/admin-inquiry-query-keys";
import type { AdminProjectListItem } from "@/entities/project";
import {
  customerProjectQueryKeys,
  fetchProjectList,
} from "@/widgets/admin-customer-projects/model/admin-customer-project-queries";

export const adminDashboardInquiryQueryOptions = queryOptions({
  queryKey: adminInquiryQueryKeys.list(),
  queryFn: fetchAdminInquiryList,
});

const upcomingProjectSettings = {
  pageSize: 20,
  sort: "expected_launch_date",
  direction: "asc",
} as const;

export function fetchUpcomingProjects() {
  return fetchProjectList(1, "", "in_progress", upcomingProjectSettings);
}

export const adminUpcomingProjectQueryOptions = queryOptions({
  queryKey: customerProjectQueryKeys.projects.list(1, "", "in_progress", upcomingProjectSettings),
  queryFn: fetchUpcomingProjects,
});

export function getRecentInquiryPreview(items: readonly AdminInquiryListItem[]) {
  return items.slice(0, 5);
}

export function getUpcomingProjectPreview(items: readonly AdminProjectListItem[]) {
  return items.slice(0, 5);
}

export function getProjectLaunchDateLabel(date: string | null) {
  return date ?? "예정일 미정";
}
