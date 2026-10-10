import type { AdminInquiryListItem } from "@/entities/inquiry";

export type TodayInquirySort = "oldest" | "newest";

export function getTodayInquiryTasks(
  inquiries: readonly AdminInquiryListItem[],
  sort: TodayInquirySort,
) {
  return inquiries
    .filter((inquiry) => inquiry.status === "new")
    .toSorted((left, right) => {
      const difference =
        Date.parse(left.created_at) - Date.parse(right.created_at);
      return sort === "oldest" ? difference : -difference;
    });
}
