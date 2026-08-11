"use client";

import Image, { type ImageLoaderProps } from "next/image";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, ImageOff, Loader2, RefreshCw } from "lucide-react";

import type { PublicPortfolioListItem } from "@/entities/portfolio";
import type { ApiResponse } from "@/shared/types/api";
import { Button } from "@/shared/ui/button";

import {
  toPublicPortfolioState,
  type PublicPortfolioState,
} from "../model/portfolio-state";

function passthroughImageLoader({ src }: ImageLoaderProps) {
  return src;
}

export function PublicPortfolioSection() {
  const [state, setState] = useState<PublicPortfolioState>({ status: "loading" });

  const loadPortfolio = useCallback(async () => {
    try {
      const response = await fetch("/api/portfolio", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const result = (await response.json()) as ApiResponse<PublicPortfolioListItem[]>;

      setState(
        response.ok
          ? toPublicPortfolioState(result)
          : "error" in result
            ? toPublicPortfolioState(result)
            : { status: "error", message: "포트폴리오를 불러오지 못했습니다." },
      );
    } catch {
      setState({
        status: "error",
        message: "네트워크 문제로 포트폴리오를 불러오지 못했습니다.",
      });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPortfolio();
    });
  }, [loadPortfolio]);

  return (
    <section id="portfolio" className="border-y border-[#e4ded3] bg-white px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold text-[#2e6f4f]">Portfolio</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-[#101815]">
          실제 비즈니스의 목적과 운영을 함께 고려한 작업 사례입니다
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[#617068]">
          업종과 고객 여정에 맞춰 정보 구조, 전환 동선, 모바일 경험을 정리했습니다.
        </p>
        <div className="mt-8">
          <PortfolioContent state={state} onRetry={() => {
            setState({ status: "loading" });
            void loadPortfolio();
          }} />
        </div>
      </div>
    </section>
  );
}

function PortfolioContent({
  state,
  onRetry,
}: Readonly<{
  state: PublicPortfolioState;
  onRetry: () => void;
}>) {
  if (state.status === "loading") {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="포트폴리오를 불러오는 중">
        {[0, 1, 2].map((item) => (
          <div key={item} className="overflow-hidden rounded-lg border border-[#e1dbd0] bg-[#f7f5f1]">
            <div className="aspect-[16/10] animate-pulse bg-[#ebe7df]" />
            <div className="space-y-3 p-5">
              <div className="h-4 w-20 animate-pulse rounded bg-[#e1ddd5]" />
              <div className="h-6 w-2/3 animate-pulse rounded bg-[#e1ddd5]" />
              <div className="h-4 w-full animate-pulse rounded bg-[#e1ddd5]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-[#ead8d3] bg-[#fff8f6] p-8 text-center">
        <AlertCircle aria-hidden className="size-8 text-[#b42318]" />
        <p className="mt-3 font-medium text-[#912018]">작업 사례를 불러오지 못했습니다</p>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#617068]">{state.message}</p>
        <Button type="button" variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw aria-hidden className="size-4" />
          다시 시도
        </Button>
      </div>
    );
  }

  if (state.items.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-[#d8d1c6] bg-[#f7f5f1] p-8 text-center">
        <Loader2 aria-hidden className="size-8 text-[#718078]" />
        <p className="mt-3 font-medium">등록된 작업 사례를 준비 중입니다.</p>
        <p className="mt-2 text-sm text-[#617068]">곧 새로운 제작 사례를 소개하겠습니다.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {state.items.map((item) => (
        <PortfolioCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function PortfolioCard({ item }: Readonly<{ item: PublicPortfolioListItem }>) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.image_url) && !imageFailed;

  return (
    <article className="overflow-hidden rounded-lg border border-[#e1dbd0] bg-[#fbfaf7]">
      <div className="relative aspect-[16/10] overflow-hidden bg-[#e9eee9]">
        {showImage ? (
          <Image
            loader={passthroughImageLoader}
            unoptimized
            fill
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
            src={item.image_url!}
            alt={`${item.title} 작업 미리보기`}
            className="object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[#526057]">
            <ImageOff aria-hidden className="size-7" />
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em]">
              {item.industry || "Website"}
            </p>
            <p className="mt-2 text-lg font-semibold text-[#26352e]">{item.title}</p>
          </div>
        )}
      </div>
      <div className="p-5">
        <p className="text-xs font-semibold text-[#2e6f4f]">{item.industry || "웹사이트 제작"}</p>
        <h3 className="mt-2 text-xl font-semibold text-[#17201a]">{item.title}</h3>
        {item.summary ? (
          <p className="mt-3 text-sm leading-6 text-[#617068]">{item.summary}</p>
        ) : null}
        {item.site_url ? (
          <a
            href={item.site_url}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#23583f] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2e6f4f]"
          >
            사이트 보기
            <ArrowUpRight aria-hidden className="size-4" />
          </a>
        ) : null}
      </div>
    </article>
  );
}
