import { AdminCustomerProjectManager } from "@/widgets/admin-customer-projects";
import { projectIdSchema } from "@/entities/project";

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const requestedProject = (await searchParams).project;
  const parsedProject = typeof requestedProject === "string" ? projectIdSchema.safeParse(requestedProject) : undefined;
  const initialProjectId = parsedProject?.success ? parsedProject.data : undefined;

  return <AdminCustomerProjectManager initialTab="projects" initialProjectId={initialProjectId} />;
}
