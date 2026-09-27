import type { Metadata } from "next";

import { PublicQuoteApprovalPage } from "@/widgets/public-quote/ui/public-quote-approval-page";

export const metadata: Metadata = {
  title: "견적 확인 | Imweb Ops",
  description: "고객용 견적 확인 및 승인 페이지",
};

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicQuoteApprovalPage token={token} />;
}
