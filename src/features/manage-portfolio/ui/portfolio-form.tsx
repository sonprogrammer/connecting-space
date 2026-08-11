"use client";

import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Loader2 } from "lucide-react";

import type { PortfolioFormValues } from "../model/portfolio-form";

export type PortfolioFormProps = {
  value: PortfolioFormValues;
  onChange: (value: PortfolioFormValues) => void;
  onSubmit: () => void;
  disabled: boolean;
  submitLabel: string;
  fieldErrors: Record<string, string[]>;
};

const inputClassName =
  "mt-2 w-full rounded-md border border-[#cfd6ce] bg-white px-3 py-2 text-sm text-[#17201a] outline-none transition placeholder:text-[#929c95] focus:border-[#2e6f4f] focus:ring-2 focus:ring-[#2e6f4f]/15 disabled:cursor-not-allowed disabled:bg-[#f0f2ee]";

export function PortfolioForm({
  value,
  onChange,
  onSubmit,
  disabled,
  submitLabel,
  fieldErrors,
}: PortfolioFormProps) {
  function updateTextField(
    field: Exclude<keyof PortfolioFormValues, "isPublished">,
  ) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange({ ...value, [field]: event.target.value });
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="제목" htmlFor="portfolio-title" error={fieldErrors.title?.[0]} required>
          <input
            id="portfolio-title"
            className={inputClassName}
            value={value.title}
            onChange={updateTextField("title")}
            disabled={disabled}
            required
            maxLength={160}
            aria-invalid={Boolean(fieldErrors.title?.length)}
            aria-describedby={fieldErrors.title?.length ? "portfolio-title-error" : undefined}
          />
        </Field>

        <Field label="Slug" htmlFor="portfolio-slug" error={fieldErrors.slug?.[0]} required>
          <input
            id="portfolio-slug"
            className={inputClassName}
            value={value.slug}
            onChange={updateTextField("slug")}
            disabled={disabled}
            required
            maxLength={120}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="pilates-studio"
            aria-invalid={Boolean(fieldErrors.slug?.length)}
            aria-describedby={fieldErrors.slug?.length ? "portfolio-slug-error" : undefined}
          />
        </Field>
      </div>

      <Field label="요약" htmlFor="portfolio-summary" error={fieldErrors.summary?.[0]}>
        <textarea
          id="portfolio-summary"
          className={`${inputClassName} min-h-28 resize-y`}
          value={value.summary}
          onChange={updateTextField("summary")}
          disabled={disabled}
          maxLength={1000}
          aria-invalid={Boolean(fieldErrors.summary?.length)}
          aria-describedby={fieldErrors.summary?.length ? "portfolio-summary-error" : undefined}
        />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="이미지 URL" htmlFor="portfolio-image-url" error={fieldErrors.imageUrl?.[0]}>
          <input
            id="portfolio-image-url"
            type="url"
            className={inputClassName}
            value={value.imageUrl}
            onChange={updateTextField("imageUrl")}
            disabled={disabled}
            placeholder="https://example.com/image.jpg"
            aria-invalid={Boolean(fieldErrors.imageUrl?.length)}
            aria-describedby={fieldErrors.imageUrl?.length ? "portfolio-image-url-error" : undefined}
          />
        </Field>

        <Field label="사이트 URL" htmlFor="portfolio-site-url" error={fieldErrors.siteUrl?.[0]}>
          <input
            id="portfolio-site-url"
            type="url"
            className={inputClassName}
            value={value.siteUrl}
            onChange={updateTextField("siteUrl")}
            disabled={disabled}
            placeholder="https://example.com"
            aria-invalid={Boolean(fieldErrors.siteUrl?.length)}
            aria-describedby={fieldErrors.siteUrl?.length ? "portfolio-site-url-error" : undefined}
          />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="업종" htmlFor="portfolio-industry" error={fieldErrors.industry?.[0]}>
          <input
            id="portfolio-industry"
            className={inputClassName}
            value={value.industry}
            onChange={updateTextField("industry")}
            disabled={disabled}
            maxLength={80}
            placeholder="피트니스"
            aria-invalid={Boolean(fieldErrors.industry?.length)}
            aria-describedby={fieldErrors.industry?.length ? "portfolio-industry-error" : undefined}
          />
        </Field>

        <Field label="프로젝트 ID" htmlFor="portfolio-project-id" error={fieldErrors.projectId?.[0]}>
          <input
            id="portfolio-project-id"
            className={inputClassName}
            value={value.projectId}
            onChange={updateTextField("projectId")}
            disabled={disabled}
            placeholder="연결할 프로젝트 UUID (선택)"
            aria-invalid={Boolean(fieldErrors.projectId?.length)}
            aria-describedby={fieldErrors.projectId?.length ? "portfolio-project-id-error" : undefined}
          />
        </Field>
      </div>

      <div className="grid items-end gap-5 md:grid-cols-2">
        <Field label="정렬 순서" htmlFor="portfolio-sort-order" error={fieldErrors.sortOrder?.[0]}>
          <input
            id="portfolio-sort-order"
            type="number"
            min={0}
            step={1}
            className={inputClassName}
            value={value.sortOrder}
            onChange={updateTextField("sortOrder")}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.sortOrder?.length)}
            aria-describedby={fieldErrors.sortOrder?.length ? "portfolio-sort-order-error" : undefined}
          />
        </Field>

        <label
          htmlFor="portfolio-published"
          className="flex min-h-10 items-center gap-3 rounded-md border border-[#dfe3dc] bg-[#f7f8f5] px-4 py-3 text-sm font-medium"
        >
          <input
            id="portfolio-published"
            type="checkbox"
            className="size-4 accent-[#2e6f4f]"
            checked={value.isPublished}
            onChange={(event) => onChange({ ...value, isPublished: event.target.checked })}
            disabled={disabled}
          />
          공개 홈페이지에 게시
        </label>
      </div>

      <button
        type="submit"
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#17201a] px-5 text-sm font-semibold text-white transition hover:bg-[#2b3931] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6f4f] disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
        disabled={disabled}
      >
        {disabled ? (
          <>
            <Loader2 aria-hidden className="size-4 animate-spin" />
            저장 중
          </>
        ) : (
          submitLabel
        )}
      </button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required = false,
  children,
}: Readonly<{
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}>) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-[#26352e]">
        {label}
        {required ? <span className="ml-1 text-[#b42318]">*</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-xs text-[#b42318]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
