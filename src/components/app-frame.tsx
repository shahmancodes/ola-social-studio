import { redirect } from "next/navigation";
import { currentUser } from "@/lib/platform-auth";
import { companiesForUser } from "@/lib/platform";
import { WorkspaceShell } from "./workspace-shell";
import type { ReactNode } from "react";

export async function AppFrame({ children, companyId }: { children: ReactNode; companyId?: string }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const companies = companiesForUser(user.id);
  const selected = companyId ? companies.find((company) => company.id === companyId) : companies[0];
  if (companyId && !selected) redirect("/workspace");
  return <WorkspaceShell email={user.email} displayName={user.display_name} companyId={selected?.id} companies={companies.map((company) => ({ id: company.id, name: company.name, onboardingStep: company.onboarding_step, logoAssetId: (JSON.parse(company.brand_json) as { logoAssetId?: string | null }).logoAssetId ?? null }))}>{children}</WorkspaceShell>;
}
