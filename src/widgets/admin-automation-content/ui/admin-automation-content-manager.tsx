"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, BookOpenText, CheckCircle2, FilePlus2, Loader2, RefreshCw, Save, Settings2 } from "lucide-react";

import type { AdminFaqItem, AdminServiceOffering } from "@/entities/automation";
import {
  buildFaqPayload, buildServicePayload, emptyFaqForm, emptyServiceForm,
  faqToFormValues, getContentSaveFailure, serviceToFormValues,
  type FaqFormValues, type ServiceFormValues,
} from "@/features/manage-automation-content";
import type { ApiResponse } from "@/shared/types/api";
import { Button } from "@/shared/ui/button";

type LoadState<T> = { status: "loading" } | { status: "success"; items: T[] } | { status: "error"; message: string };
type EditorMode = { type: "create" } | { type: "edit"; id: string };

export function AdminAutomationContentManager() {
  const [tab, setTab] = useState<"services" | "faqs">("services");
  function activateTab(nextTab: "services" | "faqs", id: string) {
    setTab(nextTab);
    queueMicrotask(() => document.getElementById(id)?.focus());
  }
  return (
    <section className="overflow-hidden rounded-lg border border-[#dfe3dc] bg-white">
      <header className="border-b border-[#e8ebe5] p-5">
        <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-md bg-[#17201a] text-white"><Settings2 aria-hidden className="size-5" /></span><div><h2 className="text-lg font-semibold">서비스·FAQ 관리</h2><p className="text-sm text-[#617068]">공개 홈과 AI 답변에 사용하는 운영 기준을 관리합니다.</p></div></div>
        <div className="mt-5 flex gap-2" role="tablist" aria-label="콘텐츠 종류">
          <Tab active={tab === "services"} onClick={() => setTab("services")} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); activateTab("faqs", "faqs-tab"); } }} id="services-tab" controls="services-panel">서비스·가격</Tab>
          <Tab active={tab === "faqs"} onClick={() => setTab("faqs")} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); activateTab("services", "services-tab"); } }} id="faqs-tab" controls="faqs-panel">FAQ</Tab>
        </div>
      </header>
      {tab === "services" ? <ServiceManager /> : <FaqManager />}
    </section>
  );
}

function Tab({ active, onClick, onKeyDown, id, controls, children }: Readonly<{ active: boolean; onClick: () => void; onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>; id: string; controls: string; children: React.ReactNode }>) {
  return <button type="button" role="tab" id={id} aria-controls={controls} aria-selected={active} tabIndex={active ? 0 : -1} onClick={onClick} onKeyDown={onKeyDown} className={`rounded-md px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-[#2e6f4f]/25 ${active ? "bg-[#17201a] text-white" : "border border-[#dfe3dc] text-[#526057] hover:bg-[#f5f6f3]"}`}>{children}</button>;
}

