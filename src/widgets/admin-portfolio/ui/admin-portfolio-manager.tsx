"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FilePlus2,
  FolderOpen,
  Loader2,
  RefreshCw,
} from "lucide-react";

import type {
  AdminPortfolioDetail,
  AdminPortfolioListItem,
} from "@/entities/portfolio";
import {
  buildPortfolioPayload,
  emptyPortfolioForm,
  PortfolioForm,
  portfolioToFormValues,
  type PortfolioFormValues,
} from "@/features/manage-portfolio";
import type { ApiResponse } from "@/shared/types/api";
import { Button } from "@/shared/ui/button";

import {
  getPortfolioSaveFailure,
  toAdminPortfolioListState,
  type AdminPortfolioListState,
} from "../model/admin-portfolio-state";

type EditorMode =
  | { type: "create" }
  | { type: "edit"; portfolioId: string };

export function AdminPortfolioManager() {
  const [listState, setListState] = useState<AdminPortfolioListState>({
    status: "loading",
  });
  const [editorMode, setEditorMode] = useState<EditorMode>({ type: "create" });
  const [formValues, setFormValues] = useState<PortfolioFormValues>({
    ...emptyPortfolioForm,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPortfolio = useCallback(async (preferredId?: string) => {
    try {
      const response = await fetch("/api/admin/portfolio", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const result = (await response.json()) as ApiResponse<AdminPortfolioListItem[]>;

      if (!response.ok || "error" in result) {
        setListState(
          "error" in result
            ? toAdminPortfolioListState(result, response.status)
            : { status: "error", message: "포트폴리오 목록을 불러오지 못했습니다." },
        );
        return;
      }

      setListState(toAdminPortfolioListState(result));

      const selected =
        result.data.find((item) => item.id === preferredId) ?? result.data[0];

      if (selected) {
        setEditorMode({ type: "edit", portfolioId: selected.id });
        setFormValues(portfolioToFormValues(selected));
      } else {
        setEditorMode({ type: "create" });
        setFormValues({ ...emptyPortfolioForm });
      }
    } catch {
      setListState({
        status: "error",
        message: "네트워크 문제로 포트폴리오 목록을 불러오지 못했습니다.",
      });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPortfolio();
    });
  }, [loadPortfolio]);

  function selectPortfolio(portfolio: AdminPortfolioListItem) {
    setEditorMode({ type: "edit", portfolioId: portfolio.id });
    setFormValues(portfolioToFormValues(portfolio));
    setFieldErrors({});
    setNotice(null);
    setSaveError(null);
  }

  function startCreate() {
    setEditorMode({ type: "create" });
    setFormValues({ ...emptyPortfolioForm });
    setFieldErrors({});
    setNotice(null);
    setSaveError(null);
  }

  async function savePortfolio() {
    setSaving(true);
    setFieldErrors({});
    setNotice(null);
    setSaveError(null);

    const isEditing = editorMode.type === "edit";
    const url = isEditing
      ? `/api/admin/portfolio/${editorMode.portfolioId}`
      : "/api/admin/portfolio";

    try {
      const response = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPortfolioPayload(formValues)),
      });
      const result = (await response.json()) as ApiResponse<AdminPortfolioDetail>;

      if (!response.ok || "error" in result) {
        if ("error" in result) {
          const failure = getPortfolioSaveFailure(response.status, result);
          setFieldErrors(failure.fieldErrors);
          setSaveError(failure.message);
        } else {
          setSaveError("포트폴리오를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
        return;
      }

      setNotice(isEditing ? "포트폴리오를 수정했습니다." : "새 포트폴리오를 만들었습니다.");
      await loadPortfolio(result.data.id);
    } catch {
      setSaveError("네트워크 문제로 포트폴리오를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function refreshPortfolio() {
    setListState({ status: "loading" });
    setNotice(null);
    setSaveError(null);
    void loadPortfolio(editorMode.type === "edit" ? editorMode.portfolioId : undefined);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-[#dfe3dc] bg-white">
      <div className="flex flex-col gap-4 border-b border-[#e8ebe5] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">포트폴리오 관리</h2>
          <p className="mt-1 text-sm text-[#617068]">
            공개 작업 사례의 내용, 게시 상태, 표시 순서를 관리합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={refreshPortfolio} disabled={listState.status === "loading" || saving}>
            {listState.status === "loading" ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden className="size-4" />
            )}
            새로고침
          </Button>
          <Button type="button" size="sm" onClick={startCreate} disabled={saving}>
            <FilePlus2 aria-hidden className="size-4" />
            새 포트폴리오
          </Button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[0.72fr_1.28fr]">
        <div className="border-b border-[#e8ebe5] xl:border-r xl:border-b-0">
          <PortfolioList
            state={listState}
            selectedId={editorMode.type === "edit" ? editorMode.portfolioId : null}
            onSelect={selectPortfolio}
          />
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#2e6f4f]">
              {editorMode.type === "create" ? "Create" : "Edit"}
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              {editorMode.type === "create" ? "새 작업 사례" : formValues.title || "작업 사례 수정"}
            </h3>
          </div>

          {notice ? (
            <div role="status" className="mb-5 flex gap-2 rounded-md bg-[#edf7f0] p-3 text-sm text-[#23583f]">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
              {notice}
            </div>
          ) : null}

          {saveError ? (
            <div role="alert" className="mb-5 flex gap-2 rounded-md bg-[#fff1ee] p-3 text-sm text-[#912018]">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {saveError}
                {saveError.startsWith("관리자 로그인이") ? (
                  <a href="/admin/login?next=/admin" className="ml-2 font-semibold underline underline-offset-2">
                    로그인하기
                  </a>
                ) : null}
              </span>
            </div>
          ) : null}

          <PortfolioForm
            value={formValues}
            onChange={setFormValues}
            onSubmit={() => void savePortfolio()}
            disabled={saving}
            submitLabel={editorMode.type === "create" ? "포트폴리오 만들기" : "변경사항 저장"}
            fieldErrors={fieldErrors}
          />
        </div>
      </div>
    </section>
  );
}

function PortfolioList({
  state,
  selectedId,
  onSelect,
}: Readonly<{
  state: AdminPortfolioListState;
  selectedId: string | null;
  onSelect: (portfolio: AdminPortfolioListItem) => void;
}>) {
  if (state.status === "loading") {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 p-6 text-sm text-[#617068]">
        <Loader2 aria-hidden className="size-5 animate-spin text-[#2e6f4f]" />
        포트폴리오 목록을 불러오는 중입니다.
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
        <AlertCircle aria-hidden className="size-8 text-[#b42318]" />
        <p className="mt-3 font-medium text-[#912018]">목록을 불러오지 못했습니다</p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-[#617068]">{state.message}</p>
        {state.message.startsWith("관리자 로그인이") ? (
          <a
            href="/admin/login?next=/admin"
            className="mt-4 text-sm font-semibold text-[#912018] underline underline-offset-2"
          >
            로그인하기
          </a>
        ) : null}
      </div>
    );
  }

  if (state.items.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
        <FolderOpen aria-hidden className="size-8 text-[#8a968d]" />
        <p className="mt-3 font-medium">등록된 포트폴리오가 없습니다</p>
        <p className="mt-2 text-sm text-[#617068]">오른쪽 폼에서 첫 작업 사례를 만들어 보세요.</p>
      </div>
    );
  }

  return (
    <div className="max-h-[48rem] divide-y divide-[#edf0ea] overflow-y-auto">
      {state.items.map((portfolio) => {
        const selected = portfolio.id === selectedId;
        return (
          <button
            key={portfolio.id}
            type="button"
            className={`w-full px-5 py-4 text-left transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2e6f4f] ${
              selected ? "bg-[#edf4ef]" : "hover:bg-[#f7f8f5]"
            }`}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(portfolio)}
          >
            <span className="flex items-start justify-between gap-3">
              <span>
                <span className="block font-semibold text-[#17201a]">{portfolio.title}</span>
                <span className="mt-1 block text-xs text-[#617068]">/{portfolio.slug}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                portfolio.is_published
                  ? "bg-[#dff1e5] text-[#23583f]"
                  : "bg-[#ecefeb] text-[#617068]"
              }`}>
                {portfolio.is_published ? "게시" : "비공개"}
              </span>
            </span>
            <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#718078]">
              <span>순서 {portfolio.sort_order}</span>
              <span>수정 {new Date(portfolio.updated_at).toLocaleDateString("ko-KR")}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
