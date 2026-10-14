import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/platform-auth";
import { OlaLogo } from "@/components/ola-logo";
import { ArrowRightIcon } from "@/components/ui-icons";
import styles from "./join.module.css";

export default async function JoinPage() {
  if (await currentUser()) redirect("/workspace");

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.wordmark} href="/" aria-label="ola home"><OlaLogo decorative /></Link>
      <Link className={styles.signIn} href="/login">Sign in <ArrowRightIcon size={16} /></Link>
    </header>
    <section className={styles.stage} aria-labelledby="join-title">
      <div className={styles.colorField} aria-hidden="true" />
      <div className={styles.content}>
        <p className={styles.eyebrow}>A space for what you make</p>
        <h1 id="join-title">Bring your ideas<br /><span>to life with ola.</span></h1>
        <p className={styles.lede}>A calmer place to create with your team, from the first thought to the finished piece.</p>
        <div className={styles.joinPanel}>
          <h2>Join your workspace</h2>
          <p>Choose how you would like to continue.</p>
          <button className={styles.googleButton} type="button" disabled aria-label="Continue with Google, coming soon">
            <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.2 3-7.3Z"/><path fill="#34A853" d="M12 22c2.7 0 5-1 6.6-2.5l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.7a6 6 0 0 1 0-3.4V7.7H3.1a10 10 0 0 0 0 8.6l3.3-2.6Z"/><path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.7l3.3 2.6C7.2 7.9 9.4 6.1 12 6.1Z"/></svg>
            <span>Continue with Google</span><small>Coming soon</small>
          </button>
          <div className={styles.divider}><span>or</span></div>
          <Link className={styles.emailButton} href="/login">Continue with email <ArrowRightIcon size={18} /></Link>
          <p className={styles.inviteNote}>ola is currently invitation only. If your team invited you, open the invitation link they sent to set up your account.</p>
        </div>
      </div>
    </section>
  </main>;
}
