import { redirect } from "next/navigation";
import { currentUser } from "@/lib/platform-auth";
import { companiesForUser } from "@/lib/platform";
import { SimpleCreateForm } from "@/components/simple-create-form";
import { AppFrame } from "@/components/app-frame";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const companies = companiesForUser(user.id);
  const requestedCompany = (await searchParams).company;
  const selected = companies.find((company) => company.id === requestedCompany) ?? companies[0];
  const brand = selected ? JSON.parse(selected.brand_json) as { audience?: string; voice?: string } : null;
  return <AppFrame companyId={selected?.id}><main className="grid min-h-[calc(100dvh-64px)] place-items-center px-5 py-12 sm:px-8">
    <div className="w-full max-w-3xl">
      <PageHeader className="justify-center text-center" eyebrow="New creative" title="Make a Story, carousel or poster." description="Start with a free-text brief. Add the audience, key message, and confirmed facts Ola should use." />
      {selected ? <SimpleCreateForm key={selected.id} companyId={selected.id} companyName={selected.name} brandAudience={brand?.audience} brandTone={brand?.voice} /> : <Card className="items-center px-6 text-center shadow-none"><p className="text-sm text-muted-foreground">Create a company to get started, or ask a company owner for an invitation.</p><Button asChild><Link href="/companies/new">Set up a company</Link></Button></Card>}
    </div>
  </main></AppFrame>;
}
