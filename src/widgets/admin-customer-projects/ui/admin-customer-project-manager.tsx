"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";

import type { AdminCustomerDetail, AdminCustomerListItem } from "@/entities/customer";
import type { AdminInquiryDetail } from "@/entities/inquiry";
import type { AdminProjectDetail, AdminProjectListItem, ProjectStatus } from "@/entities/project";
import type { ApiResponse } from "@/shared/types/api";
import { Button } from "@/shared/ui/button";
import {
  buildCustomerPayload, buildProjectPayload, customerToFormValues, emptyCustomerForm, emptyProjectForm,
  getConvertedProjectId, getCustomerDetailUrl, getInquiryDetailUrl, getProjectDetailUrl, getSaveFailure, projectStatusLabels, projectStatuses, projectToFormValues,
  toCustomerListState, toProjectListState, type AdminCustomerListState, type AdminProjectListState,
  type CustomerFormValues, type ProjectFormValues,
} from "../model/admin-customer-project-state";

type Tab = "customers" | "projects";
type DetailState<T> = { status: "idle" } | { status: "loading" } | { status: "success"; item: T; notice?: string } | { status: "error"; message: string };
type LinkedState<T> = { status: "idle" } | { status: "loading" } | { status: "success"; item: T } | { status: "error"; message: string };

const initialCustomerState: AdminCustomerListState = { status: "loading" };
const initialProjectState: AdminProjectListState = { status: "loading" };

