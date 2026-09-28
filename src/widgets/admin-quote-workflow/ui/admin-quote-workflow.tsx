"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Download, FilePlus2, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";

import type { AdminInquiryDetail } from "@/entities/inquiry";
import type { ConfirmQuoteContractInput, QuoteVersionRow } from "@/entities/quote";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import {
  adminQuoteKeys,
  AdminQuoteRequestError,
  confirmQuoteContract,
  createAdminInquiry,
  createQuote,
  createQuoteVersion,
  fetchAdminInquiries,
  fetchAdminInquiry,
  fetchAdminQuote,
  issueManualQuotePdf,
  retryQuoteEmail,
  sendQuoteEmail,
} from "../model/admin-quote-workflow-queries";
import {
  calculateQuoteSplit,
  createIdempotencyKey,
  getQuoteDeliveryLabel,
  getQuoteStatusLabel,
  toQuoteSnapshotPayload,
  type QuoteDraftForm,
  validateQuoteDraft,
} from "../model/admin-quote-workflow-state";

const emptyDraft: QuoteDraftForm = {
  title: "",
  body: "",
  scopeItems: [""],
  totalAmount: "",
  estimatedStartDate: "",
  estimatedEndDate: "",
  depositAmount: "",
  balanceAmount: "",
  depositTerms: "계약 시",
  balanceTerms: "검수 완료 후",
};

