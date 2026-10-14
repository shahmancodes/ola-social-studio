import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/platform-auth";
import { getBrand, getCompany } from "@/lib/platform";
import { CompanySettings } from "@/components/company-settings";
import { AppFrame } from "@/components/app-frame";
export default async function CompanySettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const tab = (await searchParams).tab;
  const activeTab = tab === "assets" || tab === "details" ? tab : "guide";
  try { const { role } = await requireMembership(id); return <AppFrame companyId={id}><CompanySettings key={activeTab} companyId={id} companyName={getCompany(id)!.name} initial={getBrand(id)} canAdmin={role !== "member"} tab={activeTab} /></AppFrame>; }
  catch { notFound(); }
}
