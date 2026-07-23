import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  LayoutTemplate,
  ReceiptText,
} from "lucide-react";

import { SubmitInquiryForm } from "@/features/submit-inquiry";
import { buttonVariants } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

const services = [
  {
    title: "브랜드형 홈페이지",
    description: "첫 인상, 신뢰 요소, 문의 전환 동선을 한 번에 정리합니다.",
    items: ["메인/서브 페이지 구성", "반응형 섹션 설계", "기본 SEO 문구"],
  },
  {
    title: "랜딩/프로모션 페이지",
    description: "광고 유입 후 바로 상담으로 이어지는 단일 목적 화면을 만듭니다.",
    items: ["문제-해결 구조", "가격/혜택 비교", "CTA 반복 배치"],
  },
  {
    title: "운영 개선 리뉴얼",
    description: "기존 아임웹 사이트를 유지하면서 전환과 관리 편의성을 개선합니다.",
    items: ["섹션 재배치", "문의 폼 개선", "콘텐츠 정리"],
  },
];

const process = [
  "목표와 현재 사이트 상태를 확인합니다.",
  "필수 섹션, 카피, 가격 범위를 먼저 확정합니다.",
  "아임웹에서 제작하고 모바일 화면까지 점검합니다.",
  "오픈 후 수정 요청과 운영 체크리스트를 정리합니다.",
];

const plans = [
  {
    name: "Starter",
    price: "90만원~",
    description: "명함형 사이트와 빠른 검증용 랜딩에 적합합니다.",
    features: ["메인 1p", "문의 CTA", "모바일 최적화"],
  },
  {
    name: "Business",
    price: "180만원~",
    description: "서비스 소개, 포트폴리오, FAQ가 필요한 표준 제작입니다.",
    features: ["메인+서브 4p", "가격/FAQ 섹션", "기본 운영 가이드"],
  },
  {
    name: "Growth",
    price: "협의",
    description: "콘텐츠가 많거나 운영 자동화가 필요한 프로젝트입니다.",
    features: ["콘텐츠 구조화", "전환 동선 개선", "확장 기능 설계"],
  },
];

const faqs = [
  {
    question: "제작 기간은 얼마나 걸리나요?",
    answer: "자료가 준비된 Starter는 1주 내외, Business는 보통 2~3주를 기준으로 잡습니다.",
  },
  {
    question: "아임웹 계정은 누가 준비하나요?",
    answer: "고객사 계정을 기준으로 작업합니다. 필요한 요금제와 권한은 착수 전에 안내합니다.",
  },
  {
    question: "수정 요청은 어떻게 진행되나요?",
    answer: "초안 확인 후 우선순위를 정해 반영합니다. 범위를 넘는 기능은 별도 견적으로 분리합니다.",
  },
];

