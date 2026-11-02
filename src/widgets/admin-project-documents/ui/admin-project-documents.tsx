"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  AdminDocumentQueryError,
  adminProjectDocumentQueryKeys,
  fetchAdminProjectDocument,
  fetchAdminProjectDocumentVersion,
  generateAdminProjectDocument,
  saveAdminProjectDocument,
  type AdminProjectDocumentSaveInput,
  type AdminProjectDocumentGenerationInput,
  type AdminProjectDocumentResponse,
  type AdminProjectDocumentVersion,
  type ProjectDocumentKind,
} from "@/entities/document";
import {
  customerProjectQueryKeys,
  fetchProjectDetail,
} from "@/widgets/admin-customer-projects/model/admin-customer-project-queries";
import { Button } from "@/shared/ui/button";
import {
  buildAdminDocumentGenerationInput,
  buildAdminDocumentCopyText,
  collectAdminDocumentVersions,
  getAdminDocumentPollingInterval,
  getAdminDocumentQueryWarning,
  getAdminDocumentSaveErrorMessage,
  isAdminDocumentEditorDirty,
  rebaseAdminDocumentEditor,
  reconcileAdminDocumentEditor,
  type AdminDocumentEditorState,
} from "../model/admin-project-document-state";

const documentKinds: Array<{ value: ProjectDocumentKind; label: string }> = [
  { value: "proposal", label: "제안서" },
  { value: "contract", label: "계약서" },
];