export function AdminCustomerProjectManager() {
  const [tab, setTab] = useState<Tab>("customers");
  const [customerState, setCustomerState] = useState<AdminCustomerListState>(initialCustomerState);
  const [projectState, setProjectState] = useState<AdminProjectListState>(initialProjectState);
  const [customerQuery, setCustomerQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | "">("");
  const [customerPage, setCustomerPage] = useState(1);
  const [projectPage, setProjectPage] = useState(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<DetailState<AdminCustomerDetail>>({ status: "idle" });
  const [projectDetail, setProjectDetail] = useState<DetailState<AdminProjectDetail>>({ status: "idle" });
  const [linkedProject, setLinkedProject] = useState<LinkedState<AdminProjectDetail>>({ status: "idle" });
  const [linkedCustomer, setLinkedCustomer] = useState<LinkedState<AdminCustomerDetail>>({ status: "idle" });

  const loadCustomers = useCallback(async (page = customerPage, q = customerQuery) => {
    setCustomerState({ status: "loading" });
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", sort: "created_at", direction: "desc" });
      if (q) params.set("q", q);
      const response = await fetch(`/api/admin/customers?${params}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const result = (await response.json()) as ApiResponse<{ items: AdminCustomerListItem[]; page: number; totalPages: number }>;
      const state = toCustomerListState(result, response.status);
      setCustomerState(state);
      if (state.status === "success") setSelectedCustomerId((current) => state.items.some((item) => item.id === current) ? current : state.items[0]?.id ?? null);
      if (state.status === "empty") setSelectedCustomerId(null);
    } catch { setCustomerState({ status: "error", message: "네트워크 문제로 고객 목록을 불러오지 못했습니다." }); }
  }, [customerPage, customerQuery]);

  const loadProjects = useCallback(async (page = projectPage, q = projectQuery, status = projectStatus) => {
    setProjectState({ status: "loading" });
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", sort: "created_at", direction: "desc" });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const response = await fetch(`/api/admin/projects?${params}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const result = (await response.json()) as ApiResponse<{ items: AdminProjectListItem[]; page: number; totalPages: number }>;
      const state = toProjectListState(result, response.status);
      setProjectState(state);
      if (state.status === "success") setSelectedProjectId((current) => state.items.some((item) => item.id === current) ? current : state.items[0]?.id ?? null);
      if (state.status === "empty") setSelectedProjectId(null);
    } catch { setProjectState({ status: "error", message: "네트워크 문제로 프로젝트 목록을 불러오지 못했습니다." }); }
  }, [projectPage, projectQuery, projectStatus]);

  useEffect(() => { queueMicrotask(() => { void loadCustomers(); }); }, [loadCustomers]);
  useEffect(() => { queueMicrotask(() => { void loadProjects(); }); }, [loadProjects]);

  useEffect(() => {
    if (!selectedCustomerId) { queueMicrotask(() => setCustomerDetail({ status: "idle" })); return; }
    let active = true;
    queueMicrotask(() => setCustomerDetail({ status: "loading" }));
    void fetch(getCustomerDetailUrl(selectedCustomerId), { cache: "no-store", headers: { Accept: "application/json" } })
      .then(async (response) => ({ response, result: await response.json() as ApiResponse<AdminCustomerDetail> }))
      .then(({ response, result }) => { if (!active) return; setCustomerDetail(!response.ok || "error" in result ? { status: "error", message: "error" in result ? result.error.message : "고객 상세를 불러오지 못했습니다." } : { status: "success", item: result.data }); })
      .catch(() => { if (active) setCustomerDetail({ status: "error", message: "네트워크 문제로 고객 상세를 불러오지 못했습니다." }); });
    return () => { active = false; };
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!selectedProjectId) { queueMicrotask(() => setProjectDetail({ status: "idle" })); return; }
    let active = true;
    queueMicrotask(() => setProjectDetail({ status: "loading" }));
    void fetch(getProjectDetailUrl(selectedProjectId), { cache: "no-store", headers: { Accept: "application/json" } })
      .then(async (response) => ({ response, result: await response.json() as ApiResponse<AdminProjectDetail> }))
      .then(({ response, result }) => { if (!active) return; setProjectDetail(!response.ok || "error" in result ? { status: "error", message: "error" in result ? result.error.message : "프로젝트 상세를 불러오지 못했습니다." } : { status: "success", item: result.data }); })
      .catch(() => { if (active) setProjectDetail({ status: "error", message: "네트워크 문제로 프로젝트 상세를 불러오지 못했습니다." }); });
    return () => { active = false; };
  }, [selectedProjectId]);

  useEffect(() => {
    if (customerDetail.status !== "success") {
      queueMicrotask(() => setLinkedProject({ status: "idle" }));
      return;
    }
    const inquiryId = customerDetail.item.inquiry_id;
    if (!inquiryId) {
      queueMicrotask(() => setLinkedProject({ status: "idle" }));
      return;
    }
    let active = true;
    queueMicrotask(() => setLinkedProject({ status: "loading" }));
    void (async () => {
      try {
        const inquiryResponse = await fetch(getInquiryDetailUrl(inquiryId), { cache: "no-store", headers: { Accept: "application/json" } });
        const inquiryResult = await inquiryResponse.json() as ApiResponse<AdminInquiryDetail>;
        if (!inquiryResponse.ok || "error" in inquiryResult) {
          if (active) setLinkedProject({ status: "error", message: "연결된 문의 정보를 불러오지 못했습니다." });
          return;
        }
        const projectId = getConvertedProjectId(inquiryResult.data);
        if (!projectId) {
          if (active) setLinkedProject({ status: "idle" });
          return;
        }
        const projectResponse = await fetch(getProjectDetailUrl(projectId), { cache: "no-store", headers: { Accept: "application/json" } });
        const projectResult = await projectResponse.json() as ApiResponse<AdminProjectDetail>;
        if (!active) return;
        setLinkedProject(!projectResponse.ok || "error" in projectResult
          ? { status: "error", message: "연결된 프로젝트를 불러오지 못했습니다." }
          : { status: "success", item: projectResult.data });
      } catch {
        if (active) setLinkedProject({ status: "error", message: "네트워크 문제로 연결 프로젝트를 불러오지 못했습니다." });
      }
    })();
    return () => { active = false; };
  }, [customerDetail]);

  useEffect(() => {
    if (projectDetail.status !== "success") {
      queueMicrotask(() => setLinkedCustomer({ status: "idle" }));
      return;
    }
    const customerId = projectDetail.item.customer_id;
    let active = true;
    queueMicrotask(() => setLinkedCustomer({ status: "loading" }));
    void fetch(getCustomerDetailUrl(customerId), { cache: "no-store", headers: { Accept: "application/json" } })
      .then(async (response) => ({ response, result: await response.json() as ApiResponse<AdminCustomerDetail> }))
      .then(({ response, result }) => {
        if (!active) return;
        setLinkedCustomer(!response.ok || "error" in result
          ? { status: "error", message: "연결된 고객을 불러오지 못했습니다." }
          : { status: "success", item: result.data });
      })
      .catch(() => { if (active) setLinkedCustomer({ status: "error", message: "네트워크 문제로 연결 고객을 불러오지 못했습니다." }); });
    return () => { active = false; };
  }, [projectDetail]);

  const selectCustomer = (item: AdminCustomerListItem) => { setSelectedCustomerId(item.id); setTab("customers"); };
  const selectProject = (item: AdminProjectListItem) => { setSelectedProjectId(item.id); setTab("projects"); };
  return (
    <section className="overflow-hidden rounded-lg border border-[#dfe3dc] bg-white">
      <div className="flex flex-col gap-4 border-b border-[#e8ebe5] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-semibold">고객·프로젝트 관리</h2><p className="mt-1 text-sm text-[#617068]">문의 전환으로 생성된 고객과 프로젝트를 검색하고 수정합니다.</p></div>
        <Button type="button" variant="outline" size="sm" onClick={() => tab === "customers" ? void loadCustomers() : void loadProjects()}><RefreshCw aria-hidden className="size-4" />새로고침</Button>
      </div>
      <div className="flex gap-1 border-b border-[#e8ebe5] px-5 pt-3" role="tablist" aria-label="고객 및 프로젝트">
        {(["customers", "projects"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`border-b-2 px-3 pb-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#2e6f4f] ${tab === value ? "border-[#2e6f4f] text-[#2e6f4f]" : "border-transparent text-[#617068]"}`}>{value === "customers" ? "고객" : "프로젝트"}</button>)}
      </div>
      {tab === "customers" ? <CustomerPanel state={customerState} query={customerQuery} setQuery={setCustomerQuery} page={customerPage} setPage={setCustomerPage} onSearch={() => { setCustomerPage(1); void loadCustomers(1, customerQuery); }} onPage={(nextPage) => void loadCustomers(nextPage)} selectedId={selectedCustomerId} onSelect={selectCustomer} detail={customerDetail} onSaved={(item) => { setCustomerDetail({ status: "success", item, notice: "고객 정보를 저장했습니다." }); void loadCustomers(customerPage); }} linkedProject={linkedProject.status === "success" ? linkedProject.item : undefined} linkedProjectState={linkedProject} onProject={linkedProject.status === "success" ? () => selectProject(linkedProject.item) : undefined} /> : <ProjectPanel state={projectState} query={projectQuery} setQuery={setProjectQuery} status={projectStatus} setStatus={setProjectStatus} page={projectPage} setPage={setProjectPage} onSearch={() => { setProjectPage(1); void loadProjects(1, projectQuery, projectStatus); }} onPage={(nextPage) => void loadProjects(nextPage, projectQuery, projectStatus)} selectedId={selectedProjectId} onSelect={selectProject} detail={projectDetail} onSaved={(item) => { setProjectDetail({ status: "success", item, notice: "프로젝트 정보를 저장했습니다." }); void loadProjects(projectPage); }} linkedCustomer={linkedCustomer.status === "success" ? linkedCustomer.item : undefined} linkedCustomerState={linkedCustomer} onCustomer={linkedCustomer.status === "success" ? () => selectCustomer(linkedCustomer.item) : undefined} />}
    </section>
  );
}

function SearchBar({ value, onChange, onSubmit, children }: Readonly<{ value: string; onChange: (value: string) => void; onSubmit: () => void; children?: React.ReactNode }>) {
  return <form className="flex flex-wrap gap-2 p-4" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><label className="relative min-w-48 flex-1"><span className="sr-only">검색</span><Search aria-hidden className="pointer-events-none absolute left-3 top-2.5 size-4 text-[#8a968d]" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="이름, 회사명, 이메일 검색" className="h-9 w-full rounded-md border border-[#d8d1c6] pl-9 pr-3 text-sm outline-none focus:border-[#2e6f4f]" /></label>{children}<Button type="submit" size="sm">검색</Button></form>;
}

function CustomerPanel(props: Readonly<{ state: AdminCustomerListState; query: string; setQuery: (value: string) => void; page: number; setPage: (value: number) => void; onSearch: () => void; onPage: (page: number) => void; selectedId: string | null; onSelect: (item: AdminCustomerListItem) => void; detail: DetailState<AdminCustomerDetail>; onSaved: (item: AdminCustomerDetail) => void; linkedProject?: AdminProjectDetail; linkedProjectState: LinkedState<AdminProjectDetail>; onProject?: () => void }>) {
  const { state, query, setQuery, page, setPage, onSearch, onPage, selectedId, onSelect, detail, onSaved, linkedProject, linkedProjectState, onProject } = props;
  return <><SearchBar value={query} onChange={setQuery} onSubmit={onSearch} /><div className="grid xl:grid-cols-[0.72fr_1.28fr]"><ListPane state={state} selectedId={selectedId} onSelect={(item) => { if ("email" in item) onSelect(item); }} page={page} setPage={setPage} onPage={onPage} kind="customer" /><CustomerEditor detail={detail} onSaved={onSaved} linkedProject={linkedProject} linkedProjectState={linkedProjectState} onProject={onProject} /></div></>;
}

function ProjectPanel(props: Readonly<{ state: AdminProjectListState; query: string; setQuery: (value: string) => void; status: ProjectStatus | ""; setStatus: (value: ProjectStatus | "") => void; page: number; setPage: (value: number) => void; onSearch: () => void; onPage: (page: number) => void; selectedId: string | null; onSelect: (item: AdminProjectListItem) => void; detail: DetailState<AdminProjectDetail>; onSaved: (item: AdminProjectDetail) => void; linkedCustomer?: AdminCustomerDetail; linkedCustomerState: LinkedState<AdminCustomerDetail>; onCustomer?: () => void }>) {
  const { state, query, setQuery, status, setStatus, page, setPage, onSearch, onPage, selectedId, onSelect, detail, onSaved, linkedCustomer, linkedCustomerState, onCustomer } = props;
  return <><SearchBar value={query} onChange={setQuery} onSubmit={onSearch}><select aria-label="프로젝트 상태" value={status} onChange={(event) => { setStatus(event.target.value as ProjectStatus | ""); }} className="h-9 rounded-md border border-[#d8d1c6] bg-white px-2 text-sm"><option value="">모든 상태</option>{projectStatuses.map((value) => <option key={value} value={value}>{projectStatusLabels[value]}</option>)}</select></SearchBar><div className="grid xl:grid-cols-[0.72fr_1.28fr]"><ListPane state={state} selectedId={selectedId} onSelect={(item) => { if ("status" in item) onSelect(item); }} page={page} setPage={setPage} onPage={onPage} kind="project" /><ProjectEditor detail={detail} onSaved={onSaved} linkedCustomer={linkedCustomer} linkedCustomerState={linkedCustomerState} onCustomer={onCustomer} /></div></>;
}

function ListPane({ state, selectedId, onSelect, page, setPage, onPage, kind }: Readonly<{ state: AdminCustomerListState | AdminProjectListState; selectedId: string | null; onSelect: (item: AdminCustomerListItem | AdminProjectListItem) => void; page: number; setPage: (value: number) => void; onPage: (page: number) => void; kind: "customer" | "project" }>) {
  if (state.status === "loading") return <div className="flex min-h-64 items-center justify-center gap-2 border-b border-[#e8ebe5] p-6 text-sm text-[#617068] xl:border-r xl:border-b-0"><Loader2 aria-hidden className="size-5 animate-spin text-[#2e6f4f]" />목록을 불러오는 중입니다.</div>;
  if (state.status === "error") return <div className="flex min-h-64 flex-col items-center justify-center border-b border-[#e8ebe5] p-6 text-center xl:border-r xl:border-b-0"><AlertCircle aria-hidden className="size-8 text-[#b42318]" /><p className="mt-3 font-medium text-[#912018]">목록을 불러오지 못했습니다</p><p className="mt-2 text-sm text-[#617068]">{state.message}</p><Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => onPage(page)}>다시 시도</Button></div>;
  if (state.status === "empty") return <div className="min-h-64 border-b border-[#e8ebe5] p-8 text-center text-sm text-[#617068] xl:border-r xl:border-b-0">조건에 맞는 {kind === "customer" ? "고객" : "프로젝트"}가 없습니다.</div>;
  return <div className="border-b border-[#e8ebe5] xl:border-r xl:border-b-0"><div className="max-h-[40rem] divide-y divide-[#edf0ea] overflow-y-auto">{state.items.map((item) => { const selected = item.id === selectedId; const project = kind === "project" ? item as AdminProjectListItem : undefined; const customer = kind === "customer" ? item as AdminCustomerListItem : undefined; return <button key={item.id} type="button" aria-current={selected ? "true" : undefined} onClick={() => onSelect(item)} className={`w-full px-5 py-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2e6f4f] ${selected ? "bg-[#edf4ef]" : "hover:bg-[#f7f8f5]"}`}><span className="block font-semibold">{item.name}</span><span className="mt-1 block text-xs text-[#617068]">{customer?.company_name || customer?.email || (project ? projectStatusLabels[project.status] : "연결 정보 없음")}</span>{project?.contract_amount != null ? <span className="mt-1 block text-xs text-[#617068]">계약금 {project.contract_amount.toLocaleString()}원</span> : null}</button>; })}</div><Pagination page={state.page} totalPages={state.totalPages} setPage={setPage} onPage={onPage} /></div>;
}

