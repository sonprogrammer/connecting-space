"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Bot, Check, Clipboard, Loader2, RefreshCw, RotateCcw, Save, Send, TriangleAlert } from "lucide-react";

import type { InquiryReplyDraft } from "@/entities/automation";
import type { ApiResponse } from "@/shared/types/api";
import { Button } from "@/shared/ui/button";
import { getDraftStatusCopy, getReplyDraftFailure, getSlackDeliveryPresentation, type DraftViewStatus } from "../model/reply-draft-state";

type ViewState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "generating" }
  | { status: "success"; draft: InquiryReplyDraft }
  | { status: "error"; message: string };

export function InquiryReplyDraftPanel({ inquiryId }: Readonly<{ inquiryId: string }>) {
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [summary, setSummary] = useState("");
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState<"save" | "regenerate" | "slack" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" }); setNotice(null);
    try {
      const response = await fetch(`/api/admin/inquiries/${inquiryId}/reply-draft`, { cache: "no-store", headers: { Accept: "application/json" } });
      const result = await response.json() as ApiResponse<InquiryReplyDraft>;
      if (response.status === 404 && "error" in result && result.error.code === "REPLY_DRAFT_NOT_FOUND") { setState({ status: "missing" }); return; }
      if (!response.ok || "error" in result) { setState({ status: "error", message: "error" in result ? getReplyDraftFailure(response.status, result) : "AI 초안을 불러오지 못했습니다." }); return; }
      setState({ status: "success", draft: result.data }); setSummary(result.data.summary); setDraftText(result.data.draft);
    } catch { setState({ status: "error", message: "네트워크 문제로 AI 초안을 불러오지 못했습니다." }); }
  }, [inquiryId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function requestAction(kind: "regenerate" | "slack") {
    setBusy(kind); setNotice(null);
    const path = kind === "regenerate" ? "reply-draft/regenerate" : "notifications/slack/retry";
    try {
      const response = await fetch(`/api/admin/inquiries/${inquiryId}/${path}`, { method: "POST", headers: { Accept: "application/json" } });
      const result = await response.json() as ApiResponse<{ jobId: string; status: "pending" }>;
      if (!response.ok || "error" in result) { setNotice({ tone: "error", text: "error" in result ? getReplyDraftFailure(response.status, result) : "요청을 처리하지 못했습니다." }); return; }
      if (kind === "regenerate") {
        setNotice({ tone: "success", text: "AI 초안 재생성을 요청했습니다." });
        setState((current) => current.status === "success" ? { status: "success", draft: { ...current.draft, status: "generating", lastError: null } } : { status: "generating" });
      } else {
        await load();
        setNotice({ tone: "success", text: "Slack 재전송을 요청했습니다." });
      }
    } catch { setNotice({ tone: "error", text: "네트워크 문제로 요청을 처리하지 못했습니다." }); }
    finally { setBusy(null); }
  }

  async function save() {
    if (state.status !== "success") return;
    setBusy("save"); setNotice(null);
    try {
      const response = await fetch(`/api/admin/inquiries/${inquiryId}/reply-draft`, { method: "PATCH", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ summary, draft: draftText }) });
      const result = await response.json() as ApiResponse<{ id: string; updatedAt: string }>;
      if (!response.ok || "error" in result) { setNotice({ tone: "error", text: "error" in result ? getReplyDraftFailure(response.status, result) : "답변 초안을 저장하지 못했습니다." }); return; }
      setState({ status: "success", draft: { ...state.draft, summary, draft: draftText, updatedAt: result.data.updatedAt } });
      setNotice({ tone: "success", text: "답변 초안을 저장했습니다." });
    } catch { setNotice({ tone: "error", text: "네트워크 문제로 답변 초안을 저장하지 못했습니다." }); }
    finally { setBusy(null); }
  }

  async function copyDraft() {
    try { await navigator.clipboard.writeText(draftText); setNotice({ tone: "success", text: "답변 초안을 클립보드에 복사했습니다." }); }
    catch { setNotice({ tone: "error", text: "클립보드에 복사하지 못했습니다. 브라우저 권한을 확인해 주세요." }); }
  }

  if (state.status === "loading") return <Panel><div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-[#617068]"><Loader2 aria-hidden className="size-5 animate-spin text-[#2e6f4f]" />AI 답변 초안을 불러오는 중입니다.</div></Panel>;
  if (state.status === "error") return <Panel><StatusBlock status="failed" message={state.message} action={<Button type="button" variant="outline" onClick={() => void load()}><RefreshCw aria-hidden />다시 불러오기</Button>} auth={state.message.startsWith("관리자 로그인이")} /></Panel>;
  if (state.status === "missing") return <Panel>{notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}<StatusBlock status="missing" action={<Button type="button" onClick={() => void requestAction("regenerate")} disabled={busy !== null}>{busy === "regenerate" ? <Loader2 aria-hidden className="animate-spin" /> : <Bot aria-hidden />}AI 초안 생성</Button>} /></Panel>;
  if (state.status === "generating") return <Panel>{notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}<StatusBlock status="generating" action={<Button type="button" variant="outline" onClick={() => void load()}><RefreshCw aria-hidden />상태 새로고침</Button>} /></Panel>;

  const draft = state.draft;
  const status = getDraftStatusCopy(draft.status);
  const slack = getSlackDeliveryPresentation(draft.slackDelivery);
  const editable = draft.status === "ready";
  return <Panel>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-[#2e6f4f]">AI & Slack</p><h3 className="mt-1 text-lg font-semibold">{status.title}</h3><p className="mt-1 text-sm leading-6 text-[#617068]">{status.description}</p></div><Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={busy !== null}><RefreshCw aria-hidden />상태 새로고침</Button></div>
    {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
    {draft.status === "generating" ? <div role="status" className="mt-5 flex items-center gap-3 rounded-md bg-[#fff8e6] p-4 text-sm text-[#72551b]"><Loader2 aria-hidden className="size-5 animate-spin" />생성 작업이 진행 중입니다. 잠시 후 상태를 새로고침해 주세요.</div> : null}
    {draft.status === "failed" ? <div role="alert" className="mt-5 rounded-md bg-[#fff1ee] p-4 text-sm text-[#912018]"><div className="flex gap-2"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /><span>{draft.lastError || "AI 초안 생성 중 오류가 발생했습니다."}</span></div><Button type="button" variant="outline" className="mt-4" onClick={() => void requestAction("regenerate")} disabled={busy !== null}>{busy === "regenerate" ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}다시 생성</Button></div> : null}
    {editable ? <div className="mt-5 grid gap-4">
      <label className="grid gap-2 text-sm font-semibold text-[#526057]">문의 요약<textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={2000} rows={4} disabled={busy !== null} className="resize-y rounded-md border border-[#dfe3dc] px-3 py-2 font-normal leading-6 text-[#17201a] outline-none focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15" /></label>
      {draft.needsConfirmation.length > 0 ? <div className="rounded-md border border-[#ead7aa] bg-[#fffbf1] p-4"><h4 className="flex items-center gap-2 text-sm font-semibold text-[#72551b]"><TriangleAlert aria-hidden className="size-4" />고객 확인 필요</h4><ul className="mt-3 space-y-3">{draft.needsConfirmation.map((item, index) => <li key={`${item.topic}-${index}`} className="text-sm leading-6"><strong>{item.topic}</strong><p className="text-[#6a6252]">{item.reason}</p><p className="mt-1 text-[#72551b]">질문 제안: {item.suggestedQuestion}</p></li>)}</ul></div> : null}
      <label className="grid gap-2 text-sm font-semibold text-[#526057]">답변 초안<textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} maxLength={12000} rows={12} required disabled={busy !== null} className="resize-y rounded-md border border-[#dfe3dc] px-3 py-2 font-normal leading-6 text-[#17201a] outline-none focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15" /></label>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => void requestAction("regenerate")} disabled={busy !== null}>{busy === "regenerate" ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}재생성</Button><Button type="button" variant="outline" onClick={() => void copyDraft()} disabled={busy !== null || !draftText}><Clipboard aria-hidden />복사</Button><Button type="button" onClick={() => void save()} disabled={busy !== null || !draftText.trim()}>{busy === "save" ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}초안 저장</Button></div>
    </div> : null}
    <div className="mt-5 grid gap-3 rounded-md border border-[#e8ebe5] bg-[#fbfcf9] p-4 text-xs text-[#617068] sm:grid-cols-2"><p>마지막 갱신: <strong className="text-[#3c4941]">{formatDateTime(draft.updatedAt)}</strong></p><p>생성 기록: <strong className="break-all text-[#3c4941]">{draft.generationRecordId || "기록 없음"}</strong></p></div>
    <div className="mt-5 rounded-md border border-[#dfe3dc] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="flex items-center gap-2 text-sm font-semibold"><Send aria-hidden className="size-4 text-[#2e6f4f]" />{slack.label}</h4><p className="mt-1 text-xs text-[#617068]">시도 {draft.slackDelivery?.attempt_count ?? 0}회{draft.slackDelivery?.sent_at ? ` · ${formatDateTime(draft.slackDelivery.sent_at)} 전송` : ""}</p></div>{slack.canRetry ? <Button type="button" variant="outline" onClick={() => void requestAction("slack")} disabled={busy !== null}>{busy === "slack" ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}Slack 재전송</Button> : null}</div>{draft.slackDelivery?.last_error ? <p role="alert" className="mt-3 rounded bg-[#fff1ee] p-2 text-xs text-[#912018]">{draft.slackDelivery.last_error}</p> : null}</div>
  </Panel>;
}

function Panel({ children }: Readonly<{ children: React.ReactNode }>) { return <section className="rounded-md border border-[#dfe3dc] bg-[#fbfcf9] p-4 sm:p-5">{children}</section>; }
function StatusBlock({ status, message, action, auth }: Readonly<{ status: DraftViewStatus; message?: string; action: React.ReactNode; auth?: boolean }>) { const copy = getDraftStatusCopy(status); return <div className="flex min-h-44 flex-col items-center justify-center text-center"><Bot aria-hidden className="size-8 text-[#2e6f4f]" /><h3 className="mt-3 font-semibold">{copy.title}</h3><p className="mt-2 max-w-lg text-sm leading-6 text-[#617068]">{message || copy.description}</p>{auth ? <a href="/admin/login?next=/admin" className="mt-3 text-sm font-semibold underline">로그인하기</a> : <div className="mt-4">{action}</div>}</div>; }
function Notice({ tone, children }: Readonly<{ tone: "success" | "error"; children: React.ReactNode }>) { const auth = typeof children === "string" && children.startsWith("관리자 로그인이"); return <div role={tone === "error" ? "alert" : "status"} className={`mt-5 flex gap-2 rounded-md p-3 text-sm ${tone === "error" ? "bg-[#fff1ee] text-[#912018]" : "bg-[#edf7f0] text-[#23583f]"}`}>{tone === "error" ? <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Check aria-hidden className="mt-0.5 size-4 shrink-0" />}<span>{children}{auth ? <a href="/admin/login?next=/admin" className="ml-2 font-semibold underline">로그인하기</a> : null}</span></div>; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value)); }
