import type { AdminFaqItem, AdminServiceOffering } from "../../../entities/automation";
import type { ApiFailure } from "../../../shared/types/api";

export type ServiceFormValues = {
  slug: string;
  name: string;
  description: string;
  priceLabel: string;
  priceMin: string;
  priceMax: string;
  durationLabel: string;
  includedItems: string;
  excludedItems: string;
  aiGuidance: string;
  isPublished: boolean;
  sortOrder: string;
};

export type FaqFormValues = {
  question: string;
  answer: string;
  aiGuidance: string;
  isPublished: boolean;
  sortOrder: string;
};

export const emptyServiceForm: ServiceFormValues = {
  slug: "", name: "", description: "", priceLabel: "", priceMin: "", priceMax: "",
  durationLabel: "", includedItems: "", excludedItems: "", aiGuidance: "",
  isPublished: false, sortOrder: "0",
};

export const emptyFaqForm: FaqFormValues = {
  question: "", answer: "", aiGuidance: "", isPublished: false, sortOrder: "0",
};

function listFromLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function nullableNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

export function buildServicePayload(value: ServiceFormValues) {
  return {
    slug: value.slug.trim(),
    name: value.name.trim(),
    description: value.description.trim(),
    priceLabel: value.priceLabel.trim(),
    priceMin: nullableNumber(value.priceMin),
    priceMax: nullableNumber(value.priceMax),
    durationLabel: value.durationLabel.trim(),
    includedItems: listFromLines(value.includedItems),
    excludedItems: listFromLines(value.excludedItems),
    aiGuidance: value.aiGuidance.trim() || null,
    isPublished: value.isPublished,
    sortOrder: Number(value.sortOrder),
  };
}

export function serviceToFormValues(value: AdminServiceOffering): ServiceFormValues {
  return {
    slug: value.slug, name: value.name, description: value.description,
    priceLabel: value.priceLabel, priceMin: value.priceMin?.toString() ?? "",
    priceMax: value.priceMax?.toString() ?? "", durationLabel: value.durationLabel,
    includedItems: value.includedItems.join("\n"), excludedItems: value.excludedItems.join("\n"),
    aiGuidance: value.aiGuidance ?? "", isPublished: value.isPublished,
    sortOrder: value.sortOrder.toString(),
  };
}

export function buildFaqPayload(value: FaqFormValues) {
  return {
    question: value.question.trim(), answer: value.answer.trim(),
    aiGuidance: value.aiGuidance.trim() || null, isPublished: value.isPublished,
    sortOrder: Number(value.sortOrder),
  };
}

export function faqToFormValues(value: AdminFaqItem): FaqFormValues {
  return {
    question: value.question, answer: value.answer, aiGuidance: value.aiGuidance ?? "",
    isPublished: value.isPublished, sortOrder: value.sortOrder.toString(),
  };
}

export function getContentSaveFailure(status: number, result: ApiFailure) {
  if (status === 401 || status === 403) {
    return { fieldErrors: {}, message: "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요." };
  }
  if (result.error.code === "SERVICE_OFFERING_SLUG_CONFLICT") {
    return { fieldErrors: { slug: ["이미 사용 중인 slug입니다."] }, message: "입력값을 다시 확인해 주세요." };
  }
  if (result.error.code === "VALIDATION_ERROR") {
    const details = result.error.details;
    const fieldErrors = details && typeof details === "object" && "fieldErrors" in details &&
      details.fieldErrors && typeof details.fieldErrors === "object"
      ? details.fieldErrors as Record<string, string[]> : {};
    return { fieldErrors, message: "입력값을 다시 확인해 주세요." };
  }
  return { fieldErrors: {}, message: "콘텐츠를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
}