function Pagination({ page, totalPages, setPage, onPage }: Readonly<{ page: number; totalPages: number; setPage: (value: number) => void; onPage: (page: number) => void }>) { return <div className="flex items-center justify-between border-t border-[#edf0ea] p-3 text-xs text-[#617068]"><span>{page} / {Math.max(totalPages, 1)} 페이지</span><span className="flex gap-1"><Button type="button" variant="ghost" size="icon-sm" aria-label="이전 페이지" disabled={page <= 1} onClick={() => { setPage(page - 1); onPage(page - 1); }}><ChevronLeft aria-hidden /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label="다음 페이지" disabled={page >= totalPages} onClick={() => { setPage(page + 1); onPage(page + 1); }}><ChevronRight aria-hidden /></Button></span></div>; }

function CustomerEditor({ detail, onSaved, linkedProject, linkedProjectState, onProject }: Readonly<{ detail: DetailState<AdminCustomerDetail>; onSaved: (item: AdminCustomerDetail) => void; linkedProject?: AdminProjectDetail; linkedProjectState: LinkedState<AdminProjectDetail>; onProject?: () => void }>) { const [values, setValues] = useState<CustomerFormValues>(emptyCustomerForm); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({}); useEffect(() => { if (detail.status === "success") queueMicrotask(() => { setValues(customerToFormValues(detail.item)); setError(null); }); }, [detail]); if (detail.status === "loading" || detail.status === "idle") return <EditorShell title="고객 상세">{detail.status === "loading" ? <Loading /> : <EmptyEditor text="목록에서 고객을 선택해 주세요." />}</EditorShell>; if (detail.status === "error") return <EditorShell title="고객 상세"><ErrorText text={detail.message} /></EditorShell>; const item = detail.item; const save = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(null); setFieldErrors({}); try { const response = await fetch(`/api/admin/customers/${item.id}`, { method: "PATCH", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(buildCustomerPayload(values)) }); const result = await response.json() as ApiResponse<AdminCustomerDetail>; if (!response.ok || "error" in result) { if ("error" in result) { const failure = getSaveFailure(response.status, result, "고객"); setError(failure.message); setFieldErrors(failure.fieldErrors); } else setError("고객을 저장하지 못했습니다."); return; } onSaved(result.data); } catch { setError("네트워크 문제로 고객을 저장하지 못했습니다."); } finally { setSaving(false); } }; return <EditorShell title={values.name || "고객 상세"} notice={detail.notice}><form onSubmit={save} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="고객명" value={values.name} error={fieldErrors.name} onChange={(value) => setValues({ ...values, name: value })} required disabled={saving} /><Field label="회사명" value={values.companyName} error={fieldErrors.companyName} onChange={(value) => setValues({ ...values, companyName: value })} disabled={saving} /><Field label="이메일" type="email" value={values.email} error={fieldErrors.email} onChange={(value) => setValues({ ...values, email: value })} disabled={saving} /><Field label="전화번호" value={values.phone} error={fieldErrors.phone} onChange={(value) => setValues({ ...values, phone: value })} disabled={saving} /><Field label="웹사이트" value={values.websiteUrl} error={fieldErrors.websiteUrl} onChange={(value) => setValues({ ...values, websiteUrl: value })} disabled={saving} /></div><TextArea label="메모" value={values.memo} error={fieldErrors.memo} onChange={(value) => setValues({ ...values, memo: value })} disabled={saving} /><Links inquiryId={item.inquiry_id} project={linkedProject} projectState={linkedProjectState} onProject={onProject} /><Button type="submit" disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : null}변경사항 저장</Button>{error ? <p role="alert" className="text-sm text-[#912018]">{error}</p> : null}</form></EditorShell>; }

