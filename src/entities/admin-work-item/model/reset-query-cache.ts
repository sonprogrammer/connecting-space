import type { QueryClient } from "@tanstack/react-query";
import { adminWorkItemsQueryKeys } from "./query-keys";

export function resetAdminWorkItemsCache(queryClient: QueryClient) {
  return queryClient.resetQueries({ queryKey: adminWorkItemsQueryKeys.all });
}
