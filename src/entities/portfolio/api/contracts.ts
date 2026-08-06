import type { PortfolioRow } from "../model/types";

export type PublicPortfolioListItem = Pick<
  PortfolioRow,
  | "id"
  | "title"
  | "slug"
  | "summary"
  | "image_url"
  | "site_url"
  | "industry"
  | "published_at"
>;

export type AdminPortfolioListItem = PortfolioRow;
export type AdminPortfolioDetail = PortfolioRow;
export type AdminPortfolioCreateResponse = PortfolioRow;
export type AdminPortfolioUpdateResponse = PortfolioRow;
