import { redirect } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { currentUser } from "@/lib/platform-auth";
import { companiesForUser, listCompanyProjects } from "@/lib/platform";
import { db } from "@/lib/platform-db";
import { ProjectsLibrary, type LibraryProject } from "./projects-library";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const companies = companiesForUser(user.id);
  const companyId = (await searchParams).company;
  const selected = companies.find((company) => company.id === companyId) ?? companies[0];
  const rows = selected ? listCompanyProjects(selected.id) : [];
  const requestIds = selected ? new Set((db().prepare("SELECT e.project_id FROM workflow_events e JOIN projects p ON p.id=e.project_id WHERE p.company_id=? AND e.kind='request-created'").all(selected.id) as Array<{ project_id: string }>).map((item) => item.project_id)) : new Set<string>();
  const items: LibraryProject[] = rows.map((row) => {
    const artifact = row.artifact_json ? JSON.parse(row.artifact_json) as { type?: string; title?: string; headline?: string; slides?: unknown[]; designVersion?: number } : null;
    const title = artifact?.title ?? artifact?.headline ?? (row.brief.trim().slice(0, 72) || "Untitled project");
    return {
      id: row.id,
      title,
      brief: row.brief,
      contentType: row.content_type,
      status: row.status,
      statusLabel: row.status.replaceAll(/[-_]/g, " "),
      updatedAt: row.updated_at,
      destination: artifact?.type && ["complete", "needs-review", "failed", "stopped"].includes(row.status) ? `/content/${row.id}` : requestIds.has(row.id) || row.content_type === "intake" ? `/intake/${row.id}` : `/content/${row.id}`,
      preview: ["story", "carousel", "poster"].includes(row.content_type) && ["complete", "needs-review"].includes(row.status)
        ? `/api/content/${row.id}/preview?slide=1` : null,
      slideCount: artifact?.slides?.length ?? (row.content_type === "story" ? 1 : 0),
      pipelineHref: null,
    };
  });
  return <AppFrame companyId={selected?.id}><ProjectsLibrary companyId={selected?.id} items={items} /></AppFrame>;
}
