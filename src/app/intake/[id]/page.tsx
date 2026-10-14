import { notFound } from "next/navigation";
import { requireProjectAccess } from "@/lib/platform-auth";
import { projectRow } from "@/lib/platform-db";
import { AppFrame } from "@/components/app-frame";
import { IntakeWorkspace } from "@/components/intake-workspace";
import { requestSnapshot } from "@/lib/request-workspace";

export const dynamic = "force-dynamic";
export default async function IntakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireProjectAccess(id);
    const row = projectRow(id); if (!row) notFound();
    const initialSnapshot = await requestSnapshot(id);
    return <AppFrame companyId={row.company_id}><IntakeWorkspace projectId={id} initialSnapshot={initialSnapshot} /></AppFrame>;
  } catch { notFound(); }
}