export function AdminQuoteWorkflow() {
  const queryClient = useQueryClient();
  const [selectedInquiryId, setSelectedInquiryId] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [draft, setDraft] = useState<QuoteDraftForm>(emptyDraft);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [directInquiryOpen, setDirectInquiryOpen] = useState(false);
  const [existingQuoteId, setExistingQuoteId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inquiries = useQuery({ queryKey: adminQuoteKeys.inquiries, queryFn: fetchAdminInquiries });
  const inquiry = useQuery({ queryKey: adminQuoteKeys.inquiry(selectedInquiryId), queryFn: () => fetchAdminInquiry(selectedInquiryId), enabled: Boolean(selectedInquiryId) });
  const quote = useQuery({ queryKey: adminQuoteKeys.quote(quoteId), queryFn: () => fetchAdminQuote(quoteId), enabled: Boolean(quoteId) });
  const selectedVersion = useMemo(() => quote.data?.versions.find((version) => version.id === (quote.data.quote.latest_version_id ?? quote.data.versions[0]?.id)) ?? quote.data?.versions[0], [quote.data]);

  const createInquiry = useMutation({
    mutationFn: createAdminInquiry,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: adminQuoteKeys.inquiries });
      setSelectedInquiryId(created.id);
      setDirectInquiryOpen(false);
      setNotice("직접 등록한 문의를 선택했습니다. 견적을 작성해 주세요.");
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const createQuoteMutation = useMutation({
    mutationFn: createQuote,
    onSuccess: (created) => {
      setQuoteId(created.quoteId);
      setNotice("견적과 1차 버전을 저장했습니다.");
      setError(null);
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const versionMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReturnType<typeof toQuoteSnapshotPayload> }) => createQuoteVersion(id, payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: adminQuoteKeys.quote(quoteId) });
      setNotice(`${created.versionNumber}차 버전을 저장했습니다.`);
      setError(null);
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const sendMutation = useMutation({
    mutationFn: sendQuoteEmail,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQuoteKeys.quote(quoteId) });
      setNotice("자동 이메일 발송 작업을 등록했습니다.");
      setError(null);
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const retryMutation = useMutation({
    mutationFn: retryQuoteEmail,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQuoteKeys.quote(quoteId) });
      setNotice("발송 재시도를 등록했습니다.");
      setError(null);
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const manualMutation = useMutation({
    mutationFn: ({ id, reissue }: { id: string; reissue: boolean }) => issueManualQuotePdf(id, { idempotencyKey: createIdempotencyKey(), reissue }),
    onSuccess: async ({ blob, deliveryId, expiresAt }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `quote-${deliveryId || "manual"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      await queryClient.invalidateQueries({ queryKey: adminQuoteKeys.quote(quoteId) });
      setNotice(`수동 PDF를 발급하고 다운로드했습니다. 만료: ${formatDateTime(expiresAt)}`);
      setError(null);
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const confirmMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ConfirmQuoteContractInput }) => confirmQuoteContract(id, payload),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: adminQuoteKeys.quote(quoteId) });
      setNotice(`계약 확인과 프로젝트 생성을 완료했습니다. 프로젝트 ID: ${result.projectId}`);
      setError(null);
    },
    onError: (reason) => setError(errorMessage(reason)),
  });

  function applyTotal(value: string) {
    setDraft((current) => ({ ...current, totalAmount: value, ...splitFields(value, 30) }));
  }

  function saveQuote() {
    const errors = validateQuoteDraft(draft);
    setDraftErrors(errors);
    if (Object.keys(errors).length || !selectedInquiryId) {
      if (!selectedInquiryId) setError("문의부터 선택해 주세요.");
      return;
    }
    const payload = toQuoteSnapshotPayload(draft);
    if (quoteId) versionMutation.mutate({ id: quoteId, payload });
    else createQuoteMutation.mutate({ inquiryId: selectedInquiryId, ...payload });
  }

  return (
    <section className="rounded-lg border border-[#dfe3dc] bg-white p-5 sm:p-6" aria-labelledby="quote-workflow-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm font-semibold text-[#2e6f4f]">견적·계약 워크플로</p><h2 id="quote-workflow-title" className="mt-1 text-xl font-semibold">문의부터 프로젝트 시작까지</h2><p className="mt-1 text-sm leading-6 text-[#617068]">자동 이메일과 수동 PDF 발송을 구분해 관리하고, 승인·계약 확인 후 프로젝트를 생성합니다.</p></div>
        <Button type="button" variant="outline" size="sm" onClick={() => void inquiries.refetch()} disabled={inquiries.isFetching}><RefreshCw aria-hidden className={cn("size-4", inquiries.isFetching && "animate-spin")} />문의 새로고침</Button>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-4">
          <div className="rounded-md border border-[#e8ebe5] p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">문의 선택</h3><Button type="button" size="sm" variant="outline" onClick={() => setDirectInquiryOpen((open) => !open)}><FilePlus2 aria-hidden className="size-4" />직접 등록</Button></div>
            {directInquiryOpen ? <DirectInquiryForm busy={createInquiry.isPending} onSubmit={(value) => createInquiry.mutate(value)} /> : null}
            {inquiries.isLoading ? <Loading text="문의 목록을 불러오는 중입니다." /> : inquiries.isError ? <ErrorBox message={errorMessage(inquiries.error)} onRetry={() => void inquiries.refetch()} /> : inquiries.data?.length ? <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto">{inquiries.data.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedInquiryId(item.id); setQuoteId(""); }} className={cn("rounded-md border p-3 text-left text-sm outline-none transition focus-visible:ring-3 focus-visible:ring-[#2e6f4f]/30", selectedInquiryId === item.id ? "border-[#2e6f4f] bg-[#f1faf3]" : "border-[#e8ebe5] hover:bg-[#f7f8f5]")}><span className="font-semibold text-[#17201a]">{item.customer_name}</span><span className="mt-1 block text-xs text-[#617068]">{item.company_name || "회사명 없음"} · {item.service_type}</span></button>)}</div> : <p className="mt-4 text-sm text-[#617068]">등록된 문의가 없습니다.</p>}
          </div>
          <div className="rounded-md border border-[#e8ebe5] p-4"><h3 className="font-semibold">기존 견적 불러오기</h3><p className="mt-1 text-xs leading-5 text-[#617068]">견적 UUID가 있는 경우 서버 계약에 맞춰 상세와 상태를 조회합니다.</p><div className="mt-3 flex gap-2"><input aria-label="기존 견적 UUID" value={existingQuoteId} onChange={(event) => setExistingQuoteId(event.target.value)} className="min-w-0 flex-1 rounded-md border border-[#dfe3dc] px-3 py-2 text-sm outline-none focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15" placeholder="견적 UUID" /><Button type="button" variant="outline" onClick={() => setQuoteId(existingQuoteId.trim())} disabled={!existingQuoteId.trim()}>조회</Button></div></div>
          {inquiry.data ? <InquirySummary inquiry={inquiry.data} /> : null}
        </div>

        <div className="space-y-4">
          {!selectedInquiryId && !quoteId ? <EmptyPanel text="문의를 선택하거나 기존 견적을 조회해 주세요." /> : null}
          {selectedInquiryId && !inquiry.isLoading && (!quoteId || quote.data) ? <QuoteEditor draft={draft} errors={draftErrors} busy={createQuoteMutation.isPending || versionMutation.isPending} onChange={setDraft} onTotalChange={applyTotal} onSave={saveQuote} /> : null}
          {quote.isLoading ? <Loading text="견적 상세를 불러오는 중입니다." /> : null}
          {quote.isError ? <ErrorBox message={errorMessage(quote.error)} onRetry={() => void quote.refetch()} /> : null}
          {quote.data && selectedVersion ? <QuoteOperations quote={quote.data} version={selectedVersion} busy={{ send: sendMutation.isPending, retry: retryMutation.isPending, manual: manualMutation.isPending, confirm: confirmMutation.isPending }} onSend={() => sendMutation.mutate(selectedVersion.id)} onRetry={(id) => retryMutation.mutate(id)} onManual={(reissue) => manualMutation.mutate({ id: selectedVersion.id, reissue })} onConfirm={(payload) => confirmMutation.mutate({ id: selectedVersion.id, payload })} /> : null}
        </div>
      </div>
      {notice ? <p role="status" aria-live="polite" className="mt-5 rounded-md border border-[#d6e8dc] bg-[#f4faf6] px-3 py-2 text-sm text-[#23583f]">{notice}</p> : null}
      {error ? <p role="alert" className="mt-5 rounded-md border border-[#f4d4d1] bg-[#fff1f0] px-3 py-2 text-sm text-[#912018]">{error}</p> : null}
    </section>
  );
}

function DirectInquiryForm({ busy, onSubmit }: Readonly<{ busy: boolean; onSubmit: (value: Record<string, unknown>) => void }>) {
  const [value, setValue] = useState({ customerName: "", email: "", companyName: "", serviceType: "웹사이트 제작", message: "", source: "admin_manual" });
  return <form className="mt-4 grid gap-3 border-t border-[#e8ebe5] pt-4" onSubmit={(event) => { event.preventDefault(); if (value.customerName.trim() && value.message.trim().length >= 10) onSubmit(value); }}><Field label="고객명" value={value.customerName} required onChange={(customerName) => setValue({ ...value, customerName })} /><Field label="회사명" value={value.companyName} onChange={(companyName) => setValue({ ...value, companyName })} /><Field label="이메일" type="email" value={value.email} onChange={(email) => setValue({ ...value, email })} /><Field label="서비스 유형" value={value.serviceType} required onChange={(serviceType) => setValue({ ...value, serviceType })} /><label className="grid gap-1 text-xs font-semibold text-[#617068]">문의 내용<textarea required minLength={10} rows={3} value={value.message} onChange={(event) => setValue({ ...value, message: event.target.value })} className="rounded-md border border-[#dfe3dc] px-3 py-2 text-sm font-normal outline-none focus:border-[#2e6f4f]" /></label><Button type="submit" size="sm" disabled={busy}>{busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}문의 등록</Button></form>;
}

function InquirySummary({ inquiry }: Readonly<{ inquiry: AdminInquiryDetail }>) { return <div className="rounded-md bg-[#f7f8f5] p-4 text-sm"><h3 className="font-semibold">선택한 문의</h3><p className="mt-2">{inquiry.customer_name} · {inquiry.service_type}</p><p className="mt-1 text-xs text-[#617068]">{inquiry.email || "이메일 없음"} · {inquiry.company_name || "회사명 없음"}</p></div>; }

function QuoteEditor({ draft, errors, busy, onChange, onTotalChange, onSave }: Readonly<{ draft: QuoteDraftForm; errors: Record<string, string>; busy: boolean; onChange: (value: QuoteDraftForm) => void; onTotalChange: (value: string) => void; onSave: () => void }>) {
  const set = (key: keyof QuoteDraftForm, value: string) => onChange({ ...draft, [key]: value });
  return <div className="rounded-md border border-[#e8ebe5] p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">새 견적 작성</h3><span className="text-xs text-[#617068]">기본 계약금 30% · 잔금 70%</span></div><div className="mt-4 grid gap-3"><Field label="견적 제목" value={draft.title} error={errors.title} required onChange={(value) => set("title", value)} /><label className="grid gap-1 text-xs font-semibold text-[#617068]">견적 내용<textarea required rows={4} value={draft.body} onChange={(event) => set("body", event.target.value)} aria-invalid={Boolean(errors.body)} className="rounded-md border border-[#dfe3dc] px-3 py-2 text-sm font-normal outline-none focus:border-[#2e6f4f]" />{errors.body ? <span className="font-normal text-[#b42318]">{errors.body}</span> : null}</label><label className="grid gap-1 text-xs font-semibold text-[#617068]">작업 범위{draft.scopeItems.map((item, index) => <input key={index} value={item} onChange={(event) => onChange({ ...draft, scopeItems: draft.scopeItems.map((current, currentIndex) => currentIndex === index ? event.target.value : current) })} className="h-10 rounded-md border border-[#dfe3dc] px-3 text-sm font-normal outline-none focus:border-[#2e6f4f]" placeholder={`범위 ${index + 1}`} />)}<button type="button" className="w-fit text-xs font-semibold text-[#2e6f4f]" onClick={() => onChange({ ...draft, scopeItems: [...draft.scopeItems, ""] })}>+ 범위 추가</button>{errors.scopeItems ? <span className="font-normal text-[#b42318]">{errors.scopeItems}</span> : null}</label><div className="grid gap-3 sm:grid-cols-3"><Field label="총액" type="number" value={draft.totalAmount} error={errors.totalAmount} required onChange={onTotalChange} /><Field label="계약금" type="number" value={draft.depositAmount} error={errors.depositAmount} required onChange={(value) => set("depositAmount", value)} /><Field label="잔금" type="number" value={draft.balanceAmount} error={errors.balanceAmount} required onChange={(value) => set("balanceAmount", value)} /></div><div className="grid gap-3 sm:grid-cols-2"><Field label="시작 예정일" type="date" value={draft.estimatedStartDate} onChange={(value) => set("estimatedStartDate", value)} /><Field label="종료 예정일" type="date" value={draft.estimatedEndDate} error={errors.estimatedEndDate} onChange={(value) => set("estimatedEndDate", value)} /></div><div className="grid gap-3 sm:grid-cols-2"><Field label="계약금 조건" value={draft.depositTerms} error={errors.depositTerms} required onChange={(value) => set("depositTerms", value)} /><Field label="잔금 조건" value={draft.balanceTerms} error={errors.balanceTerms} required onChange={(value) => set("balanceTerms", value)} /></div><Button type="button" onClick={onSave} disabled={busy}>{busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <CheckCircle2 aria-hidden className="size-4" />}견적 저장</Button></div></div>;
}

function QuoteOperations({ quote, version, busy, onSend, onRetry, onManual, onConfirm }: Readonly<{ quote: NonNullable<ReturnType<typeof fetchAdminQuote> extends Promise<infer T> ? T : never>; version: QuoteVersionRow; busy: { send: boolean; retry: boolean; manual: boolean; confirm: boolean }; onSend: () => void; onRetry: (id: string) => void; onManual: (reissue: boolean) => void; onConfirm: (payload: ConfirmQuoteContractInput) => void }>) {
  const [projectName, setProjectName] = useState(version.title);
  const [projectMemo, setProjectMemo] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState("30");
  const [balancePercentage, setBalancePercentage] = useState("70");
  const latestDelivery = quote.emailDeliveries[0];
  const approved = quote.quote.status === "approved";
  const [contractConfirmed, setContractConfirmed] = useState(false);
  const requiresSigned = approved && quote.approvals.length > 0;
  function confirmContract() {
    if (!confirmed || !projectName.trim()) return;
    onConfirm({ idempotencyKey: createIdempotencyKey(), confirmedAt: new Date().toISOString(), projectName: projectName.trim(), projectMemo: projectMemo.trim() || undefined, depositPercentage: Number(depositPercentage), balancePercentage: Number(balancePercentage) });
    setContractConfirmed(true);
  }
  const delivery = latestDelivery ? { id: latestDelivery.id, status: latestDelivery.status, attemptCount: latestDelivery.attempt_count, maxAttempts: latestDelivery.max_attempts, errorCode: latestDelivery.error_code } : null;
  return <div className="space-y-4"><section className="rounded-md border border-[#e8ebe5] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#2e6f4f]">견적 상태</p><h3 className="mt-1 text-lg font-semibold">{getQuoteStatusLabel(quote.quote.status)}</h3><p className="mt-1 text-xs text-[#617068]">{quote.versions.length}개 버전 · 최신 {version.version_number}차</p></div><span className="rounded-md bg-[#edf7f0] px-2.5 py-1 text-xs font-semibold text-[#23583f]">{version.title}</span></div><div className="mt-4 rounded-md bg-[#f7f8f5] p-4"><h4 className="text-sm font-semibold">최신 버전 미리보기</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#526057]">{version.body}</p><p className="mt-3 text-sm font-semibold text-[#17201a]">총 {formatAmount(version.total_amount)} · 계약금 {formatAmount(version.deposit_amount)} · 잔금 {formatAmount(version.balance_amount)}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#617068]">{scopeStrings(version.scope_items).map((item) => <li key={item}>{item}</li>)}</ul></div><div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" onClick={onSend} disabled={busy.send || busy.manual || !quote.quote.latest_version_id}><Send aria-hidden className="size-4" />자동 이메일 발송</Button><Button type="button" size="sm" variant="outline" onClick={() => onManual(false)} disabled={busy.manual || busy.send}><Download aria-hidden className="size-4" />수동 PDF 발급</Button><Button type="button" size="sm" variant="outline" onClick={() => onManual(true)} disabled={busy.manual || busy.send}>재발급</Button></div>{delivery ? <div className="mt-4 rounded-md bg-[#f7f8f5] p-3 text-sm"><p className="font-semibold">자동 발송 상태: {getQuoteDeliveryLabel(delivery.status)}</p><p className="mt-1 text-xs text-[#617068]">시도 {delivery.attemptCount}/{delivery.maxAttempts}{delivery.errorCode ? ` · 오류 ${delivery.errorCode}` : ""}</p>{delivery.status === "failed" || delivery.status === "retry" ? <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => onRetry(delivery.id)} disabled={busy.retry}><RefreshCw aria-hidden className="size-4" />발송 재시도</Button> : null}</div> : null}</section><section className={cn("rounded-md border p-4", approved ? "border-[#d6e8dc] bg-[#f4faf6]" : "border-[#e8ebe5]")}><div className="flex items-start gap-3"><ShieldCheck aria-hidden className="mt-0.5 size-5 text-[#2e6f4f]" /><div><h3 className="font-semibold">계약 확인 및 프로젝트 생성</h3><p className="mt-1 text-sm leading-6 text-[#617068]">고객 승인과 서명본 수령 확인이 완료된 뒤에만 실행할 수 있습니다.</p></div></div>{!approved ? <p className="mt-4 rounded-md bg-[#fff8e6] px-3 py-2 text-sm text-[#795500]">고객 승인 전에는 프로젝트 생성을 실행할 수 없습니다.</p> : null}{approved && !requiresSigned ? <p className="mt-4 rounded-md bg-[#fff8e6] px-3 py-2 text-sm text-[#795500]">서명 확인 상태는 서버에서 최종 검증됩니다. 확인되지 않은 계약은 안전하게 거부됩니다.</p> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="프로젝트명" value={projectName} disabled={!approved || contractConfirmed || busy.confirm} onChange={setProjectName} /><Field label="계약금 비율" type="number" value={depositPercentage} disabled={!approved || contractConfirmed || busy.confirm} onChange={setDepositPercentage} /><Field label="잔금 비율" type="number" value={balancePercentage} disabled={!approved || contractConfirmed || busy.confirm} onChange={setBalancePercentage} /></div><label className="mt-3 grid gap-1 text-sm text-[#526057]">프로젝트 메모<textarea rows={3} value={projectMemo} disabled={!approved || contractConfirmed || busy.confirm} onChange={(event) => setProjectMemo(event.target.value)} className="rounded-md border border-[#dfe3dc] px-3 py-2 outline-none focus:border-[#2e6f4f]" /></label><label className="mt-3 flex items-start gap-2 text-sm text-[#526057]"><input type="checkbox" checked={confirmed} disabled={!approved || contractConfirmed || busy.confirm} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 size-4 accent-[#2e6f4f]" /><span>승인·서명본 수령과 결제 예정 정보를 확인했으며 프로젝트 생성을 실행합니다.</span></label><Button type="button" className="mt-4" onClick={confirmContract} disabled={!approved || contractConfirmed || !confirmed || !projectName.trim() || busy.confirm}>{busy.confirm ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ShieldCheck aria-hidden className="size-4" />}{contractConfirmed ? "프로젝트 생성 완료" : "서명 확인 및 프로젝트 생성"}</Button></section></div>;
}

function Field({ label, value, onChange, error, type = "text", required = false, disabled = false }: Readonly<{ label: string; value: string; onChange: (value: string) => void; error?: string; type?: string; required?: boolean; disabled?: boolean }>) { return <label className="grid gap-1 text-xs font-semibold text-[#617068]">{label}<input type={type} value={value} required={required} disabled={disabled} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-[#dfe3dc] bg-white px-3 text-sm font-normal text-[#17201a] outline-none focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15 disabled:cursor-not-allowed disabled:bg-[#f7f8f5]" />{error ? <span className="font-normal text-[#b42318]">{error}</span> : null}</label>; }
function Loading({ text }: Readonly<{ text: string }>) { return <div role="status" className="flex items-center gap-2 rounded-md border border-[#e8ebe5] p-5 text-sm text-[#617068]"><Loader2 aria-hidden className="size-4 animate-spin" />{text}</div>; }
function ErrorBox({ message, onRetry }: Readonly<{ message: string; onRetry: () => void }>) { return <div role="alert" className="rounded-md border border-[#f4d4d1] bg-[#fff1f0] p-4 text-sm text-[#912018]"><div className="flex items-start gap-2"><AlertCircle aria-hidden className="mt-0.5 size-4" /><span>{message}</span></div><Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>다시 시도</Button></div>; }
function EmptyPanel({ text }: Readonly<{ text: string }>) { return <div className="flex min-h-64 items-center justify-center rounded-md border border-dashed border-[#dfe3dc] p-8 text-center text-sm text-[#617068]">{text}</div>; }
function splitFields(value: string, percentage: number) { const total = Number(value); if (!Number.isSafeInteger(total) || total < 0) return { depositAmount: "", balanceAmount: "" }; const split = calculateQuoteSplit(total, percentage); return { depositAmount: String(split.depositAmount), balanceAmount: String(split.balanceAmount) }; }
function formatDateTime(value: string) { if (!value) return "확인 필요"; return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatAmount(value: number) { return `${new Intl.NumberFormat("ko-KR").format(value)}원`; }
function scopeStrings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []; }
function errorMessage(error: unknown) { return error instanceof AdminQuoteRequestError ? error.message : error instanceof Error ? error.message : "요청을 처리하지 못했습니다."; }
