import type { AdminInquiryListItem } from "@/entities/inquiry";

export type TodayInquirySort = "oldest" | "newest";

export const todayDashboardActions = [
  {
    id: "inquiries",
    title: "신규 문의 답변",
    description: "신규 문의의 첫 답변이 필요합니다.",
    href: "/admin/inquiries",
    available: true,
  },
  {
    id: "quotes",
    title: "견적 작성·발송",
    description: "견적 전체를 조회하는 API가 아직 없습니다.",
    href: null,
    available: false,
  },
  {
    id: "conversions",
    title: "프로젝트 전환",
    description: "전환 대상 목록은 없으며, 기존 전환 작업은 문의 상세에 있습니다.",
    href: null,
    available: false,
  },
  {
    id: "payments",
    title: "연체 입금 확인",
    description: "전체 입금과 연체를 조회하는 API가 아직 없습니다.",
    href: null,
    available: false,
  },
] as const;

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
