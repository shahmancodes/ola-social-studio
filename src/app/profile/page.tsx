import { redirect } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { ProfileSettings } from "@/components/profile-settings";
import { currentUser } from "@/lib/platform-auth";
import { companiesForUser, pendingInvitationsForCompany, teamForCompany } from "@/lib/platform";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ company?: string; tab?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const companies = companiesForUser(user.id);
  const selected = companies.find((company) => company.id === params.company) ?? companies[0];
  const activeTab = params.tab === "team" ? "team" : "general";
  const company = selected ? { id: selected.id, name: selected.name, role: selected.role } : null;

  return <AppFrame companyId={selected?.id}>
    <ProfileSettings
      key={`${selected?.id ?? "none"}-${activeTab}`}
      activeTab={activeTab}
      userId={user.id}
      email={user.email}
      displayName={user.display_name}
      company={company}
      members={selected ? teamForCompany(selected.id) : []}
      pendingInvitations={selected && selected.role !== "member" ? pendingInvitationsForCompany(selected.id) : []}
    />
  </AppFrame>;
}
