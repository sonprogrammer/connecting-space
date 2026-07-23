"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";

import type { AdminInquiryListItem } from "@/entities/inquiry";
import {
  formatAdminInquiryCreatedAt,
  getInquiryPrimaryContact,
  getInquiryStatusLabel,
} from "@/entities/inquiry";
import { Button } from "@/shared/ui/button";
import type { ApiResponse } from "@/shared/types/api";

type InquiryListState =
  | { status: "loading" }
  | { status: "success"; inquiries: AdminInquiryListItem[] }
  | { status: "empty" }
  | { status: "error"; message: string };

export function AdminInquiryList() {
  const [state, setState] = useState<InquiryListState>({ status: "loading" });

  async function fetchInquiries() {
    try {
      const response = await fetch("/api/admin/inquiries", {
        headers: {
          Accept: "application/json",
        },
      });

      if (response.status === 401 || response.status === 403) {
        window.location.assign("/admin/login?next=/admin");
        return;
      }

      const result = (await response.json()) as ApiResponse<
        AdminInquiryListItem[]
      >;

      if (!response.ok || "error" in result) {
        setState({
          status: "error",
          message:
            "error" in result
              ? result.error.message
              : "문의 목록을 불러오지 못했습니다.",
        });
        return;
      }

      setState(
        result.data.length > 0
          ? { status: "success", inquiries: result.data }
          : { status: "empty" },
      );
    } catch {
      setState({
        status: "error",
        message: "네트워크 문제로 문의 목록을 불러오지 못했습니다.",
      });
    }
  }

  function refreshInquiries() {
    setState({ status: "loading" });
    void fetchInquiries();
  }

  useEffect(() => {
    queueMicrotask(() => {
      void fetchInquiries();
    });
  }, []);

  return (
    <section className="rounded-lg border border-[#dfe3dc] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e8ebe5] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">최근 문의</h2>
          <p className="mt-1 text-sm text-[#617068]">
            등록된 제작 문의를 최신순으로 확인합니다.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={refreshInquiries}
          disabled={state.status === "loading"}
        >
          {state.status === "loading" ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden className="size-4" />
          )}
          새로고침
        </Button>
      </div>
      <InquiryListContent state={state} />
    </section>
  );
}

function InquiryListContent({ state }: Readonly<{ state: InquiryListState }>) {
  if (state.status === "loading") {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 p-8 text-sm text-[#617068]">
        <Loader2 aria-hidden className="size-5 animate-spin text-[#2e6f4f]" />
        문의 목록을 불러오는 중입니다.
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
        <Inbox aria-hidden className="size-8 text-[#8a968d]" />
        <p className="mt-3 font-medium">등록된 문의가 없습니다</p>
        <p className="mt-2 text-sm text-[#617068]">
          공개 문의 폼에서 접수된 문의가 이곳에 표시됩니다.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
        <AlertCircle aria-hidden className="size-8 text-[#b42318]" />
        <p className="mt-3 font-medium text-[#912018]">
          문의 목록을 불러오지 못했습니다
        </p>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#617068]">
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-[#f7f8f5] text-[#617068]">
          <tr>
            <ColumnHeader>문의자</ColumnHeader>
            <ColumnHeader>연락처</ColumnHeader>
            <ColumnHeader>회사명</ColumnHeader>
            <ColumnHeader>서비스 유형</ColumnHeader>
            <ColumnHeader>상태</ColumnHeader>
            <ColumnHeader>등록일</ColumnHeader>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf0ea]">
          {state.inquiries.map((inquiry) => (
            <tr key={inquiry.id} className="align-top">
              <Cell>
                <span className="font-medium text-[#17201a]">
                  {inquiry.customer_name}
                </span>
              </Cell>
              <Cell>{getInquiryPrimaryContact(inquiry)}</Cell>
              <Cell>{inquiry.company_name || "회사명 없음"}</Cell>
              <Cell>{inquiry.service_type}</Cell>
              <Cell>
                <span className="inline-flex rounded-md bg-[#eaf3ed] px-2.5 py-1 text-xs font-semibold text-[#23583f]">
                  {getInquiryStatusLabel(inquiry.status)}
                </span>
              </Cell>
              <Cell>{formatAdminInquiryCreatedAt(inquiry.created_at)}</Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColumnHeader({ children }: Readonly<{ children: React.ReactNode }>) {
  return <th className="px-5 py-3 font-semibold">{children}</th>;
}

function Cell({ children }: Readonly<{ children: React.ReactNode }>) {
  return <td className="px-5 py-4 text-[#3c4941]">{children}</td>;
}
