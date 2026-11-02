"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import {
  adminProjectDocumentQueryKeys,
  fetchAdminProjectDocument,
  generateAdminProjectDocument,
  type AdminProjectDocumentGenerationInput,
  type ProjectDocumentKind,
} from "@/entities/document";
import { Button } from "@/shared/ui/button";
import {
  buildAdminDocumentGenerationInput,
  getAdminDocumentPollingInterval,
  getAdminDocumentQueryWarning,
} from "../model/admin-project-document-state";

const documentKinds: Array<{ value: ProjectDocumentKind; label: string }> = [
  { value: "proposal", label: "제안서" },
  { value: "contract", label: "계약서" },
];

export function AdminProjectDocuments({ projectId }: Readonly<{ projectId: string }>) {
  const [type, setType] = useState<ProjectDocumentKind>("proposal");
  const queryClient = useQueryClient();
  const documentKey = adminProjectDocumentQueryKeys.detail(projectId, type);
  const query = useQuery({
    queryKey: documentKey,
    queryFn: () => fetchAdminProjectDocument(projectId, type),
    refetchInterval: (query) => getAdminDocumentPollingInterval(query),
  });
  const generation = useMutation({
    mutationFn: (input: AdminProjectDocumentGenerationInput) => generateAdminProjectDocument(projectId, input),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: documentKey });
    },
  });

  const document = query.data?.document;
  const latestJob = query.data?.jobs[0];
  const isProcessing = query.data?.jobs.some((job) => job.status === "processing") ?? false;
  const warning = getAdminDocumentQueryWarning(Boolean(query.data), query.error);

  const generate = (retryFailedJob: boolean) => {
    if (generation.isPending || isProcessing) return;
    const input = buildAdminDocumentGenerationInput(type, retryFailedJob ? latestJob : undefined);
    generation.mutate(input);
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
        <p className="mt-1 break-all text-sm text-[var(--admin-muted)]">프로젝트 ID: {projectId}</p>
      </div>
    </header>

    <div role="tablist" aria-label="문서 종류" className="mb-5 flex flex-wrap gap-2 border-b border-[var(--admin-border)]">
      {documentKinds.map((kind) => <button
        key={kind.value}
        type="button"
        role="tab"
        aria-selected={type === kind.value}
        onClick={() => setType(kind.value)}
        className={`min-h-11 border-b-2 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6f4f] ${type === kind.value ? "border-[#2e6f4f] text-[#2e6f4f]" : "border-transparent text-[var(--admin-muted)]"}`}
      >{kind.label}</button>)}
    </div>

    {warning ? <p role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">{warning}</p> : null}
    {generation.isError ? <p role="alert" className="mb-4 text-sm text-[#912018]">요청을 처리하지 못했습니다. 작업 상태를 다시 확인해 주세요.</p> : null}

    <section aria-label={`${type === "proposal" ? "제안서" : "계약서"} 문서 작업`} aria-busy={query.isFetching || generation.isPending} className="min-w-0 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 sm:p-6">
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
      </div> : document.content ? <div className="mt-6 min-w-0 space-y-4">
        <h2 className="break-words text-lg font-semibold">{document.content.title}</h2>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{document.content.summary}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {document.content.scopeItems.map((item, index) => <li key={`${index}-${item.slice(0, 24)}`} className="break-words">{item}</li>)}
        </ul>
      </div> : <div className="mt-6 py-4 text-sm text-[var(--admin-muted)]">
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
  </main>;
}