export function PublicHome() {
  return (
    <main className="bg-[#fbfaf7] text-[#17201a]">
      <section className="border-b border-[#e4ded3] bg-white">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:py-16">
          <div>
            <p className="text-sm font-semibold text-[#2e6f4f]">Imweb Agency Operations</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-[#101815] sm:text-5xl lg:text-6xl">
              아임웹 제작 대행을 상담부터 오픈까지 분명하게 진행합니다
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#526057]">
              작은 사업자의 홈페이지 제작에서 가장 많이 막히는 범위, 가격, 일정, 수정 기준을 먼저 정리하고 전환에 필요한 화면을 제작합니다.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#inquiry"
                className={cn(buttonVariants({ size: "lg" }), "h-11 px-4")}
              >
                제작 문의하기
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link
                href="#pricing"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-4")}
              >
                가격 먼저 보기
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border border-[#d8d1c6] bg-[#f4f1ec] p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-md bg-[#2e6f4f] text-white">
                  <LayoutTemplate aria-hidden className="size-5" />
                </span>
                <div>
                  <p className="text-sm text-[#657268]">현재 진행 상황</p>
                  <strong className="text-lg">상담 대기 → 제작 중 → 오픈 준비</strong>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {["요구사항 정리", "초안 제작", "모바일 QA"].map((label) => (
                  <div key={label} className="rounded-md bg-white p-4 text-sm font-medium text-[#26352e]">
                    <CheckCircle2 aria-hidden className="mb-3 size-5 text-[#2e6f4f]" />
                    {label}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard label="평균 착수 준비" value="2일" />
              <MetricCard label="필수 산출물" value="기획+제작+QA" />
            </div>
          </div>
        </div>
      </section>

      <Section id="services" eyebrow="Services" title="필요한 제작 범위를 먼저 좁힙니다">
        <div className="grid gap-4 lg:grid-cols-3">
          {services.map((service) => (
            <article key={service.title} className="rounded-lg border border-[#e1dbd0] bg-white p-5">
              <h3 className="text-xl font-semibold">{service.title}</h3>
              <p className="mt-3 min-h-16 text-sm leading-6 text-[#5f6c63]">{service.description}</p>
              <ul className="mt-5 space-y-2 text-sm text-[#26352e]">
                {service.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 aria-hidden className="mt-0.5 size-4 text-[#2e6f4f]" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Section>

      <Section id="process" eyebrow="Process" title="진행 과정은 짧고 확인 가능하게 유지합니다">
        <div className="grid gap-3 md:grid-cols-4">
          {process.map((item, index) => (
            <div key={item} className="rounded-lg border border-[#e1dbd0] bg-white p-5">
              <span className="text-sm font-semibold text-[#2e6f4f]">0{index + 1}</span>
              <p className="mt-4 text-base font-medium leading-7">{item}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="pricing" eyebrow="Pricing" title="가격은 이후 관리자 데이터로 교체 가능한 구조입니다">
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.name} className="rounded-lg border border-[#d8d1c6] bg-white p-5">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-3 text-3xl font-semibold">{plan.price}</p>
              <p className="mt-3 min-h-12 text-sm leading-6 text-[#5f6c63]">{plan.description}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <ReceiptText aria-hidden className="mt-0.5 size-4 text-[#2e6f4f]" />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Section>

      <Section id="faq" eyebrow="FAQ" title="문의 전에 자주 확인하는 내용">
        <div className="grid gap-3">
          {faqs.map((faq) => (
            <article key={faq.question} className="rounded-lg border border-[#e1dbd0] bg-white p-5">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <HelpCircle aria-hidden className="size-5 text-[#2e6f4f]" />
                {faq.question}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#5f6c63]">{faq.answer}</p>
            </article>
          ))}
        </div>
      </Section>

      <section id="inquiry" className="bg-[#14261f] px-5 py-16 text-white sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.78fr_1.22fr]">
          <div>
            <p className="text-sm font-semibold text-[#a8d5ba]">Inquiry</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight">
              필요한 범위와 예산을 남기면 제작 가능 여부부터 확인합니다
            </h2>
            <p className="mt-4 leading-7 text-[#d7e5dc]">
              아임웹 계정 상태, 필요한 페이지, 원하는 오픈 시점을 기준으로 제작 범위와
              다음 확인 사항을 정리해 연락드립니다.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-[#e9f3ed]">
              {["제출 즉시 문의가 등록됩니다.", "서버 검증 오류는 필드별로 안내합니다.", "저장 실패 시 다시 시도할 수 있습니다."].map((item) => (
                <div key={item} className="flex gap-2">
                  <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-[#a8d5ba]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <SubmitInquiryForm />
        </div>
      </section>
    </main>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: Readonly<{
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <section id={id} className="px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-semibold text-[#2e6f4f]">{eyebrow}</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-[#101815]">{title}</h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-lg border border-[#d8d1c6] bg-white p-5">
      <p className="text-sm text-[#657268]">{label}</p>
      <strong className="mt-2 block text-2xl">{value}</strong>
    </div>
  );
}
