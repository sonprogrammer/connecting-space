import type { PublicPortfolioListItem } from "@/entities/portfolio";
import { jsonError, jsonOk } from "@/shared/api/response";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("portfolio_items")
    .select(
      "id, title, slug, summary, image_url, site_url, industry, published_at",
    )
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return jsonError("PUBLIC_PORTFOLIO_READ_FAILED", error.message, 500);
  }

  return jsonOk<PublicPortfolioListItem[]>(data);
}
