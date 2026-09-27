"use client";

import { useEffect, useState } from "react";

import type { PublicQuoteSnapshot } from "@/entities/quote/api/contracts";
import { buttonVariants } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import {
  approvePublicQuote,
  fetchPublicQuote,
  PublicQuoteRequestError,
} from "@/widgets/public-quote/model/public-quote-queries";
import {
  formatQuoteAmount,
  formatQuoteDate,
  getPublicQuoteErrorState,
  normalizeScopeItems,
  validateApprovalForm,
} from "@/widgets/public-quote/model/public-quote-state";

type LoadState = "loading" | "available" | "expired" | "unavailable" | "error" | "approved";

export function PublicQuoteApprovalPage({ token }: Readonly<{ token: string }>) {
  const [state, setState] = useState<LoadState>("loading");
  const [quote, setQuote] = useState<PublicQuoteSnapshot>();
  const [customerName, setCustomerName] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ customerName?: string; consent?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const loadQuote = () => {
    setState("loading");
    void fetchPublicQuote(token)
      .then((data) => {
        setQuote(data);
        setState("available");
      })
      .catch((error: unknown) => {
        setState(error instanceof PublicQuoteRequestError ? getPublicQuoteErrorState(error.status) : "error");
      });
  };

  useEffect(() => {
    void Promise.resolve().then(loadQuote);
    // A token identifies this one public route and does not change while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitApproval = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateApprovalForm({ customerName, consent });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || submitting) return;

    setSubmitting(true);
    try {
      await approvePublicQuote(token);
      setState("approved");
    } catch (error: unknown) {
      setState(error instanceof PublicQuoteRequestError ? getPublicQuoteErrorState(error.status) : "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-8.5rem)] bg-[#f8f6f1] px-5 py-12 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-3xl">
        {state === "loading" ? <LoadingState /> : null}
        {state === "expired" ? (
          <MessageState title="견적 링크가 만료되었습니다" description="새 견적 링크가 필요하다면 담당자에게 재발급을 요청해 주세요." />
        ) : null}
        {state === "unavailable" ? (
          <MessageState title="이미 처리되었거나 사용할 수 없는 링크입니다" description="링크가 만료되었거나 취소되었을 수 있습니다. 담당자에게 최신 견적 링크를 요청해 주세요." />
        ) : null}
        {state === "error" ? (
          <MessageState title="견적을 불러오지 못했습니다" description="잠시 후 다시 시도하거나 담당자에게 링크를 확인해 주세요." action={<button type="button" onClick={loadQuote} className={buttonVariants({ variant: "outline", size: "lg" })}>다시 시도</button>} />
        ) : null}
        {state === "approved" ? <ApprovedState /> : null}
        {state === "available" && quote ? (
          <QuoteContent
            quote={quote}
            customerName={customerName}
            consent={consent}
            errors={errors}
            submitting={submitting}
            onCustomerNameChange={setCustomerName}
            onConsentChange={setConsent}
            onSubmit={submitApproval}
          />
        ) : null}
      </div>
    </main>
  );
}

function LoadingState() {
  return <div role="status" aria-live="polite" className="rounded-3xl border border-[#e4ded3] bg-white p-8 text-center text-[#526057] shadow-sm">견적을 안전하게 불러오는 중입니다…</div>;
}

function MessageState({ title, description, action }: Readonly<{ title: string; description: string; action?: React.ReactNode }>) {
  return <section aria-labelledby="message-title" className="rounded-3xl border border-[#e4ded3] bg-white p-8 text-center shadow-sm sm:p-12"><p className="text-sm font-semibold text-[#2e6f4f]">고객용 견적</p><h1 id="message-title" className="mt-3 text-2xl font-bold tracking-tight text-[#17201a] sm:text-3xl">{title}</h1><p className="mx-auto mt-4 max-w-md leading-7 text-[#617068]">{description}</p>{action ? <div className="mt-7">{action}</div> : null}</section>;
}

function ApprovedState() {
  return <section role="status" aria-live="polite" aria-labelledby="approved-title" className="rounded-3xl border border-[#c7dfce] bg-[#f1faf3] p-8 text-center shadow-sm sm:p-12"><p className="text-sm font-semibold text-[#2e6f4f]">승인 완료</p><h1 id="approved-title" className="mt-3 text-2xl font-bold tracking-tight text-[#17201a] sm:text-3xl">견적 승인이 완료되었습니다</h1><p className="mx-auto mt-4 max-w-md leading-7 text-[#526057]">다음 단계는 정식 계약서 이메일 발송입니다. 담당자가 이어서 안내해 드립니다.</p></section>;
}

function QuoteContent({ quote, customerName, consent, errors, submitting, onCustomerNameChange, onConsentChange, onSubmit }: Readonly<{ quote: PublicQuoteSnapshot; customerName: string; consent: boolean; errors: { customerName?: string; consent?: string }; submitting: boolean; onCustomerNameChange: (value: string) => void; onConsentChange: (value: boolean) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }>) {
  const scopeItems = normalizeScopeItems(quote.scopeItems);
  return <article className="space-y-6"><header className="rounded-3xl border border-[#e4ded3] bg-white p-7 shadow-sm sm:p-10"><p className="text-sm font-semibold text-[#2e6f4f]">고객용 견적 · {quote.versionNumber}차 견적</p><h1 className="mt-3 text-3xl font-bold tracking-tight text-[#17201a] sm:text-4xl">{quote.title}</h1><p className="mt-3 text-[#526057]">{quote.customerName}님을 위한 견적입니다.</p></header><section aria-labelledby="quote-detail-title" className="rounded-3xl border border-[#e4ded3] bg-white p-7 shadow-sm sm:p-10"><h2 id="quote-detail-title" className="text-xl font-bold text-[#17201a]">견적 상세</h2><p className="mt-4 whitespace-pre-wrap leading-7 text-[#526057]">{quote.body}</p>{scopeItems.length > 0 ? <div className="mt-7"><h3 className="text-sm font-bold text-[#17201a]">작업 범위</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-[#526057]">{scopeItems.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}<dl className="mt-8 grid gap-4 sm:grid-cols-2"><Detail label="예상 일정" value={`${formatQuoteDate(quote.estimatedStartDate)} ~ ${formatQuoteDate(quote.estimatedEndDate)}`} /><Detail label="견적 유효기간" value={formatQuoteDate(quote.expiresAt.slice(0, 10))} /></dl></section><section aria-labelledby="amount-title" className="rounded-3xl border border-[#2e6f4f] bg-[#f1faf3] p-7 shadow-sm sm:p-10"><h2 id="amount-title" className="text-xl font-bold text-[#17201a]">금액 및 결제 조건</h2><dl className="mt-5 space-y-4"><Detail label="총 견적 금액" value={formatQuoteAmount(quote.totalAmount)} emphasized /><Detail label="계약금" value={`${formatQuoteAmount(quote.depositAmount)} · ${quote.depositTerms}`} /><Detail label="잔금" value={`${formatQuoteAmount(quote.balanceAmount)} · ${quote.balanceTerms}`} /></dl></section><form onSubmit={onSubmit} noValidate aria-busy={submitting} className="rounded-3xl border border-[#e4ded3] bg-white p-7 shadow-sm sm:p-10"><h2 className="text-xl font-bold text-[#17201a]">견적 승인</h2><p className="mt-2 text-sm leading-6 text-[#617068]">내용을 확인한 뒤 고객명을 입력하고 명시적으로 동의해 주세요.</p><label className="mt-6 block text-sm font-semibold text-[#17201a]" htmlFor="customer-name">고객명<input id="customer-name" name="customerName" value={customerName} onChange={(event) => onCustomerNameChange(event.target.value)} aria-invalid={Boolean(errors.customerName)} aria-describedby={errors.customerName ? "customer-name-error" : undefined} autoComplete="name" className="mt-2 h-11 w-full rounded-lg border border-[#d8d1c6] bg-white px-3 font-normal outline-none focus:border-[#2e6f4f] focus:ring-2 focus:ring-[#2e6f4f]/20" disabled={submitting} required />{errors.customerName ? <span id="customer-name-error" className="mt-2 block text-sm font-normal text-[#b42318]">{errors.customerName}</span> : null}</label><label className="mt-5 flex items-start gap-3 text-sm leading-6 text-[#526057]" htmlFor="approval-consent"><input id="approval-consent" type="checkbox" checked={consent} onChange={(event) => onConsentChange(event.target.checked)} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? "approval-consent-error" : undefined} className="mt-1 size-4 shrink-0 accent-[#2e6f4f]" disabled={submitting} required /><span>견적 내용과 금액, 결제 조건을 확인했으며 승인을 진행하는 데 동의합니다.</span></label>{errors.consent ? <p id="approval-consent-error" className="mt-2 text-sm text-[#b42318]">{errors.consent}</p> : null}<button type="submit" disabled={submitting} className={cn(buttonVariants({ size: "lg" }), "mt-7 h-12 w-full px-5 sm:w-auto")}>{submitting ? "승인 처리 중…" : "견적 승인하기"}</button></form></article>;
}

function Detail({ label, value, emphasized = false }: Readonly<{ label: string; value: string; emphasized?: boolean }>) {
  return <div className="flex flex-col gap-1"><dt className="text-sm text-[#617068]">{label}</dt><dd className={cn("font-semibold text-[#17201a]", emphasized ? "text-2xl" : "text-base")}>{value}</dd></div>;
}
