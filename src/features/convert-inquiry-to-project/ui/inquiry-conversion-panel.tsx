"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, UserRoundPlus } from "lucide-react";

import type {
  AdminCustomerCreateResponse,
  AdminCustomerListItem,
} from "@/entities/customer";
import type { AdminInquiryDetail } from "@/entities/inquiry";
import type {
  AdminProjectCreateResponse,
  AdminProjectListItem,
} from "@/entities/project";
import { Button } from "@/shared/ui/button";
import type { ApiResponse } from "@/shared/types/api";

import {
  buildConversionCustomerPayload,
  buildConversionProjectPayload,
  findInquiryCustomer,
  findInquiryProject,
  isInquiryConverted,
} from "../model/conversion-payload";

type ConversionState =
  | { status: "idle" }
  | { status: "converting" }
  | {
      status: "success";
      customerId: string;
      projectId: string;
      projectName: string;
      reusedCustomer: boolean;
      reusedProject: boolean;
    }
  | { status: "error"; message: string };

type InquiryConversionPanelProps = Readonly<{
  inquiry: AdminInquiryDetail;
  onInquiryUpdated: (inquiry: AdminInquiryDetail) => void;
}>;

export function InquiryConversionPanel({
  inquiry,
  onInquiryUpdated,
}: InquiryConversionPanelProps) {
  const [customerName, setCustomerName] = useState(inquiry.customer_name);
  const [projectName, setProjectName] = useState(
    `${inquiry.company_name || inquiry.customer_name} ${inquiry.service_type}`,
  );
  const [contractAmount, setContractAmount] = useState(
    inquiry.budget_max?.toString() || inquiry.budget_min?.toString() || "0",
  );
  const [expectedLaunchDate, setExpectedLaunchDate] = useState(
    inquiry.desired_launch_date || "",
  );
  const [customerMemo, setCustomerMemo] = useState("");
  const [projectMemo, setProjectMemo] = useState("");
  const [conversionState, setConversionState] = useState<ConversionState>({
    status: "idle",
  });

  const converted = isInquiryConverted(inquiry);
  const busy = conversionState.status === "converting";
  const disabled = converted || busy;

  async function parseJsonResponse<T>(
    response: Response,
    fallbackMessage: string,
  ) {
    if (response.status === 401 || response.status === 403) {
      window.location.assign("/admin/login?next=/admin");
      return null;
    }

    const result = (await response.json()) as ApiResponse<T>;

    if (!response.ok || "error" in result) {
      throw new Error(
        "error" in result ? result.error.message : fallbackMessage,
      );
    }

    return result.data;
  }

  async function fetchExistingCustomer() {
    const response = await fetch("/api/admin/customers", {
      headers: {
        Accept: "application/json",
      },
    });
    const customers = await parseJsonResponse<AdminCustomerListItem[]>(
      response,
      "기존 고객 목록을 확인하지 못했습니다.",
    );

    return customers ? findInquiryCustomer(inquiry.id, customers) : null;
  }

  async function fetchExistingProject() {
    const response = await fetch("/api/admin/projects", {
      headers: {
        Accept: "application/json",
      },
    });
    const projects = await parseJsonResponse<AdminProjectListItem[]>(
      response,
      "기존 프로젝트 목록을 확인하지 못했습니다.",
    );

    return projects ? findInquiryProject(inquiry.id, projects) : null;
  }

  async function convertInquiry() {
    if (disabled) {
      return;
    }

    setConversionState({ status: "converting" });

    try {
      let reusedCustomer = true;
      let customer = await fetchExistingCustomer();

      if (!customer) {
        reusedCustomer = false;
        const customerResponse = await fetch("/api/admin/customers", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            buildConversionCustomerPayload(inquiry, {
              customerName,
              customerMemo,
            }),
          ),
        });
        customer = await parseJsonResponse<AdminCustomerCreateResponse>(
          customerResponse,
          "고객을 생성하지 못했습니다.",
        );

        if (!customer) {
          return;
        }
      }

      let reusedProject = true;
      let project = await fetchExistingProject();

      if (!project) {
        reusedProject = false;
        const projectResponse = await fetch("/api/admin/projects", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            buildConversionProjectPayload(inquiry, {
              customerId: customer.id,
              projectName,
              contractAmount,
              expectedLaunchDate,
              projectMemo,
            }),
          ),
        });
        project = await parseJsonResponse<AdminProjectCreateResponse>(
          projectResponse,
          "프로젝트를 생성하지 못했습니다.",
        );

        if (!project) {
          return;
        }
      }

      const inquiryResponse = await fetch(`/api/admin/inquiries/${inquiry.id}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "converted",
          adminNotes: inquiry.admin_notes,
        }),
      });
      const updatedInquiry = await parseJsonResponse<AdminInquiryDetail>(
        inquiryResponse,
        "문의 전환 상태를 저장하지 못했습니다.",
      );

      if (!updatedInquiry) {
        return;
      }

      onInquiryUpdated(updatedInquiry);
      setConversionState({
        status: "success",
        customerId: customer.id,
        projectId: project.id,
        projectName: project.name,
        reusedCustomer,
        reusedProject,
      });
    } catch (error) {
      setConversionState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "문의 전환을 완료하지 못했습니다.",
      });
    }
  }

  return (
    <div className="rounded-lg border border-[#dfe3dc] bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#2e6f4f]">고객·프로젝트 전환</p>
          <h3 className="mt-1 text-lg font-semibold">문의 기반으로 운영 항목 생성</h3>
          <p className="mt-1 text-sm leading-6 text-[#617068]">
            고객을 먼저 등록한 뒤 같은 문의에 연결된 프로젝트를 생성합니다.
          </p>
        </div>
        {converted ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-md bg-[#eaf3ed] px-2.5 py-1 text-xs font-semibold text-[#23583f]">
            <CheckCircle2 aria-hidden className="size-3.5" />
            전환 완료
          </span>
        ) : null}
      </div>

      {converted ? (
        <div className="mt-4 rounded-md border border-[#d6e8dc] bg-[#f4faf6] p-3 text-sm leading-6 text-[#23583f]">
          이미 전환된 문의입니다. 중복 생성을 막기 위해 전환 버튼을 비활성화했습니다.
          {inquiry.converted_customer_id || inquiry.converted_project_id ? (
            <div className="mt-2 grid gap-1 text-xs">
              {inquiry.converted_customer_id ? (
                <span>고객 ID: {inquiry.converted_customer_id}</span>
              ) : null}
              {inquiry.converted_project_id ? (
                <span>프로젝트 ID: {inquiry.converted_project_id}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <ConversionField
              label="고객명"
              value={customerName}
              onChange={setCustomerName}
              disabled={disabled}
            />
            <ConversionField
              label="프로젝트명"
              value={projectName}
              onChange={setProjectName}
              disabled={disabled}
            />
            <ConversionField
              label="계약 금액"
              type="number"
              value={contractAmount}
              onChange={setContractAmount}
              disabled={disabled}
            />
            <ConversionField
              label="예상 오픈일"
              type="date"
              value={expectedLaunchDate}
              onChange={setExpectedLaunchDate}
              disabled={disabled}
            />
          </div>

          <label className="grid gap-2 text-sm font-semibold text-[#617068]">
            고객 메모
            <textarea
              value={customerMemo}
              onChange={(event) => setCustomerMemo(event.target.value)}
              rows={3}
              maxLength={4000}
              disabled={disabled}
              className="resize-y rounded-md border border-[#dfe3dc] bg-white px-3 py-2 text-sm font-normal leading-6 text-[#17201a] outline-none focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15 disabled:opacity-60"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[#617068]">
            프로젝트 메모
            <textarea
              value={projectMemo}
              onChange={(event) => setProjectMemo(event.target.value)}
              rows={3}
              maxLength={4000}
              disabled={disabled}
              className="resize-y rounded-md border border-[#dfe3dc] bg-white px-3 py-2 text-sm font-normal leading-6 text-[#17201a] outline-none focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15 disabled:opacity-60"
            />
          </label>
        </div>
      )}

      {conversionState.status === "success" ? (
        <div className="mt-4 rounded-md border border-[#d6e8dc] bg-[#f4faf6] p-3 text-sm leading-6 text-[#23583f]">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 aria-hidden className="size-4" />
            전환이 완료되었습니다.
          </p>
          <div className="mt-2 grid gap-1 text-xs">
            <span>고객 ID: {conversionState.customerId}</span>
            <span>프로젝트: {conversionState.projectName}</span>
            <span>프로젝트 ID: {conversionState.projectId}</span>
            {conversionState.reusedCustomer || conversionState.reusedProject ? (
              <span>
                기존 생성 항목을 재사용했습니다
                {conversionState.reusedCustomer ? " · 고객" : ""}
                {conversionState.reusedProject ? " · 프로젝트" : ""}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {conversionState.status === "error" ? (
        <p className="mt-4 rounded-md bg-[#fff1f0] px-3 py-2 text-sm text-[#912018]">
          {conversionState.message}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          size="lg"
          className="h-10 bg-[#17201a] px-4 text-white hover:bg-[#2b382f]"
          onClick={convertInquiry}
          disabled={disabled || !customerName.trim() || !projectName.trim()}
        >
          {busy ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <UserRoundPlus aria-hidden className="size-4" />
          )}
          전환 실행
        </Button>
      </div>
    </div>
  );
}

function ConversionField({
  label,
  type = "text",
  value,
  disabled,
  onChange,
}: Readonly<{
  label: string;
  type?: "text" | "number" | "date";
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#617068]">
      {label}
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-[#dfe3dc] bg-white px-3 text-sm font-normal text-[#17201a] outline-none focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15 disabled:opacity-60"
      />
    </label>
  );
}
