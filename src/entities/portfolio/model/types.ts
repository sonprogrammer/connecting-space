import type { Database } from "@/shared/types/database.generated";

export type PortfolioRow =
  Database["public"]["Tables"]["portfolio_items"]["Row"];
