"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  AdminInquiryQuotesError,
  fetchInquiryQuotes,
  getInquiryQuotesQueryKey,
} from "../model/admin-inquiry-quotes-queries";
import {
  formatApprovalDate,
  getInquiryQuoteApprovalLabel,
  getInquiryQuoteStatusLabel,
} from "../model/admin-inquiry-quotes-state";

export function InquiryQuoteSummary({ inquiryId }: Readonly<{ inquiryId: string }>) {
  const query = useQuery({
    queryKey: getInquiryQuotesQueryKey(inquiryId),
    queryFn: () => fetchInquiryQuotes(inquiryId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  return (
    <section className="rounded-lg border border-[#dfe3dc] bg-white p-4 sm:p-5" aria-labelledby="inquiry-quotes-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2e6f4f]">연결 견적</p>
          <h3 id="inquiry-quotes-title" className="mt-1 text-lg font-semibold">견적·고객 승인 결과</h3>
          <p className="mt-1 text-sm leading-6 text-[#617068]">이 문의에 연결된 견적을 최신순으로 확인합니다.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <RefreshCw aria-hidden className={query.isFetching ? "size-4 animate-spin" : "size-4"} />새로고침
        </Button>
      </div>

      {query.isLoading ? <div role="status" className="mt-4 flex items-center gap-2 rounded-md bg-[#f7f8f5] p-4 text-sm text-[#617068]"><Loader2 aria-hidden className="size-4 animate-spin" />연결 견적을 불러오는 중입니다.</div> : null}
      {query.isError ? <QuoteError error={query.error} onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.isError && query.data?.quotes.length === 0 ? <div className="mt-4 rounded-md border border-dashed border-[#dfe3dc] p-5 text-center text-sm text-[#617068]">연결된 견적이 없습니다.</div> : null}
      {query.data?.quotes.length ? <div className="mt-4 grid gap-3">{query.data.quotes.map((quote) => <article key={quote.id} className="rounded-md border border-[#e8ebe5] bg-[#fbfcf9] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold text-[#17201a]">견적 상태: {getInquiryQuoteStatusLabel(quote.status)}</h4><p className="mt-1 text-xs text-[#617068]">생성 {formatApprovalDate(quote.createdAt)} · 수정 {formatApprovalDate(quote.updatedAt)}</p></div><span className={quote.approval ? "inline-flex items-center gap-1 rounded-md bg-[#eaf3ed] px-2.5 py-1 text-xs font-semibold text-[#23583f]" : "inline-flex items-center gap-1 rounded-md bg-[#f0f1ef] px-2.5 py-1 text-xs font-semibold text-[#617068]"}>{quote.approval ? <CheckCircle2 aria-hidden className="size-3.5" /> : <Clock3 aria-hidden className="size-3.5" />}{getInquiryQuoteApprovalLabel(quote.approval)}</span></div>{quote.approval ? <dl className="mt-4 grid gap-3 sm:grid-cols-3"><Detail label="승인자명" value={quote.approval.approverName || "확인되지 않음"} /><Detail label="동의 버전" value={quote.approval.consentVersion || "확인되지 않음"} /><Detail label="승인 시각" value={formatApprovalDate(quote.approval.approvedAt)} /></dl> : <p className="mt-3 text-sm text-[#617068]">고객 승인이 아직 확인되지 않았습니다.</p>}</article>)}</div> : null}
    </section>
  );
}

function QuoteError({ error, onRetry }: Readonly<{ error: unknown; onRetry: () => void }>) {
  const message = error instanceof AdminInquiryQuotesError && error.status === 404 ? "문의 또는 연결 견적을 찾을 수 없습니다." : error instanceof Error ? error.message : "연결 견적을 불러오지 못했습니다.";
  return <div role="alert" className="mt-4 rounded-md border border-[#f4d4d1] bg-[#fff1f0] p-4 text-sm text-[#912018]"><div className="flex items-start gap-2"><AlertCircle aria-hidden className="mt-0.5 size-4" /><span>{message}</span></div><Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>다시 시도</Button></div>;
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) { return <div><dt className="text-xs font-semibold text-[#617068]">{label}</dt><dd className="mt-1 break-words text-sm text-[#17201a]">{value}</dd></div>; }
