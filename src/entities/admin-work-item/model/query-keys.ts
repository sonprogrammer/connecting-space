export const adminWorkItemsQueryKeys = {
  all: ["admin", "work-items"] as const,
  list: ({ group, sort, pageSize }: { group: string; sort: string; pageSize: number }) =>
    [...adminWorkItemsQueryKeys.all, "list", { group, sort, pageSize }] as const,
};
