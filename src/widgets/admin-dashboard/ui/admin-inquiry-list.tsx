"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Inbox,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";

import type {
  AdminInquiryDetail,
  AdminInquiryListItem,
  InquiryStatus,
} from "@/entities/inquiry";
import {
  formatAdminInquiryCreatedAt,
  formatInquiryBudget,
  formatInquiryDesiredLaunchDate,
  getInquiryPrimaryContact,
  getInquiryStatusLabel,
} from "@/entities/inquiry";
import { InquiryConversionPanel } from "@/features/convert-inquiry-to-project";
import { Button } from "@/shared/ui/button";
import type { ApiResponse } from "@/shared/types/api";

type InquiryListState =
  | { status: "loading" }
  | { status: "success"; inquiries: AdminInquiryListItem[] }
  | { status: "empty" }
  | { status: "error"; message: string };

type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; inquiry: AdminInquiryDetail; notice?: string }
  | { status: "error"; message: string };

const inquiryStatuses: InquiryStatus[] = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "closed",
];

export function AdminInquiryList() {
  const [state, setState] = useState<InquiryListState>({ status: "loading" });
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(
    null,
  );
  const [detailState, setDetailState] = useState<DetailState>({
    status: "idle",
  });

  const fetchInquiries = useCallback(async () => {
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

      setSelectedInquiryId((currentInquiryId) =>
        currentInquiryId &&
        result.data.some((inquiry) => inquiry.id === currentInquiryId)
          ? currentInquiryId
          : result.data[0]?.id ?? null,
      );

      setState(
        result.data.length > 0
          ? { status: "success", inquiries: result.data }
          : { status: "empty" },
      );

      if (result.data.length === 0) {
        setDetailState({ status: "idle" });
      }
    } catch {
      setState({
        status: "error",
        message: "네트워크 문제로 문의 목록을 불러오지 못했습니다.",
      });
    }
  }, []);

  function refreshInquiries() {
    setState({ status: "loading" });
    void fetchInquiries();
  }

  function updateListItem(updatedInquiry: AdminInquiryDetail) {
    setState((currentState) => {
      if (currentState.status !== "success") {
        return currentState;
      }

      return {
        status: "success",
        inquiries: currentState.inquiries.map((inquiry) =>
          inquiry.id === updatedInquiry.id
            ? {
                ...inquiry,
                status: updatedInquiry.status,
                updated_at: updatedInquiry.updated_at,
              }
            : inquiry,
        ),
      };
    });
  }

  useEffect(() => {
    queueMicrotask(() => {
      void fetchInquiries();
    });
  }, [fetchInquiries]);

  useEffect(() => {
    if (!selectedInquiryId) {
      return;
    }

    let isActive = true;

    async function fetchInquiryDetail() {
      setDetailState({ status: "loading" });

      try {
        const response = await fetch(
          `/api/admin/inquiries/${selectedInquiryId}`,
          {
            headers: {
              Accept: "application/json",
            },
          },
        );

        if (response.status === 401 || response.status === 403) {
          window.location.assign("/admin/login?next=/admin");
          return;
        }

        const result = (await response.json()) as ApiResponse<AdminInquiryDetail>;

        if (!isActive) {
          return;
        }

        if (!response.ok || "error" in result) {
          setDetailState({
            status: "error",
            message:
              "error" in result
                ? result.error.message
                : "문의 상세를 불러오지 못했습니다.",
          });
          return;
        }

        setDetailState({ status: "success", inquiry: result.data });
      } catch {
        if (!isActive) {
          return;
        }

        setDetailState({
          status: "error",
          message: "네트워크 문제로 문의 상세를 불러오지 못했습니다.",
        });
      }
    }

    void fetchInquiryDetail();

    return () => {
      isActive = false;
    };
  }, [selectedInquiryId]);

  return (
    <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="rounded-lg border border-[#dfe3dc] bg-white">
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
        <InquiryListContent
          state={state}
          selectedInquiryId={selectedInquiryId}
          onSelectInquiry={setSelectedInquiryId}
        />
      </div>

      <InquiryDetailPanel
        state={detailState}
        onUpdated={(updatedInquiry) => {
          updateListItem(updatedInquiry);
          setDetailState({
            status: "success",
            inquiry: updatedInquiry,
            notice: "상태와 내부 메모를 저장했습니다.",
          });
        }}
      />
    </section>
  );
}

