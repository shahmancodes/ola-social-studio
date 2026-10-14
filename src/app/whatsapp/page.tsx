import Link from "next/link";
import { redirect } from "next/navigation";
import { OlaLogo } from "@/components/ola-logo";
import { ActionLink } from "@/components/action-button";
import { WhatsAppLanding } from "@/components/whatsapp-landing";
import { currentUser } from "@/lib/platform-auth";
import { companiesForUser } from "@/lib/platform";
import styles from "./whatsapp.module.css";

export default async function PublicWhatsAppPage() {
  const user = await currentUser();
  if (user) {
    const company = companiesForUser(user.id)[0];
    redirect(company ? `/companies/${company.id}/whatsapp` : "/workspace");
  }

  return <div className={styles.shell}>
    <header className={styles.header}>
      <Link className={styles.wordmark} href="/" aria-label="ola home"><OlaLogo decorative /></Link>
      <ActionLink className={styles.headerJoin} href="/join">Join ola</ActionLink>
    </header>
    <WhatsAppLanding displayNumber="" ready={false} guest />
  </div>;
}