function ProjectEditor({ detail, onSaved, linkedCustomer, linkedCustomerState, onCustomer }: Readonly<{ detail: DetailState<AdminProjectDetail>; onSaved: (item: AdminProjectDetail) => void; linkedCustomer?: AdminCustomerDetail; linkedCustomerState: LinkedState<AdminCustomerDetail>; onCustomer?: () => void }>) { const [values, setValues] = useState<ProjectFormValues>(emptyProjectForm); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({}); useEffect(() => { if (detail.status === "success") queueMicrotask(() => { setValues(projectToFormValues(detail.item)); setError(null); }); }, [detail]); if (detail.status === "loading" || detail.status === "idle") return <EditorShell title="프로젝트 상세">{detail.status === "loading" ? <Loading /> : <EmptyEditor text="목록에서 프로젝트를 선택해 주세요." />}</EditorShell>; if (detail.status === "error") return <EditorShell title="프로젝트 상세"><ErrorText text={detail.message} /></EditorShell>; const item = detail.item; const save = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(null); setFieldErrors({}); try { const response = await fetch(`/api/admin/projects/${item.id}`, { method: "PATCH", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(buildProjectPayload(values)) }); const result = await response.json() as ApiResponse<AdminProjectDetail>; if (!response.ok || "error" in result) { if ("error" in result) { const failure = getSaveFailure(response.status, result, "프로젝트"); setError(failure.message); setFieldErrors(failure.fieldErrors); } else setError("프로젝트를 저장하지 못했습니다."); return; } onSaved(result.data); } catch { setError("네트워크 문제로 프로젝트를 저장하지 못했습니다."); } finally { setSaving(false); } }; return <EditorShell title={values.name || "프로젝트 상세"} notice={detail.notice}><form onSubmit={save} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="프로젝트명" value={values.name} error={fieldErrors.name} onChange={(value) => setValues({ ...values, name: value })} required disabled={saving} /><label className="grid gap-1 text-sm font-medium">상태<select value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value as ProjectStatus })} disabled={saving} className="h-9 rounded-md border border-[#d8d1c6] bg-white px-2 font-normal outline-none focus:border-[#2e6f4f]">{projectStatuses.map((status) => <option key={status} value={status}>{projectStatusLabels[status]}</option>)}</select></label><Field label="계약 금액" type="number" value={values.contractAmount} error={fieldErrors.contractAmount} onChange={(value) => setValues({ ...values, contractAmount: value })} disabled={saving} /><Field label="예상 시작일" type="date" value={values.expectedStartDate.slice(0, 10)} error={fieldErrors.expectedStartDate} onChange={(value) => setValues({ ...values, expectedStartDate: value })} disabled={saving} /><Field label="예상 출시일" type="date" value={values.expectedLaunchDate.slice(0, 10)} error={fieldErrors.expectedLaunchDate} onChange={(value) => setValues({ ...values, expectedLaunchDate: value })} disabled={saving} /><Field label="출시일" type="datetime-local" value={values.launchedAt ? values.launchedAt.slice(0, 16) : ""} error={fieldErrors.launchedAt} onChange={(value) => setValues({ ...values, launchedAt: value })} disabled={saving} /></div><TextArea label="설명" value={values.description} error={fieldErrors.description} onChange={(value) => setValues({ ...values, description: value })} disabled={saving} /><TextArea label="메모" value={values.memo} error={fieldErrors.memo} onChange={(value) => setValues({ ...values, memo: value })} disabled={saving} /><Links customer={linkedCustomer} customerState={linkedCustomerState} onCustomer={onCustomer} inquiryId={item.inquiry_id} /><Button type="submit" disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : null}변경사항 저장</Button>{error ? <p role="alert" className="text-sm text-[#912018]">{error}</p> : null}</form></EditorShell>; }

