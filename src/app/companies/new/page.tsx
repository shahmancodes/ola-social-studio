import { redirect } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { CompanyOnboarding } from "@/components/company-onboarding";
import { currentUser } from "@/lib/platform-auth";
import { BrandSchema } from "@/lib/platform";

export default async function NewCompanyPage() {
  if (!await currentUser()) redirect("/login");
  return <AppFrame><CompanyOnboarding initialBrand={BrandSchema.parse({})} initialName="" initialStep={1} canvaConfigured={false} canvaConnected={false} /></AppFrame>;
}