function ServiceManager() {
  const [state, setState] = useState<LoadState<AdminServiceOffering>>({ status: "loading" });
  const [mode, setMode] = useState<EditorMode>({ type: "create" });
  const [value, setValue] = useState<ServiceFormValues>({ ...emptyServiceForm });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async (preferredId?: string) => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/admin/service-offerings", { cache: "no-store", headers: { Accept: "application/json" } });
      const result = await response.json() as ApiResponse<AdminServiceOffering[]>;
      if (!response.ok || "error" in result) {
        const auth = response.status === 401 || response.status === 403;
        setState({ status: "error", message: auth ? "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요." : "서비스 목록을 불러오지 못했습니다." }); return;
      }
      setState({ status: "success", items: result.data });
      const selected = result.data.find((item) => item.id === preferredId) ?? result.data[0];
      if (selected) { setMode({ type: "edit", id: selected.id }); setValue(serviceToFormValues(selected)); }
      else { setMode({ type: "create" }); setValue({ ...emptyServiceForm }); }
    } catch { setState({ status: "error", message: "네트워크 문제로 서비스 목록을 불러오지 못했습니다." }); }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const select = (item: AdminServiceOffering) => { setMode({ type: "edit", id: item.id }); setValue(serviceToFormValues(item)); setErrors({}); setMessage(null); };
  const create = () => { setMode({ type: "create" }); setValue({ ...emptyServiceForm }); setErrors({}); setMessage(null); };

  async function save() {
    setSaving(true); setErrors({}); setMessage(null);
    const editing = mode.type === "edit";
    try {
      const response = await fetch(editing ? `/api/admin/service-offerings/${mode.id}` : "/api/admin/service-offerings", { method: editing ? "PATCH" : "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(buildServicePayload(value)) });
      const result = await response.json() as ApiResponse<AdminServiceOffering>;
      if (!response.ok || "error" in result) {
        if ("error" in result) { const failure = getContentSaveFailure(response.status, result); setErrors(failure.fieldErrors); setMessage({ tone: "error", text: failure.message }); }
        else setMessage({ tone: "error", text: "서비스를 저장하지 못했습니다." });
        return;
      }
      setMessage({ tone: "success", text: editing ? "서비스를 수정했습니다." : "새 서비스를 만들었습니다." });
      await load(result.data.id);
    } catch { setMessage({ tone: "error", text: "네트워크 문제로 서비스를 저장하지 못했습니다." }); }
    finally { setSaving(false); }
  }

  return <div id="services-panel" role="tabpanel" aria-labelledby="services-tab" className="grid xl:grid-cols-[0.7fr_1.3fr]">
    <ContentList state={state} selectedId={mode.type === "edit" ? mode.id : null} label="서비스" getId={(item) => item.id} render={(item) => <><strong className="block text-sm">{item.name}</strong><span className="mt-1 block text-xs text-[#617068]">{item.priceLabel} · 순서 {item.sortOrder} · {item.isPublished ? "게시" : "비공개"}</span></>} onSelect={select} onRefresh={() => void load(mode.type === "edit" ? mode.id : undefined)} onCreate={create} saving={saving} />
    <EditorShell title={mode.type === "create" ? "새 서비스" : value.name || "서비스 수정"} message={message}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="서비스명" error={errors.name?.[0]}><TextInput value={value.name} onChange={(name) => setValue({ ...value, name })} disabled={saving} maxLength={120} required /></Field><Field label="slug" hint="영문 소문자와 하이픈" error={errors.slug?.[0]}><TextInput value={value.slug} onChange={(slug) => setValue({ ...value, slug })} disabled={saving} maxLength={100} required /></Field></div>
        <Field label="설명" error={errors.description?.[0]}><TextArea value={value.description} onChange={(description) => setValue({ ...value, description })} disabled={saving} maxLength={2000} rows={4} required /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="가격 표시 문구" error={errors.priceLabel?.[0]}><TextInput value={value.priceLabel} onChange={(priceLabel) => setValue({ ...value, priceLabel })} disabled={saving} maxLength={120} required /></Field><Field label="예상 기간" error={errors.durationLabel?.[0]}><TextInput value={value.durationLabel} onChange={(durationLabel) => setValue({ ...value, durationLabel })} disabled={saving} maxLength={120} required /></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="최소 가격(원)" error={errors.priceMin?.[0]}><TextInput type="number" min="0" step="1" value={value.priceMin} onChange={(priceMin) => setValue({ ...value, priceMin })} disabled={saving} /></Field><Field label="최대 가격(원)" error={errors.priceMax?.[0]}><TextInput type="number" min="0" step="1" value={value.priceMax} onChange={(priceMax) => setValue({ ...value, priceMax })} disabled={saving} /></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="포함 항목" hint="한 줄에 하나씩" error={errors.includedItems?.[0]}><TextArea value={value.includedItems} onChange={(includedItems) => setValue({ ...value, includedItems })} disabled={saving} rows={5} /></Field><Field label="제외 항목" hint="한 줄에 하나씩" error={errors.excludedItems?.[0]}><TextArea value={value.excludedItems} onChange={(excludedItems) => setValue({ ...value, excludedItems })} disabled={saving} rows={5} /></Field></div>
        <Field label="AI 내부 가이드" hint="공개 화면에는 표시되지 않습니다." error={errors.aiGuidance?.[0]}><TextArea value={value.aiGuidance} onChange={(aiGuidance) => setValue({ ...value, aiGuidance })} disabled={saving} maxLength={3000} rows={5} /></Field>
        <PublishFields published={value.isPublished} onPublished={(isPublished) => setValue({ ...value, isPublished })} order={value.sortOrder} onOrder={(sortOrder) => setValue({ ...value, sortOrder })} disabled={saving} error={errors.sortOrder?.[0]} />
        <SaveButton saving={saving} label={mode.type === "create" ? "서비스 만들기" : "변경사항 저장"} />
      </form>
    </EditorShell>
  </div>;
}

function FaqManager() {
  const [state, setState] = useState<LoadState<AdminFaqItem>>({ status: "loading" });
  const [mode, setMode] = useState<EditorMode>({ type: "create" });
  const [value, setValue] = useState<FaqFormValues>({ ...emptyFaqForm });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const load = useCallback(async (preferredId?: string) => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/admin/faqs", { cache: "no-store", headers: { Accept: "application/json" } });
      const result = await response.json() as ApiResponse<AdminFaqItem[]>;
      if (!response.ok || "error" in result) { const auth = response.status === 401 || response.status === 403; setState({ status: "error", message: auth ? "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요." : "FAQ 목록을 불러오지 못했습니다." }); return; }
      setState({ status: "success", items: result.data });
      const selected = result.data.find((item) => item.id === preferredId) ?? result.data[0];
      if (selected) { setMode({ type: "edit", id: selected.id }); setValue(faqToFormValues(selected)); }
      else { setMode({ type: "create" }); setValue({ ...emptyFaqForm }); }
    } catch { setState({ status: "error", message: "네트워크 문제로 FAQ 목록을 불러오지 못했습니다." }); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const select = (item: AdminFaqItem) => { setMode({ type: "edit", id: item.id }); setValue(faqToFormValues(item)); setErrors({}); setMessage(null); };
  const create = () => { setMode({ type: "create" }); setValue({ ...emptyFaqForm }); setErrors({}); setMessage(null); };
  async function save() {
    setSaving(true); setErrors({}); setMessage(null); const editing = mode.type === "edit";
    try {
      const response = await fetch(editing ? `/api/admin/faqs/${mode.id}` : "/api/admin/faqs", { method: editing ? "PATCH" : "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(buildFaqPayload(value)) });
      const result = await response.json() as ApiResponse<AdminFaqItem>;
      if (!response.ok || "error" in result) { if ("error" in result) { const failure = getContentSaveFailure(response.status, result); setErrors(failure.fieldErrors); setMessage({ tone: "error", text: failure.message }); } else setMessage({ tone: "error", text: "FAQ를 저장하지 못했습니다." }); return; }
      setMessage({ tone: "success", text: editing ? "FAQ를 수정했습니다." : "새 FAQ를 만들었습니다." }); await load(result.data.id);
    } catch { setMessage({ tone: "error", text: "네트워크 문제로 FAQ를 저장하지 못했습니다." }); }
    finally { setSaving(false); }
  }
  return <div id="faqs-panel" role="tabpanel" aria-labelledby="faqs-tab" className="grid xl:grid-cols-[0.7fr_1.3fr]">
    <ContentList state={state} selectedId={mode.type === "edit" ? mode.id : null} label="FAQ" getId={(item) => item.id} render={(item) => <><strong className="block text-sm">{item.question}</strong><span className="mt-1 block text-xs text-[#617068]">순서 {item.sortOrder} · {item.isPublished ? "게시" : "비공개"}</span></>} onSelect={select} onRefresh={() => void load(mode.type === "edit" ? mode.id : undefined)} onCreate={create} saving={saving} />
    <EditorShell title={mode.type === "create" ? "새 FAQ" : value.question || "FAQ 수정"} message={message}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="grid gap-4">
        <Field label="질문" error={errors.question?.[0]}><TextArea value={value.question} onChange={(question) => setValue({ ...value, question })} disabled={saving} maxLength={500} rows={3} required /></Field>
        <Field label="답변" error={errors.answer?.[0]}><TextArea value={value.answer} onChange={(answer) => setValue({ ...value, answer })} disabled={saving} maxLength={4000} rows={7} required /></Field>
        <Field label="AI 내부 가이드" hint="공개 화면에는 표시되지 않습니다." error={errors.aiGuidance?.[0]}><TextArea value={value.aiGuidance} onChange={(aiGuidance) => setValue({ ...value, aiGuidance })} disabled={saving} maxLength={3000} rows={5} /></Field>
        <PublishFields published={value.isPublished} onPublished={(isPublished) => setValue({ ...value, isPublished })} order={value.sortOrder} onOrder={(sortOrder) => setValue({ ...value, sortOrder })} disabled={saving} error={errors.sortOrder?.[0]} />
        <SaveButton saving={saving} label={mode.type === "create" ? "FAQ 만들기" : "변경사항 저장"} />
      </form>
    </EditorShell>
  </div>;
}

function ContentList<T>({ state, selectedId, label, getId, render, onSelect, onRefresh, onCreate, saving }: Readonly<{ state: LoadState<T>; selectedId: string | null; label: string; getId: (item: T) => string; render: (item: T) => React.ReactNode; onSelect: (item: T) => void; onRefresh: () => void; onCreate: () => void; saving: boolean }>) {
  return <aside className="border-b border-[#e8ebe5] xl:border-r xl:border-b-0"><div className="flex flex-wrap gap-2 border-b border-[#e8ebe5] p-4"><Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={state.status === "loading" || saving}><RefreshCw aria-hidden className={state.status === "loading" ? "animate-spin" : ""} />새로고침</Button><Button type="button" size="sm" onClick={onCreate} disabled={saving}><FilePlus2 aria-hidden />새 {label}</Button></div>
    {state.status === "loading" ? <div role="status" className="flex min-h-64 items-center justify-center gap-2 p-5 text-sm text-[#617068]"><Loader2 aria-hidden className="size-5 animate-spin" />목록을 불러오는 중입니다.</div> : state.status === "error" ? <div role="alert" className="flex min-h-64 flex-col items-center justify-center p-5 text-center"><AlertCircle aria-hidden className="size-7 text-[#b42318]" /><p className="mt-3 text-sm text-[#912018]">{state.message}</p>{state.message.startsWith("관리자 로그인이") ? <a className="mt-3 text-sm font-semibold underline" href="/admin/login?next=/admin">로그인하기</a> : null}</div> : state.items.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center p-5 text-center"><BookOpenText aria-hidden className="size-7 text-[#8a968d]" /><p className="mt-3 text-sm text-[#617068]">등록된 {label}가 없습니다.</p></div> : <ul className="max-h-[42rem] overflow-y-auto p-3">{state.items.map((item) => { const id = getId(item); return <li key={id}><button type="button" onClick={() => onSelect(item)} aria-pressed={selectedId === id} className={`w-full rounded-md p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-[#2e6f4f]/25 ${selectedId === id ? "bg-[#eaf3ed] text-[#23583f]" : "hover:bg-[#f5f6f3]"}`}>{render(item)}</button></li>; })}</ul>}
  </aside>;
}

function EditorShell({ title, message, children }: Readonly<{ title: string; message: { tone: "success" | "error"; text: string } | null; children: React.ReactNode }>) {
  return <div className="p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#2e6f4f]">Editor</p><h3 className="mt-2 text-xl font-semibold">{title}</h3>{message ? <div role={message.tone === "error" ? "alert" : "status"} className={`my-5 flex gap-2 rounded-md p-3 text-sm ${message.tone === "error" ? "bg-[#fff1ee] text-[#912018]" : "bg-[#edf7f0] text-[#23583f]"}`}>{message.tone === "error" ? <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />}<span>{message.text}{message.text.startsWith("관리자 로그인이") ? <a className="ml-2 font-semibold underline" href="/admin/login?next=/admin">로그인하기</a> : null}</span></div> : <div className="h-5" />}{children}</div>;
}

function Field({ label, hint, error, children }: Readonly<{ label: string; hint?: string; error?: string; children: React.ReactNode }>) {
  return <label className="grid gap-2 text-sm font-semibold text-[#526057]"><span>{label}{hint ? <span className="ml-2 text-xs font-normal text-[#7a867e]">{hint}</span> : null}</span>{children}{error ? <span className="text-xs font-normal text-[#b42318]">{error}</span> : null}</label>;
}

function TextInput({ value, onChange, ...props }: Readonly<{ value: string; onChange: (value: string) => void }> & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-[#dfe3dc] bg-white px-3 font-normal text-[#17201a] outline-none focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15 disabled:bg-[#f5f6f3]" {...props} />;
}
function TextArea({ value, onChange, ...props }: Readonly<{ value: string; onChange: (value: string) => void }> & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} className="resize-y rounded-md border border-[#dfe3dc] bg-white px-3 py-2 font-normal leading-6 text-[#17201a] outline-none focus:border-[#2e6f4f] focus:ring-3 focus:ring-[#2e6f4f]/15 disabled:bg-[#f5f6f3]" {...props} />;
}
function PublishFields({ published, onPublished, order, onOrder, disabled, error }: Readonly<{ published: boolean; onPublished: (value: boolean) => void; order: string; onOrder: (value: string) => void; disabled: boolean; error?: string }>) {
  return <div className="grid items-end gap-4 sm:grid-cols-2"><label className="flex h-10 items-center gap-2 text-sm font-semibold text-[#526057]"><input type="checkbox" checked={published} onChange={(event) => onPublished(event.target.checked)} disabled={disabled} className="size-4 accent-[#2e6f4f]" />공개 게시</label><Field label="표시 순서" error={error}><TextInput type="number" min="0" step="1" value={order} onChange={onOrder} disabled={disabled} required /></Field></div>;
}
function SaveButton({ saving, label }: Readonly<{ saving: boolean; label: string }>) {
  return <div className="flex justify-end"><Button type="submit" size="lg" className="h-10 bg-[#17201a] px-4 text-white hover:bg-[#2b382f]" disabled={saving}>{saving ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}{label}</Button></div>;
}
