"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, HelpCircle, Loader2, RefreshCw, Timer } from "lucide-react";

import type { FaqItem, ServiceOffering } from "@/entities/automation";
import type { ApiResponse } from "@/shared/types/api";
import { Button } from "@/shared/ui/button";
import { toPublicContentState, type PublicContentState } from "../model/public-content-state";

export function PublicAutomationContent() {
  const [services, setServices] = useState<PublicContentState<ServiceOffering>>({ status: "loading" });
  const [faqs, setFaqs] = useState<PublicContentState<FaqItem>>({ status: "loading" });

  const load = useCallback(async () => {
    setServices({ status: "loading" });
    setFaqs({ status: "loading" });
    try {
      const [serviceResponse, faqResponse] = await Promise.all([
        fetch("/api/service-offerings", { headers: { Accept: "application/json" } }),
        fetch("/api/faqs", { headers: { Accept: "application/json" } }),
      ]);
      const [serviceResult, faqResult] = await Promise.all([
        serviceResponse.json() as Promise<ApiResponse<ServiceOffering[]>>,
        faqResponse.json() as Promise<ApiResponse<FaqItem[]>>,
      ]);
      setServices(toPublicContentState(serviceResult));
      setFaqs(toPublicContentState(faqResult));
    } catch {
      const error = { status: "error", message: "콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." } as const;
      setServices(error);
      setFaqs(error);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  return (
    <>
      <PublicSection id="pricing" eyebrow="Pricing" title="범위와 예산에 맞는 제작 옵션을 확인하세요">
        <ServiceContent state={services} onRetry={() => void load()} />
      </PublicSection>
      <PublicSection id="faq" eyebrow="FAQ" title="문의 전에 자주 확인하는 내용">
        <FaqContent state={faqs} onRetry={() => void load()} />
      </PublicSection>
    </>
  );
}

function ServiceContent({ state, onRetry }: Readonly<{ state: PublicContentState<ServiceOffering>; onRetry: () => void }>) {
  if (state.status === "loading") return <Loading label="서비스와 가격을 불러오는 중입니다." />;
  if (state.status === "error") return <LoadError message={state.message} onRetry={onRetry} />;
  if (state.status === "empty") return <Empty message="현재 공개된 제작 서비스가 없습니다. 제작 문의로 필요한 범위를 알려주세요." />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {state.items.map((service) => (
        <article key={service.id} className="flex h-full flex-col rounded-lg border border-[#d8d1c6] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold">{service.name}</h3>
            <span className="shrink-0 rounded-full bg-[#eaf3ed] px-2.5 py-1 text-xs font-semibold text-[#23583f]">{service.durationLabel}</span>
          </div>
          <p className="mt-3 text-3xl font-semibold">{service.priceLabel}</p>
          <p className="mt-3 text-sm leading-6 text-[#5f6c63]">{service.description}</p>
          {service.includedItems.length > 0 ? (
            <ul className="mt-5 space-y-2 text-sm">
              {service.includedItems.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-[#2e6f4f]" />{item}</li>)}
            </ul>
          ) : null}
          {service.excludedItems.length > 0 ? <p className="mt-auto pt-5 text-xs leading-5 text-[#6d5d52]">별도 협의: {service.excludedItems.join(", ")}</p> : null}
        </article>
      ))}
    </div>
  );
}

function FaqContent({ state, onRetry }: Readonly<{ state: PublicContentState<FaqItem>; onRetry: () => void }>) {
  if (state.status === "loading") return <Loading label="FAQ를 불러오는 중입니다." />;
  if (state.status === "error") return <LoadError message={state.message} onRetry={onRetry} />;
  if (state.status === "empty") return <Empty message="현재 공개된 FAQ가 없습니다." />;
  return <div className="grid gap-3">{state.items.map((faq) => (
    <article key={faq.id} className="rounded-lg border border-[#e1dbd0] bg-white p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold"><HelpCircle aria-hidden className="size-5 shrink-0 text-[#2e6f4f]" />{faq.question}</h3>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#5f6c63]">{faq.answer}</p>
    </article>
  ))}</div>;
}

function Loading({ label }: Readonly<{ label: string }>) {
  return <div role="status" className="flex min-h-40 items-center justify-center gap-2 rounded-lg border border-[#e1dbd0] bg-white text-sm text-[#617068]"><Loader2 aria-hidden className="size-5 animate-spin text-[#2e6f4f]" />{label}</div>;
}

function LoadError({ message, onRetry }: Readonly<{ message: string; onRetry: () => void }>) {
  return <div role="alert" className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-[#efc7c2] bg-white p-6 text-center"><AlertCircle aria-hidden className="size-7 text-[#b42318]" /><p className="mt-3 text-sm text-[#912018]">{message}</p><Button type="button" variant="outline" className="mt-4" onClick={onRetry}><RefreshCw aria-hidden />다시 시도</Button></div>;
}

function Empty({ message }: Readonly<{ message: string }>) {
  return <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-[#d8d1c6] bg-white p-6 text-center"><Timer aria-hidden className="size-7 text-[#8a968d]" /><p className="mt-3 text-sm text-[#617068]">{message}</p></div>;
}

function PublicSection({ id, eyebrow, title, children }: Readonly<{ id: string; eyebrow: string; title: string; children: React.ReactNode }>) {
  return <section id={id} className="px-5 py-16 sm:px-8"><div className="mx-auto max-w-7xl"><p className="text-sm font-semibold text-[#2e6f4f]">{eyebrow}</p><h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-[#101815]">{title}</h2><div className="mt-8">{children}</div></div></section>;
}
