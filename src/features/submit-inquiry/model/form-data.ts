import type { CreateInquiryInput } from "../schemas/inquiry.schema";

const SOURCE = "public-home";

export function createInquiryInputFromFormData(
  formData: FormData,
): CreateInquiryInput {
  const budgetMin = numberOrUndefined(formData.get("budgetMin"));
  const budgetMax = numberOrUndefined(formData.get("budgetMax"));

  return {
    customerName: stringValue(formData.get("customerName")),
    email: stringValue(formData.get("email")),
    phone: stringValue(formData.get("phone")),
    companyName: stringValue(formData.get("companyName")),
    websiteUrl: stringValue(formData.get("websiteUrl")),
    serviceType: stringValue(formData.get("serviceType")),
    ...(budgetMin === undefined ? {} : { budgetMin }),
    ...(budgetMax === undefined ? {} : { budgetMax }),
    desiredLaunchDate: stringValue(formData.get("desiredLaunchDate")),
    message: stringValue(formData.get("message")),
    source: SOURCE,
  };
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrUndefined(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}
