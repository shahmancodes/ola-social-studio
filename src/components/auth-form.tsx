"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OlaLogo } from "./ola-logo";
import { ArrowLeftIcon, ArrowRightIcon } from "./ui-icons";
import styles from "./auth-form.module.css";

export function AuthForm({ inviteToken, email: invitedEmail }: { inviteToken?: string; email?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <main className={styles.page}><header className={styles.header}><Link href="/" className={styles.wordmark} aria-label="ola home"><OlaLogo decorative /></Link><Link className={styles.back} href="/"><ArrowLeftIcon size={15} /> Back to home</Link></header><div className={styles.content}><section className={styles.intro}><p className={styles.eyebrow}>A place to make good work</p><h1>One workspace for everything your team creates.</h1><p>Your ideas, your brand, and your projects—together in a calmer place to work.</p></section><section className={styles.signIn}><form onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch(inviteToken ? "/api/auth/accept" : "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: inviteToken, email: data.get("email"), password: data.get("password") }) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) { setError(result.error ?? "Could not sign in."); return; }
    router.push("/workspace"); router.refresh();
  }}>
    <p className={styles.formEyebrow}>{inviteToken ? "You’re invited" : "Welcome back"}</p>
    <h2>{inviteToken ? "Join your workspace" : "Sign in"}</h2>
    <p className={styles.formIntro}>{inviteToken ? "Set up your account to work with your team." : "Pick up where you left off."}</p>
    <label><span>Email address</span><Input name="email" type="email" autoComplete="email" required defaultValue={invitedEmail} readOnly={Boolean(inviteToken)} /></label>
    <label><span>Password</span><Input name="password" type="password" autoComplete={inviteToken ? "new-password" : "current-password"} required minLength={inviteToken ? 12 : undefined} /></label>
    {error && <p className="form-error">{error}</p>}
    <Button variant="default" className={styles.submit} disabled={busy}>{busy ? "Please wait…" : inviteToken ? "Accept invitation" : "Continue"}<ArrowRightIcon size={18} /></Button>
    <p className={styles.inviteNote}>{inviteToken ? "Already have an account? Use your existing password." : "Access is by invitation from a company owner."}</p>
  </form></section></div><footer className={styles.footer}>A private workspace for your company’s work.</footer></main>;
}
