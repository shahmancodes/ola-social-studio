import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/platform-auth';
import { companiesForUser } from '@/lib/platform';
import { AppFrame } from '@/components/app-frame';
import { ProductVideoStudio } from '@/components/product-video-studio';
export default async function VideosPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await currentUser(); if (!user) redirect('/login');
  const companies = companiesForUser(user.id); const requested = (await searchParams).company;
  const company = companies.find(c => c.id === requested) ?? companies[0];
  if (!company) redirect('/companies/new');
  return <AppFrame companyId={company.id}><ProductVideoStudio key={company.id} companyId={company.id} companyName={company.name} /></AppFrame>;
}