function EditorShell({ title, notice, children }: Readonly<{ title: string; notice?: string; children: React.ReactNode }>) { return <div className="p-5 sm:p-6"><h3 className="text-xl font-semibold">{title}</h3>{notice ? <div role="status" className="mt-4 flex gap-2 rounded-md bg-[#edf7f0] p-3 text-sm text-[#23583f]"><CheckCircle2 aria-hidden className="size-4" />{notice}</div> : null}<div className="mt-5">{children}</div></div>; }
function Loading() { return <div role="status" className="flex min-h-48 items-center gap-2 text-sm text-[#617068]"><Loader2 aria-hidden className="size-5 animate-spin" />상세 정보를 불러오는 중입니다.</div>; }
function EmptyEditor({ text }: Readonly<{ text: string }>) { return <p className="py-12 text-sm text-[#617068]">{text}</p>; }
function ErrorText({ text }: Readonly<{ text: string }>) { return <div role="alert" className="flex gap-2 rounded-md bg-[#fff1ee] p-3 text-sm text-[#912018]"><AlertCircle aria-hidden className="size-4" />{text}</div>; }
function Field({ label, value, onChange, error, type = "text", required, disabled }: Readonly<{ label: string; value: string; onChange: (value: string) => void; error?: string[]; type?: string; required?: boolean; disabled?: boolean }>) { return <label className="grid gap-1 text-sm font-medium">{label}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="h-9 rounded-md border border-[#d8d1c6] px-2 font-normal outline-none focus:border-[#2e6f4f] disabled:bg-[#f5f6f3]" />{error?.map((message) => <span key={message} className="text-xs font-normal text-[#912018]">{message}</span>)}</label>; }
function TextArea({ label, value, onChange, error, disabled }: Readonly<{ label: string; value: string; onChange: (value: string) => void; error?: string[]; disabled?: boolean }>) { return <label className="grid gap-1 text-sm font-medium">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={4} className="rounded-md border border-[#d8d1c6] p-2 font-normal outline-none focus:border-[#2e6f4f] disabled:bg-[#f5f6f3]" />{error?.map((message) => <span key={message} className="text-xs font-normal text-[#912018]">{message}</span>)}</label>; }
function Links({ inquiryId, customer, project, customerState, projectState, onCustomer, onProject }: Readonly<{ inquiryId?: string | null; customer?: AdminCustomerDetail; project?: AdminProjectDetail; customerState?: LinkedState<AdminCustomerDetail>; projectState?: LinkedState<AdminProjectDetail>; onCustomer?: () => void; onProject?: () => void }>) {
  return <div className="flex flex-wrap items-center gap-2 text-xs text-[#617068]">
    {inquiryId ? <span className="rounded bg-[#f5f6f3] px-2 py-1">문의 연결: {inquiryId}</span> : null}
    {customer ? <Button type="button" variant="outline" size="xs" onClick={onCustomer}>연결 고객: {customer.name}</Button> : null}
    {project ? <Button type="button" variant="outline" size="xs" onClick={onProject}>연결 프로젝트: {project.name}</Button> : null}
    {customerState?.status === "loading" ? <span role="status">연결 고객을 불러오는 중입니다.</span> : null}
    {projectState?.status === "loading" ? <span role="status">연결 프로젝트를 불러오는 중입니다.</span> : null}
    {customerState?.status === "error" ? <span role="alert" className="text-[#912018]">{customerState.message}</span> : null}
    {projectState?.status === "error" ? <span role="alert" className="text-[#912018]">{projectState.message}</span> : null}
  </div>;
}
