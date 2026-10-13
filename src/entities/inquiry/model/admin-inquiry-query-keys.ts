export const adminInquiryQueryKeys = {
  all: ["admin", "inquiries"] as const,
  lists: () => [...adminInquiryQueryKeys.all, "list"] as const,
  list: (scope = "all") => [...adminInquiryQueryKeys.lists(), scope] as const,
  details: () => [...adminInquiryQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...adminInquiryQueryKeys.details(), id] as const,
};
