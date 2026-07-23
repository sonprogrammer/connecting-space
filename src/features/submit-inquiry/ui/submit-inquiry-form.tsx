"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";

import { Button } from "@/shared/ui/button";
import type { ApiFailure, ApiResponse } from "@/shared/types/api";

import { createInquiryInputFromFormData } from "../model/form-data";

type InquiryCreated = {
  id: string;
  status: "new";
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; inquiryId: string }
  | { status: "error"; message: string }
  | {
      status: "validation";
      message: string;
      fieldErrors: Record<string, string[]>;
    };

const initialState: SubmitState = { status: "idle" };

const serviceOptions = [
  { value: "brand-homepage", label: "브랜드형 홈페이지" },
  { value: "landing-page", label: "랜딩/프로모션 페이지" },
  { value: "renewal", label: "운영 개선 리뉴얼" },
  { value: "consulting", label: "범위 상담 후 결정" },
];

export function SubmitInquiryForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<SubmitState>(initialState);
  const isSubmitting = state.status === "submitting";
  const fieldErrors = state.status === "validation" ? state.fieldErrors : {};

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const payload = createInquiryInputFromFormData(
      new FormData(event.currentTarget),
    );

    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ApiResponse<InquiryCreated>;

      if (!response.ok || "error" in result) {
        setState(createFailureState(result, response.status));
        return;
      }

      formRef.current?.reset();
      setState({ status: "success", inquiryId: result.data.id });
    } catch {
      setState({
        status: "error",
        message:
          "문의 제출 중 네트워크 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="rounded-lg border border-[#d9e7dc] bg-white p-5 text-[#17201a] shadow-sm sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="고객명" htmlFor="customerName" error={firstError(fieldErrors.customerName)}>
          <input
            id="customerName"
            name="customerName"
            required
            maxLength={80}
            autoComplete="name"
            className={fieldClassName}
            placeholder="홍길동"
            disabled={isSubmitting}
          />
        </Field>

        <Field label="이메일" htmlFor="email" error={firstError(fieldErrors.email)}>
          <input
            id="email"
            name="email"
            type="email"
            maxLength={255}
            autoComplete="email"
            className={fieldClassName}
            placeholder="son@example.com"
            disabled={isSubmitting}
          />
        </Field>

        <Field label="연락처" htmlFor="phone" error={firstError(fieldErrors.phone)}>
          <input
            id="phone"
            name="phone"
            required
            minLength={7}
            maxLength={40}
            inputMode="tel"
            autoComplete="tel"
            className={fieldClassName}
            placeholder="010-0000-0000"
            disabled={isSubmitting}
          />
        </Field>

        <Field label="회사명" htmlFor="companyName" error={firstError(fieldErrors.companyName)}>
          <input
            id="companyName"
            name="companyName"
            maxLength={120}
            autoComplete="organization"
            className={fieldClassName}
            placeholder="회사 또는 브랜드명"
            disabled={isSubmitting}
          />
        </Field>

        <Field label="웹사이트" htmlFor="websiteUrl" error={firstError(fieldErrors.websiteUrl)}>
          <input
            id="websiteUrl"
            name="websiteUrl"
            type="url"
            maxLength={500}
            autoComplete="url"
            className={fieldClassName}
            placeholder="https://example.com"
            disabled={isSubmitting}
          />
        </Field>

        <Field label="서비스 유형" htmlFor="serviceType" error={firstError(fieldErrors.serviceType)}>
          <select
            id="serviceType"
            name="serviceType"
            required
            className={fieldClassName}
            defaultValue=""
            disabled={isSubmitting}
          >
            <option value="" disabled>
              선택해 주세요
            </option>
            {serviceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="희망 일정"
          htmlFor="desiredLaunchDate"
          error={firstError(fieldErrors.desiredLaunchDate)}
        >
          <input
            id="desiredLaunchDate"
            name="desiredLaunchDate"
            type="date"
            className={fieldClassName}
            disabled={isSubmitting}
          />
        </Field>

        <Field label="예산 하한" htmlFor="budgetMin" error={firstError(fieldErrors.budgetMin)}>
          <input
            id="budgetMin"
            name="budgetMin"
            type="number"
            min={0}
            step={100000}
            inputMode="numeric"
            className={fieldClassName}
            placeholder="900000"
            disabled={isSubmitting}
          />
        </Field>

        <Field label="예산 상한" htmlFor="budgetMax" error={firstError(fieldErrors.budgetMax)}>
          <input
            id="budgetMax"
            name="budgetMax"
            type="number"
            min={0}
            step={100000}
            inputMode="numeric"
            className={fieldClassName}
            placeholder="1800000"
            disabled={isSubmitting}
          />
        </Field>
      </div>

      <Field
        label="요구사항"
        htmlFor="message"
        error={firstError(fieldErrors.message)}
        className="mt-4"
      >
        <textarea
          id="message"
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          className={fieldClassName}
          placeholder="현재 상황, 필요한 페이지, 참고 사이트, 원하는 오픈 시점을 적어 주세요."
          disabled={isSubmitting}
        />
      </Field>

      <StatusMessage state={state} />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-[#6a786f]">
          제출 후 문의 내용 확인과 제작 범위 정리를 위해 연락드립니다.
        </p>
        <Button type="submit" size="lg" className="h-11 px-4" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <Send aria-hidden className="size-4" />
          )}
          {isSubmitting ? "제출 중" : "문의 제출"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: Readonly<{
  label: string;
  htmlFor: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}>) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-[#24352c]">
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="mt-2 text-sm text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function StatusMessage({ state }: Readonly<{ state: SubmitState }>) {
  if (state.status === "idle" || state.status === "submitting") {
    return null;
  }

  if (state.status === "success") {
    return (
      <div className="mt-5 rounded-md border border-[#9fcfb2] bg-[#edf8f1] p-4 text-sm text-[#17492f]">
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>
            문의가 접수되었습니다. 접수번호 {state.inquiryId.slice(0, 8)} 기준으로
            내용을 확인한 뒤 연락드리겠습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-md border border-[#f3b7ad] bg-[#fff2ef] p-4 text-sm text-[#912018]">
      <div className="flex items-start gap-3">
        <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
        <p>{state.message}</p>
      </div>
    </div>
  );
}

function createFailureState(
  result: ApiResponse<InquiryCreated>,
  status: number,
): SubmitState {
  if ("data" in result) {
    return {
      status: "error",
      message: `문의 저장에 실패했습니다. 다시 시도해 주세요. (${status})`,
    };
  }

  if (result.error.code === "VALIDATION_ERROR") {
    return {
      status: "validation",
      message: "입력값을 다시 확인해 주세요.",
      fieldErrors: extractFieldErrors(result.error),
    };
  }

  return {
    status: "error",
    message: result.error.message || "문의 저장에 실패했습니다. 다시 시도해 주세요.",
  };
}

function extractFieldErrors(error: ApiFailure["error"]) {
  if (!isFieldErrorDetails(error.details)) {
    return {};
  }

  return error.details.fieldErrors;
}

function isFieldErrorDetails(
  details: unknown,
): details is { fieldErrors: Record<string, string[]> } {
  if (!details || typeof details !== "object" || !("fieldErrors" in details)) {
    return false;
  }

  const fieldErrors = (details as { fieldErrors: unknown }).fieldErrors;

  return Boolean(fieldErrors && typeof fieldErrors === "object");
}

function firstError(errors: string[] | undefined) {
  return errors?.[0];
}

const fieldClassName =
  "min-h-11 w-full rounded-md border border-[#cfd8d0] bg-white px-3 py-2 text-sm text-[#17201a] outline-none transition focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/20 disabled:cursor-not-allowed disabled:bg-[#f3f5f2] disabled:text-[#8a968d]";
