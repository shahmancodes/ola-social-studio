import Link from "next/link";
import Image from "next/image";
import { currentUser } from "@/lib/platform-auth";
import { companiesForUser } from "@/lib/platform";
import { LandingPrompt } from "@/components/landing-prompt";
import { RotatingHeadline } from "@/components/rotating-headline";
import { OlaLogo } from "@/components/ola-logo";
import { ArrowRightIcon } from "@/components/ui-icons";
import { Button } from "@/components/ui/button";
import styles from "./page.module.css";

export default async function Home() {
  const user = await currentUser();
  const company = user ? companiesForUser(user.id)[0] : null;
  const whatsappHref = company ? `/companies/${company.id}/whatsapp` : "/whatsapp";
  return <main className={styles.page}>
    <header className={styles.header}>
      <nav aria-label="Main navigation">
        <Button asChild variant="outline" className="rounded-full border-emerald-100 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"><Link href={whatsappHref}><Image src="/whatsapp-glyph-green.svg" alt="" width={18} height={18} unoptimized /> WhatsApp</Link></Button>
        <Button asChild className="rainbow-action rounded-full hover:bg-primary"><Link href={user ? "/workspace" : "/join"}>{user ? "Open workspace" : "Join ola"} <ArrowRightIcon size={15} /></Link></Button>
      </nav>
    </header>
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.colorField} aria-hidden="true" />
      <div className={styles.heroContent}>
        <h1 id="hero-title" aria-label="meet ola."><span>meet</span><OlaLogo className={styles.heroLogo} writeIn /><span className={styles.heroPeriod}>.</span></h1>
        <div className={styles.tagline}><RotatingHeadline /></div>
        <LandingPrompt destination={user ? "/workspace" : "/join"} />
      </div>
    </section>
  </main>;
}
