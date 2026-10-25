import { notFound } from "next/navigation";
import { requireProjectAccess } from "@/lib/platform-auth";
import { projectRow } from "@/lib/platform-db";
import { SimpleEditor } from "@/components/simple-editor";
import { DesignWorkspace } from "@/components/design-workspace";
import { AppFrame } from "@/components/app-frame";
import { IntakeWorkspace } from "@/components/intake-workspace";
import { requestSnapshot } from "@/lib/request-workspace";
export const dynamic = "force-dynamic";
export default async function ContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireProjectAccess(id);
    const row = projectRow(id);
    if (!row || (row.content_type === "carousel" && !row.artifact_json)) notFound();
    if (!["complete", "needs-review", "failed", "stopped"].includes(row.status) && !(row.status === "qa" && row.artifact_json)) {
      return <AppFrame companyId={row.company_id}><IntakeWorkspace projectId={id} initialSnapshot={await requestSnapshot(id)} /></AppFrame>;
    }
    // Database rows can have a non-plain prototype; client component props cannot.
    const initialRow = {
      id: row.id,
      company_id: row.company_id,
      brief: row.brief,
      status: row.status,
      version: row.version,
      content_type: row.content_type,
      artifact_json: row.artifact_json,
      brand_snapshot_json: row.brand_snapshot_json,
    };
    return <AppFrame companyId={row.company_id}>{row.content_type === "design" ? <DesignWorkspace initialRow={initialRow} /> : <SimpleEditor initialRow={initialRow} />}</AppFrame>;
  }
  catch { notFound(); }
}