function InquiryListContent({
  state,
  selectedInquiryId,
  onSelectInquiry,
}: Readonly<{
  state: InquiryListState;
  selectedInquiryId: string | null;
  onSelectInquiry: (inquiryId: string) => void;
}>) {
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
            <tr
              key={inquiry.id}
              className="cursor-pointer align-top transition hover:bg-[#f7f8f5]"
              aria-selected={selectedInquiryId === inquiry.id}
              onClick={() => onSelectInquiry(inquiry.id)}
            >
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

function InquiryDetailPanel({
  state,
  onUpdated,
}: Readonly<{
  state: DetailState;
  onUpdated: (inquiry: AdminInquiryDetail) => void;
}>) {
  if (state.status === "idle") {
    return (
      <section className="rounded-lg border border-[#dfe3dc] bg-white p-6">
        <EmptyDetailMessage />
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <section className="flex min-h-96 items-center justify-center rounded-lg border border-[#dfe3dc] bg-white p-6 text-sm text-[#617068]">
        <Loader2 aria-hidden className="mr-2 size-5 animate-spin text-[#2e6f4f]" />
        문의 상세를 불러오는 중입니다.
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="flex min-h-96 flex-col items-center justify-center rounded-lg border border-[#dfe3dc] bg-white p-6 text-center">
        <AlertCircle aria-hidden className="size-8 text-[#b42318]" />
        <p className="mt-3 font-medium text-[#912018]">
          문의 상세를 불러오지 못했습니다
        </p>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#617068]">
          {state.message}
        </p>
      </section>
    );
  }

  return (
    <InquiryDetailForm
      key={state.inquiry.id}
      inquiry={state.inquiry}
      notice={state.notice}
      onUpdated={onUpdated}
    />
  );
}

function EmptyDetailMessage() {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center text-center">
      <Inbox aria-hidden className="size-8 text-[#8a968d]" />
      <p className="mt-3 font-medium">문의를 선택해 주세요</p>
      <p className="mt-2 text-sm leading-6 text-[#617068]">
        목록에서 문의를 선택하면 원문과 상태 변경 폼이 표시됩니다.
      </p>
    </div>
  );
}

