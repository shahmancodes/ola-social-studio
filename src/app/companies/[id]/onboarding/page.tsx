import { redirect } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { CompanyOnboarding } from "@/components/company-onboarding";
import { canvaConfigured, canvaConnected } from "@/lib/canva";
import { requireMembership } from "@/lib/platform-auth";
import { getBrand, getCompany } from "@/lib/platform";

export default async function CompanyOnboardingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string; canva?: string; canvaError?: string }> }) {
  const { id } = await params;
  const { user } = await requireMembership(id, "admin").catch(() => redirect("/workspace"));
  const company = getCompany(id);
  if (!company) redirect("/workspace");
  const query = await searchParams;
  const requested = Number(query.step);
  const initialStep = Number.isInteger(requested) && requested >= 1 && requested <= 4 ? requested : Math.min(company.onboarding_step, 4);
  return <AppFrame companyId={id}><CompanyOnboarding companyId={id} initialName={company.name} initialBrand={getBrand(id)} initialStep={initialStep} canvaConfigured={canvaConfigured()} canvaConnected={canvaConnected(id, user.id)} canvaJustConnected={query.canva === "connected"} canvaError={query.canvaError} /></AppFrame>;
}
