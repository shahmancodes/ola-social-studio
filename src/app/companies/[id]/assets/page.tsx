import { notFound, redirect } from "next/navigation";
import { requireMembership } from "@/lib/platform-auth";

export default async function CompanyAssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireMembership(id);
  } catch { notFound(); }
  redirect(`/companies/${id}/settings?tab=assets`);
}