function InquiryDetailForm({
  inquiry,
  notice,
  onUpdated,
}: Readonly<{
  inquiry: AdminInquiryDetail;
  notice?: string;
  onUpdated: (inquiry: AdminInquiryDetail) => void;
}>) {
  const [status, setStatus] = useState<InquiryStatus>(inquiry.status);
  const [adminNotes, setAdminNotes] = useState(inquiry.admin_notes || "");
  const [saveState, setSaveState] = useState<
    { status: "idle" } | { status: "saving" } | { status: "error"; message: string }
  >({ status: "idle" });

  async function saveInquiry() {
    setSaveState({ status: "saving" });

    try {
      const response = await fetch(`/api/admin/inquiries/${inquiry.id}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          adminNotes: adminNotes.trim() ? adminNotes : null,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        window.location.assign("/admin/login?next=/admin");
        return;
      }

      const result =
        (await response.json()) as ApiResponse<AdminInquiryDetail>;

      if (!response.ok || "error" in result) {
        setSaveState({
          status: "error",
          message:
            "error" in result
              ? result.error.message
              : "문의 상태를 저장하지 못했습니다.",
        });
        return;
      }

      onUpdated(result.data);
      setSaveState({ status: "idle" });
    } catch {
      setSaveState({
        status: "error",
        message: "네트워크 문제로 문의 상태를 저장하지 못했습니다.",
      });
    }
  }

  return (
    <section className="rounded-lg border border-[#dfe3dc] bg-white">
      <div className="border-b border-[#e8ebe5] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#2e6f4f]">문의 상세</p>
            <h2 className="mt-1 text-xl font-semibold">
              {inquiry.customer_name}
            </h2>
            <p className="mt-1 text-sm text-[#617068]">
              {formatAdminInquiryCreatedAt(inquiry.created_at)} 등록 ·{" "}
              {formatAdminInquiryCreatedAt(inquiry.updated_at)} 수정
            </p>
          </div>
          <span className="inline-flex w-fit rounded-md bg-[#eaf3ed] px-2.5 py-1 text-xs font-semibold text-[#23583f]">
            {getInquiryStatusLabel(inquiry.status)}
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailField label="연락처" value={getInquiryPrimaryContact(inquiry)} />
          <DetailField label="회사명" value={inquiry.company_name || "회사명 없음"} />
          <DetailField label="서비스 유형" value={inquiry.service_type} />
          <DetailField
            label="예산"
            value={formatInquiryBudget(inquiry.budget_min, inquiry.budget_max)}
          />
          <DetailField
            label="희망 오픈일"
            value={formatInquiryDesiredLaunchDate(inquiry.desired_launch_date)}
          />
          <DetailField label="유입 경로" value={inquiry.source || "유입 경로 없음"} />
          <DetailField label="이메일" value={inquiry.email || "이메일 없음"} />
          <DetailField label="전화번호" value={inquiry.phone || "전화번호 없음"} />
        </div>

        {inquiry.website_url ? (
          <DetailField label="현재 사이트" value={inquiry.website_url} />
        ) : null}

        <div>
          <p className="text-sm font-semibold text-[#617068]">문의 원문</p>
          <div className="mt-2 whitespace-pre-wrap rounded-md border border-[#e8ebe5] bg-[#fbfcf9] p-4 text-sm leading-6 text-[#3c4941]">
            {inquiry.message}
          </div>
        </div>

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-[#617068]">
            상태
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as InquiryStatus)}
              className="h-10 rounded-md border border-[#dfe3dc] bg-white px-3 text-sm font-normal text-[#17201a] outline-none focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15"
            >
              {inquiryStatuses.map((inquiryStatus) => (
                <option key={inquiryStatus} value={inquiryStatus}>
                  {getInquiryStatusLabel(inquiryStatus)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[#617068]">
            내부 메모
            <textarea
              value={adminNotes}
              onChange={(event) => setAdminNotes(event.target.value)}
              maxLength={4000}
              rows={6}
              className="resize-y rounded-md border border-[#dfe3dc] bg-white px-3 py-2 text-sm font-normal leading-6 text-[#17201a] outline-none focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15"
            />
          </label>
        </div>

        {notice ? (
          <p className="flex items-center gap-2 rounded-md bg-[#eaf3ed] px-3 py-2 text-sm font-medium text-[#23583f]">
            <CheckCircle2 aria-hidden className="size-4" />
            {notice}
          </p>
        ) : null}

        {saveState.status === "error" ? (
          <p className="rounded-md bg-[#fff1f0] px-3 py-2 text-sm text-[#912018]">
            {saveState.message}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            size="lg"
            className="h-10 bg-[#17201a] px-4 text-white hover:bg-[#2b382f]"
            onClick={saveInquiry}
            disabled={saveState.status === "saving"}
          >
            {saveState.status === "saving" ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Save aria-hidden className="size-4" />
            )}
            저장
          </Button>
        </div>

        <InquiryConversionPanel inquiry={inquiry} onInquiryUpdated={onUpdated} />
      </div>
    </section>
  );
}

function DetailField({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-md border border-[#e8ebe5] bg-[#fbfcf9] p-3">
      <p className="text-xs font-semibold text-[#617068]">{label}</p>
      <p className="mt-1 break-words text-sm text-[#17201a]">{value}</p>
    </div>
  );
}
