import type { AdminInquiryDetail } from "@/entities/inquiry";
import type { AdminCustomerListItem, CreateCustomerInput } from "@/entities/customer";
import type { AdminProjectListItem, CreateProjectInput } from "@/entities/project";

export type ConversionCustomerFormValues = {
  customerName: string;
  customerMemo: string;
};

export type ConversionProjectFormValues = {
  customerId: string;
  projectName: string;
  contractAmount: string;
  expectedLaunchDate: string;
  projectMemo: string;
};

export function isInquiryConverted(inquiry: AdminInquiryDetail) {
  return (
    inquiry.status === "converted" ||
    Boolean(inquiry.converted_customer_id) ||
    Boolean(inquiry.converted_project_id)
  );
}

export function buildConversionCustomerPayload(
  inquiry: AdminInquiryDetail,
  values: ConversionCustomerFormValues,
): CreateCustomerInput {
  return {
    inquiryId: inquiry.id,
    name: values.customerName.trim(),
    email: inquiry.email || "",
    phone: inquiry.phone || "",
    companyName: inquiry.company_name || "",
    websiteUrl: inquiry.website_url || "",
    memo: values.customerMemo.trim(),
  };
}

export function buildConversionProjectPayload(
  inquiry: AdminInquiryDetail,
  values: ConversionProjectFormValues,
): CreateProjectInput {
  const contractAmount = Number.parseInt(values.contractAmount, 10);

  return {
    customerId: values.customerId,
    inquiryId: inquiry.id,
    name: values.projectName.trim(),
    description: inquiry.message,
    contractAmount: Number.isFinite(contractAmount) ? contractAmount : 0,
    expectedLaunchDate: values.expectedLaunchDate,
    memo: values.projectMemo.trim(),
  };
}

export function findInquiryCustomer(
  inquiryId: string,
  customers: AdminCustomerListItem[],
) {
  return customers.find((customer) => customer.inquiry_id === inquiryId) ?? null;
}

export function findInquiryProject(
  inquiryId: string,
  projects: AdminProjectListItem[],
) {
  return projects.find((project) => project.inquiry_id === inquiryId) ?? null;
}
