import { notFound } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { WhatsAppLanding } from "@/components/whatsapp-landing";
import { requireMembership } from "@/lib/platform-auth";
import { getCompany } from "@/lib/platform";

export default async function WhatsAppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireMembership(id);
    const company = getCompany(id);
    if (!company) notFound();
    const displayNumber = process.env.WHATSAPP_DISPLAY_NUMBER?.trim() ?? "";
    const ready = Boolean(displayNumber && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);
    return <AppFrame companyId={id}><WhatsAppLanding displayNumber={displayNumber} ready={ready} /></AppFrame>;
  } catch { notFound(); }
}
