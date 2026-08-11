import type {
  AdminPortfolioDetail,
  CreatePortfolioInput,
} from "@/entities/portfolio";

export type PortfolioFormValues = {
  projectId: string;
  title: string;
  slug: string;
  summary: string;
  imageUrl: string;
  siteUrl: string;
  industry: string;
  isPublished: boolean;
  sortOrder: string;
};

export const emptyPortfolioForm: PortfolioFormValues = {
  projectId: "",
  title: "",
  slug: "",
  summary: "",
  imageUrl: "",
  siteUrl: "",
  industry: "",
  isPublished: false,
  sortOrder: "0",
};

export function buildPortfolioPayload(
  values: PortfolioFormValues,
): CreatePortfolioInput {
  return {
    projectId: values.projectId.trim() || null,
    title: values.title.trim(),
    slug: values.slug.trim(),
    summary: values.summary.trim(),
    imageUrl: values.imageUrl.trim(),
    siteUrl: values.siteUrl.trim(),
    industry: values.industry.trim(),
    isPublished: values.isPublished,
    sortOrder: Number(values.sortOrder.trim() || 0),
  };
}

export function portfolioToFormValues(
  portfolio: AdminPortfolioDetail,
): PortfolioFormValues {
  return {
    projectId: portfolio.project_id ?? "",
    title: portfolio.title,
    slug: portfolio.slug,
    summary: portfolio.summary ?? "",
    imageUrl: portfolio.image_url ?? "",
    siteUrl: portfolio.site_url ?? "",
    industry: portfolio.industry ?? "",
    isPublished: portfolio.is_published,
    sortOrder: String(portfolio.sort_order),
  };
}