export function AdminProjectDocuments({ projectId }: Readonly<{ projectId: string }>) {
  const [type, setType] = useState<ProjectDocumentKind>("proposal");
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [editors, setEditors] = useState<Partial<Record<ProjectDocumentKind, AdminDocumentEditorState>>>({});
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const documentKey = adminProjectDocumentQueryKeys.detail(projectId, type, historyPage);
  const query = useQuery({
    queryKey: documentKey,
    queryFn: () => fetchAdminProjectDocument(projectId, type, historyPage),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => getAdminDocumentPollingInterval(query),
  });
  const projectQuery = useQuery({
    queryKey: customerProjectQueryKeys.projects.detail(projectId),
    queryFn: () => fetchProjectDetail(projectId),
  });
  const versionQuery = useQuery<AdminProjectDocumentVersion>({
    queryKey: adminProjectDocumentQueryKeys.version(projectId, type, selectedVersion ?? 0),
    queryFn: () => fetchAdminProjectDocumentVersion(projectId, type, selectedVersion as number),
    enabled: selectedVersion !== null,
  });
  const generation = useMutation({
    mutationFn: (input: AdminProjectDocumentGenerationInput) => generateAdminProjectDocument(projectId, input),
    onSettled: async (_result, _error, input) => {
      await queryClient.invalidateQueries({
        queryKey: adminProjectDocumentQueryKeys.project(projectId, input.type),
      });
    },
  });
  const save = useMutation({
    mutationFn: (input: AdminProjectDocumentSaveInput) => saveAdminProjectDocument(projectId, input),
    onSuccess: (saved, input) => {
      const narrative = {
        title: saved.content.title,
        summary: saved.content.summary,
        scopeItems: [...saved.content.scopeItems],
      };
      setEditors((current) => ({
        ...current,
        [input.type]: { baseRevision: saved.version, base: narrative, value: narrative },
      }));
      setSaveNotice("변경사항을 저장했습니다.");
    },
    onSettled: async (_saved, _error, input) => {
      await queryClient.invalidateQueries({
        queryKey: adminProjectDocumentQueryKeys.project(projectId, input.type),
      });
    },
  });

  const document = query.data?.document;
  const historyVersions = collectAdminDocumentVersions(Array.from({ length: historyPage }, (_, index) =>
    queryClient.getQueryData<AdminProjectDocumentResponse>(
      adminProjectDocumentQueryKeys.detail(projectId, type, index + 1),
    ),
  ));
  const editor = reconcileAdminDocumentEditor(editors[type] ?? null, document);
  const editorDirty = Boolean(editor && isAdminDocumentEditorDirty(editor));
  const latestJob = query.data?.jobs[0];
  const isProcessing = query.data?.jobs.some((job) => job.status === "processing") ?? false;
  const warning = getAdminDocumentQueryWarning(Boolean(query.data), query.error);

  const generate = (retryFailedJob: boolean) => {
    if (generation.isPending || isProcessing) return;
    const input = buildAdminDocumentGenerationInput(type, retryFailedJob ? latestJob : undefined);
    generation.mutate(input);
  };

  const updateEditor = (update: (value: NonNullable<typeof editor>["value"]) => NonNullable<typeof editor>["value"]) => {
    if (!editor) return;
    setEditors((current) => ({ ...current, [type]: { ...editor, value: update(editor.value) } }));
    setCopyNotice(null);
    setSaveNotice(null);
    save.reset();
  };

  const saveDocument = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!document?.content || !editor || !editorDirty || save.isPending) return;
    save.mutate({
      type,
      requestKey: crypto.randomUUID(),
      expectedRevision: editor.baseRevision,
      content: editor.value,
    });
  };

  const copyDocument = async () => {
    if (!document?.content || !editor) return;
    try {
      await navigator.clipboard.writeText(buildAdminDocumentCopyText({ ...document.content, ...editor.value }));
      setCopyNotice("현재 문서 내용과 검토 안내를 복사했습니다.");
    } catch {
      setCopyNotice("복사하지 못했습니다. 브라우저 권한을 확인해 주세요.");
    }
  };

  const revisionConflict = save.error instanceof AdminDocumentQueryError && save.error.status === 409;
  const rebaseDraft = () => {
    if (!editor || !document) return;
    setEditors((current) => ({ ...current, [type]: rebaseAdminDocumentEditor(editor, document) }));
    save.reset();
  };

  if (query.isPending && !query.data) {
    return <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" aria-busy="true" aria-live="polite">
      <p className="text-sm text-[var(--admin-muted)]">문서 정보를 불러오는 중입니다.</p>
    </main>;
  }

  if (query.isError && !query.data) {
    return <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold text-[var(--admin-text)]">제안서·계약서 초안</h1>
      <p role="alert" className="mt-4 text-sm text-[#912018]">{getAdminDocumentQueryWarning(false, query.error) ?? "문서 정보를 불러오지 못했습니다."}</p>
      <Button type="button" className="mt-4" onClick={() => void query.refetch()}>
        <RefreshCw className="size-4" aria-hidden="true" /> 다시 시도
      </Button>
    </main>;
  }

  return <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 text-[var(--admin-text)] sm:px-6 sm:py-8">
    <header className="mb-6 flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Link href={`/admin/projects?project=${encodeURIComponent(projectId)}`} className="text-sm font-medium text-[var(--admin-muted)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6f4f]">
          프로젝트 상세로 돌아가기
        </Link>
        <h1 className="mt-2 text-xl font-semibold sm:text-2xl">제안서·계약서 초안</h1>
        <p className="mt-1 break-words text-sm text-[var(--admin-muted)]">프로젝트: {projectQuery.data?.name ?? projectId}</p>
        {projectQuery.isError ? <p role="status" className="mt-1 text-sm text-amber-800">프로젝트 이름을 불러오지 못했습니다.</p> : null}
      </div>
    </header>

    <div role="tablist" aria-label="문서 종류" className="mb-5 flex flex-wrap gap-2 border-b border-[var(--admin-border)]">
      {documentKinds.map((kind) => <button
        key={kind.value}
        type="button"
        role="tab"
        id={`document-tab-${kind.value}`}
        aria-controls="document-panel"
        aria-selected={type === kind.value}
        onClick={() => { setType(kind.value); setSelectedVersion(null); setHistoryPage(1); save.reset(); generation.reset(); }}
        className={`min-h-11 border-b-2 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6f4f] ${type === kind.value ? "border-[#2e6f4f] text-[#2e6f4f]" : "border-transparent text-[var(--admin-muted)]"}`}
      >{kind.label}</button>)}
    </div>

    {warning ? <p role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">{warning}</p> : null}
    {generation.isError ? <p role="alert" className="mb-4 text-sm text-[#912018]">요청을 처리하지 못했습니다. 작업 상태를 다시 확인해 주세요.</p> : null}
    {save.isError ? <div role="alert" className="mb-4 rounded-md border border-[#e7b3ad] bg-[#fff4f2] p-3 text-sm text-[#912018]">
      <p>{getAdminDocumentSaveErrorMessage(save.error)}</p>
      {revisionConflict && document && editor ? <div className="mt-3 grid gap-2">
        <details className="min-w-0 rounded-md bg-white p-3">
          <summary className="cursor-pointer font-medium">서버 최신 revision {document.revision} 내용 확인</summary>
          {document.content ? <div className="mt-2 space-y-2 break-words text-[var(--admin-text)]">
            <p className="font-semibold">{document.content.title}</p>
            <p className="whitespace-pre-wrap">{document.content.summary}</p>
            <ul className="list-disc pl-5">{document.content.scopeItems.map((item, index) => <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>)}</ul>
          </div> : <p className="mt-2 text-[var(--admin-muted)]">서버에 저장된 편집 본문이 없습니다.</p>}
        </details>
        <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={rebaseDraft}>
          내 수정 내용을 최신 revision에 다시 적용
        </Button>
      </div> : null}
    </div> : null}

    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
    <section id="document-panel" role="tabpanel" aria-labelledby={`document-tab-${type}`} aria-label={`${type === "proposal" ? "제안서" : "계약서"} 문서 작업`} aria-busy={query.isFetching || generation.isPending} className="min-w-0 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 sm:p-6">
      {isProcessing ? <div role="status" className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        생성 작업이 진행 중입니다. 잠시 후 상태를 다시 확인합니다.
      </div> : null}

      {!isProcessing && latestJob?.status === "failed" ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="text-sm text-amber-950">최근 초안 생성이 완료되지 않았습니다. 실패한 요청을 다시 시도하거나 새 요청을 시작할 수 있습니다.</p>
        <Button type="button" size="sm" disabled={generation.isPending} onClick={() => generate(true)}>
          {generation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} 실패 작업 재시도
        </Button>
      </div> : null}

      {!isProcessing ? <Button type="button" disabled={generation.isPending} onClick={() => generate(false)}>
        {generation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {document?.content ? "새 초안 생성" : "초안 생성"}
      </Button> : null}

      {!document ? <div className="py-8 text-sm text-[var(--admin-muted)]">
        <p>아직 저장된 문서 초안이 없습니다.</p>
      </div> : document.content && editor ? <form onSubmit={saveDocument} aria-busy={save.isPending} className="mt-6 min-w-0 space-y-5">
        <div className="grid min-w-0 gap-2">
          <label htmlFor="document-title" className="text-sm font-semibold">제목</label>
          <input id="document-title" aria-label="제목" value={editor.value.title} maxLength={160} required disabled={save.isPending} onChange={(event) => updateEditor((value) => ({ ...value, title: event.target.value }))} className="h-11 min-w-0 w-full rounded-md border border-[var(--admin-border)] bg-white px-3 text-sm text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6f4f]" />
        </div>
        <div className="grid min-w-0 gap-2">
          <label htmlFor="document-summary" className="text-sm font-semibold">요약</label>
          <textarea id="document-summary" aria-label="요약" value={editor.value.summary} maxLength={5000} required disabled={save.isPending} onChange={(event) => updateEditor((value) => ({ ...value, summary: event.target.value }))} rows={7} className="min-h-36 min-w-0 w-full rounded-md border border-[var(--admin-border)] bg-white px-3 py-2 text-sm leading-6 text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6f4f]" />
        </div>
        <fieldset className="min-w-0 space-y-3">
          <legend className="text-sm font-semibold">범위 항목</legend>
          {editor.value.scopeItems.map((item, index) => <div key={`scope-${index}`} className="flex min-w-0 flex-wrap items-start gap-2">
            <label htmlFor={`document-scope-${index}`} className="sr-only">범위 항목 {index + 1}</label>
            <input id={`document-scope-${index}`} aria-label={`범위 항목 ${index + 1}`} value={item} maxLength={500} required disabled={save.isPending} onChange={(event) => updateEditor((value) => ({ ...value, scopeItems: value.scopeItems.map((scope, scopeIndex) => scopeIndex === index ? event.target.value : scope) }))} className="h-11 min-w-0 flex-1 basis-52 rounded-md border border-[var(--admin-border)] bg-white px-3 text-sm text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6f4f]" />
            <Button type="button" size="icon" variant="outline" aria-label={`범위 항목 ${index + 1} 삭제`} disabled={save.isPending || editor.value.scopeItems.length <= 1} onClick={() => updateEditor((value) => ({ ...value, scopeItems: value.scopeItems.filter((_, scopeIndex) => scopeIndex !== index) }))}>
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>)}
          <Button type="button" size="sm" variant="outline" disabled={save.isPending || editor.value.scopeItems.length >= 40} onClick={() => updateEditor((value) => ({ ...value, scopeItems: [...value.scopeItems, ""] }))}>
            <Plus className="size-4" aria-hidden="true" /> 범위 항목 추가
          </Button>
        </fieldset>
        <div className="flex min-w-0 flex-wrap gap-2 border-t border-[var(--admin-border)] pt-4">
          <Button type="submit" disabled={save.isPending || !editorDirty}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} 변경사항 저장
          </Button>
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => void copyDocument()}>
            <Clipboard className="size-4" aria-hidden="true" /> 현재 내용 복사
          </Button>
          {editorDirty ? <span role="status" className="self-center text-sm text-[var(--admin-muted)]">저장되지 않은 수정이 있습니다.</span> : null}
          {saveNotice ? <span role="status" className="self-center text-sm text-[var(--admin-muted)]">{saveNotice}</span> : null}
          {copyNotice ? <span role="status" className="self-center text-sm text-[var(--admin-muted)]">{copyNotice}</span> : null}
        </div>
      </form> : <div className="mt-6 py-4 text-sm text-[var(--admin-muted)]">
        <p>저장된 본문은 없으며 생성 작업을 확인하고 있습니다.</p>
      </div>}

      {document?.content?.reviewOnly ? <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{document.content.reviewNotice}</p> : null}
      {document?.content?.needsConfirmation.map((item) => <p key={item.category} className="mt-2 text-sm text-[var(--admin-muted)]">확인 필요: {item.question}</p>)}

      {generation.isPending ? <p className="mt-3 text-sm text-[var(--admin-muted)]" role="status">초안 생성 요청을 보내는 중입니다.</p> : null}
      {query.isFetching ? <span className="sr-only" role="status">문서 상태를 새로 확인하는 중입니다.</span> : null}
      {query.isError && query.data ? <Button type="button" variant="outline" className="mt-4" onClick={() => void query.refetch()}>다시 불러오기</Button> : null}
      {document ? <p className="mt-4 text-xs text-[var(--admin-muted)]">현재 revision: {document.revision} · 버전 수: {document.version_count}</p> : null}
      {latestJob?.history.at(-1)?.model ? <p className="mt-2 text-xs text-[var(--admin-muted)]">생성 모델: {latestJob.history.at(-1)?.model}</p> : null}
      <div className="sr-only" aria-live="polite">{generation.isSuccess ? "초안 생성 응답을 받았습니다." : ""}</div>
    </section>

    <aside aria-label="이전 버전 이력" className="min-w-0 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">이전 버전</h2>
        <span className="text-xs text-[var(--admin-muted)]">{query.data?.pagination.total ?? 0}개</span>
      </div>
      {!historyVersions.length ? <p className="mt-4 text-sm text-[var(--admin-muted)]">아직 저장된 이전 버전이 없습니다.</p> : <ol className="mt-4 grid min-w-0 gap-2">
        {historyVersions.map((version) => <li key={`${version.document_id}-${version.version}`} className="min-w-0">
          <button
            type="button"
            aria-pressed={selectedVersion === version.version}
            onClick={() => setSelectedVersion(version.version)}
            className={`flex min-h-11 w-full min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6f4f] ${selectedVersion === version.version ? "border-[#2e6f4f] bg-[#eff7f1]" : "border-[var(--admin-border)] hover:bg-[var(--admin-hover)]"}`}
          >
            <span className="font-medium">버전 {version.version} · {version.source === "generated" ? "생성 초안" : "직접 저장"}</span>
            <time dateTime={version.created_at} className="text-xs text-[var(--admin-muted)]">{new Date(version.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>
          </button>
        </li>)}
      </ol>}
      {query.data && query.data.pagination.total > historyPage * query.data.pagination.pageSize ? <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setHistoryPage((page) => page + 1)}>이전 버전 더 보기</Button> : null}
      {selectedVersion !== null ? <section aria-label={`버전 ${selectedVersion} 읽기 전용 보기`} className="mt-5 min-w-0 border-t border-[var(--admin-border)] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">버전 {selectedVersion} <span className="font-normal text-[var(--admin-muted)]">· 읽기 전용</span></h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedVersion(null)}>닫기</Button>
        </div>
        {versionQuery.isPending ? <p role="status" className="mt-3 text-sm text-[var(--admin-muted)]">이전 버전을 불러오는 중입니다.</p> : null}
        {versionQuery.isError ? <div className="mt-3">
          <p role="alert" className="text-sm text-[#912018]">{getAdminDocumentQueryWarning(false, versionQuery.error) ?? "이전 버전을 불러오지 못했습니다."}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void versionQuery.refetch()}>다시 시도</Button>
        </div> : null}
        {versionQuery.data ? <div aria-readonly="true" className="mt-3 min-w-0 space-y-3 text-sm">
          <p className="break-words font-semibold">{versionQuery.data.content.title}</p>
          <p className="whitespace-pre-wrap break-words leading-6">{versionQuery.data.content.summary}</p>
          <ul className="list-disc space-y-1 pl-5">{versionQuery.data.content.scopeItems.map((item, index) => <li key={`${index}-${item.slice(0, 24)}`} className="break-words">{item}</li>)}</ul>
          {versionQuery.data.content.reviewOnly ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">{versionQuery.data.content.reviewNotice}</p> : null}
          {versionQuery.data.content.needsConfirmation.map((item) => <p key={item.category} className="text-[var(--admin-muted)]">확인 필요: {item.question}</p>)}
          <p className="text-xs text-[var(--admin-muted)]">{versionQuery.data.source === "generated" ? "생성 초안" : "직접 저장"} · {new Date(versionQuery.data.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
        </div> : null}
      </section> : null}
    </aside>
    </div>
  </main>;
}
