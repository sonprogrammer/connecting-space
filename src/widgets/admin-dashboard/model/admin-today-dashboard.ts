import { z } from "zod";

export const workItemGroups = ["all", "newInquiry", "quote", "projectConversion", "overduePayment"] as const;
export type WorkItemGroup = (typeof workItemGroups)[number];

const workItemSchema = z.object({
  id: z.string(),
  group: z.enum(workItemGroups.slice(1)),
  kind: z.string(),
  priority: z.number(),
  waitingSince: z.string(),
  ageSeconds: z.number(),
  waitingSinceFallback: z.boolean(),
  entityId: z.string(),
  inquiryId: z.string().nullable(),
  projectId: z.string().nullable(),
  customerName: z.string(),
  title: z.string(),
  status: z.string(),
  deliveryStatus: z.string().nullable(),
  attemptCount: z.number().nullable(),
  maxAttempts: z.number().nullable(),
  dueDate: z.string().nullable(),
  action: z.enum(["review_inquiry", "create_quote", "send_quote", "retry_quote", "convert_quote", "record_payment"]),
  deepLink: z.string(),
});

export const adminWorkItemsResponseSchema = z.object({
  asOf: z.string(),
  counts: z.object({
    total: z.number(),
    newInquiry: z.number(),
    quote: z.number(),
    projectConversion: z.number(),
    overduePayment: z.number(),
  }),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), hasNextPage: z.boolean() }),
  items: z.array(workItemSchema),
});

export type AdminWorkItemsResponse = z.infer<typeof adminWorkItemsResponseSchema>;
export type AdminWorkItem = AdminWorkItemsResponse["items"][number];

export const todayDashboardActions = [
  { group: "newInquiry", title: "신규 문의 답변", description: "첫 답변이 필요한 신규 문의", countKey: "newInquiry" },
  { group: "quote", title: "견적 작성·발송", description: "작성 또는 발송이 필요한 견적", countKey: "quote" },
  { group: "projectConversion", title: "프로젝트 전환", description: "승인 후 프로젝트 전환이 필요한 견적", countKey: "projectConversion" },
  { group: "overduePayment", title: "연체 입금 확인", description: "기한이 지나 확인이 필요한 입금", countKey: "overduePayment" },
] as const satisfies readonly { group: Exclude<WorkItemGroup, "all">; title: string; description: string; countKey: keyof AdminWorkItemsResponse["counts"] }[];

export function buildAdminWorkItemsUrl({ group = "all", page = 1, pageSize = 25, asOf }: {
  group?: WorkItemGroup;
  page?: number;
  pageSize?: number;
  asOf?: string;
}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), group });
  if (asOf) params.set("asOf", asOf);
  return `/api/admin/work-items?${params.toString()}`;
}

export async function fetchAdminWorkItems(
  query: Parameters<typeof buildAdminWorkItemsUrl>[0] = {},
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AdminWorkItemsResponse> {
  const response = await fetcher(buildAdminWorkItemsUrl(query), {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error("관리자 권한을 확인해 주세요.");
    Object.assign(error, { status: response.status });
    throw error;
  }
  const result: unknown = await response.json();
  if (!response.ok) {
    const message = typeof result === "object" && result !== null && "error" in result
      && typeof result.error === "object" && result.error !== null && "message" in result.error
      && typeof result.error.message === "string" ? result.error.message : "업무 목록을 불러오지 못했습니다.";
    throw new Error(message);
  }
  const envelope = z.object({ data: adminWorkItemsResponseSchema }).safeParse(result);
  if (!envelope.success) throw new Error("업무 응답 형식이 올바르지 않습니다.");
  return envelope.data.data;
}

export function formatWorkItemAge(ageSeconds: number, overdue: boolean) {
  const days = Math.floor(ageSeconds / 86_400);
  if (days > 0) return `${days}일 ${overdue ? "연체" : "대기"}`;
  const hours = Math.floor(ageSeconds / 3_600);
  if (hours > 0) return `${hours}시간 ${overdue ? "연체" : "대기"}`;
  return `${Math.max(1, Math.floor(ageSeconds / 60))}분 ${overdue ? "연체" : "대기"}`;
}

export function getWorkItemActionLabel(action: AdminWorkItem["action"]) {
  const labels: Record<AdminWorkItem["action"], string> = {
    review_inquiry: "문의 확인",
    create_quote: "견적 작성",
    send_quote: "견적 발송",
    retry_quote: "발송 재시도",
    convert_quote: "프로젝트 전환",
    record_payment: "입금 확인",
  };
  return labels[action];
}
