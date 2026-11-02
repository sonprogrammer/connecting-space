import Link from "next/link";
import { projectIdSchema } from "@/entities/project";
import { AdminProjectDocuments } from "@/widgets/admin-project-documents";

export default async function AdminProjectDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parsed = projectIdSchema.safeParse(id);

  if (!parsed.success) {
    return <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold text-[var(--admin-text)]">프로젝트 문서</h1>
      <p role="alert" className="mt-3 text-sm text-[#912018]">올바르지 않은 프로젝트 주소입니다.</p>
      <Link href="/admin/projects" className="mt-4 inline-flex min-h-10 items-center rounded-md border border-[var(--admin-border)] px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2e6f4f]">
        프로젝트 목록으로 돌아가기
      </Link>
    </main>;
  }

  return <AdminProjectDocuments projectId={parsed.data} />;
}
