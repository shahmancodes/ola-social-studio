"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ActionButton } from "./action-button";
import { SignOutButton } from "./sign-out-button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NavTabs } from "@/components/ui/nav-tabs";
import { PageHeader } from "@/components/page-header";
import styles from "./profile-settings.module.css";

type Role = "owner" | "admin" | "member";
type Member = { id: string; email: string; display_name: string; role: Role };
type Invitation = { email: string; role: "admin" | "member"; expires_at: string };
type Company = { id: string; name: string; role: Role } | null;

function nameFor(email: string, displayName: string) {
  return displayName || email.split("@")[0];
}

export function ProfileSettings({ activeTab, userId, email, displayName, company, members, pendingInvitations }: {
  activeTab: "general" | "team";
  userId: string;
  email: string;
  displayName: string;
  company: Company;
  members: Member[];
  pendingInvitations: Invitation[];
}) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const baseHref = company ? `/profile?company=${company.id}` : "/profile";

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name }) });
      const result = await response.json() as { displayName?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save your profile.");
      setName(result.displayName ?? "");
      setSaveMessage("Profile saved.");
      router.refresh();
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!company) return;
    setInviting(true);
    setInviteMessage("");
    setInviteLink("");
    try {
      const response = await fetch(`/api/companies/${company.id}/invite`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: inviteEmail, role: inviteRole }) });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Could not create an invite link.");
      setInviteLink(result.url);
      setInviteEmail("");
      setInviteMessage("Invite link ready to share.");
      router.refresh();
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : "Could not create an invite link.");
    } finally {
      setInviting(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteMessage("Invite link copied.");
    } catch {
      setInviteMessage("Select and copy the link below.");
    }
  }

  return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
    <PageHeader title={activeTab === "general" ? "Profile" : "My team"} description={activeTab === "general" ? "Your personal details and the workspace you are using." : company ? `Everyone with access to ${company.name}.` : "Join a workspace to see your team."} />
    <NavTabs label="Profile sections" items={[
      { label: "General", href: baseHref, active: activeTab === "general" },
      { label: "My team", href: `${baseHref}${company ? "&" : "?"}tab=team`, active: activeTab === "team" },
    ]} />
    <div className="space-y-5">
      {activeTab === "general" ? <>
        <Card className={`${styles.section} gap-0 px-6 py-6 shadow-none`} aria-labelledby="personal-title">
          <div className={styles.sectionHeading}><h2 id="personal-title">Personal details</h2><p>Choose how your name appears to your team.</p></div>
          <form className={styles.form} onSubmit={saveProfile}>
            <label className={styles.field}>Display name<Input type="text" autoComplete="name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder={email.split("@")[0]} /></label>
            <label className={styles.field}>Email address<Input type="email" value={email} readOnly aria-readonly="true" /></label>
            <div className={styles.formActions}><ActionButton type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</ActionButton><span role="status">{saveMessage}</span></div>
          </form>
        </Card>
        <Card className={`${styles.section} gap-0 px-6 py-6 shadow-none`} aria-labelledby="workspace-title"><div className={styles.sectionHeading}><h2 id="workspace-title">Workspace</h2><p>Your current company and access level.</p></div><dl className={styles.details}><div><dt>Company</dt><dd>{company?.name ?? "No workspace yet"}</dd></div><div><dt>Your role</dt><dd>{company ? company.role : "—"}</dd></div></dl></Card>
        <Card className={`${styles.section} gap-0 px-6 py-6 shadow-none`} aria-labelledby="session-title"><div className={styles.sectionHeading}><h2 id="session-title">Session</h2><p>Sign out of ola on this device.</p></div><div className={styles.signOut}><SignOutButton /></div></Card>
      </> : <>
        {company ? <>
          <Card className={`${styles.section} gap-0 px-6 py-6 shadow-none`} aria-labelledby="members-title"><div className={styles.sectionHeading}><h2 id="members-title">Members <span className={styles.count}>{members.length}</span></h2><p>People who can work in this company.</p></div>
            <div className={styles.memberList}>{members.map((member) => <div className={styles.member} key={member.id}><span className={styles.memberAvatar} aria-hidden="true">{nameFor(member.email, member.display_name).slice(0, 1).toUpperCase()}</span><div className={styles.memberIdentity}><strong>{nameFor(member.email, member.display_name)}{member.id === userId && <span className={styles.you}>You</span>}</strong><small>{member.email}</small></div><Badge variant="secondary" className="capitalize">{member.role}</Badge></div>)}</div>
          </Card>
          {pendingInvitations.length > 0 && <Card className={`${styles.section} gap-0 px-6 py-6 shadow-none`} aria-labelledby="pending-title"><div className={styles.sectionHeading}><h2 id="pending-title">Pending invitations <span className={styles.count}>{pendingInvitations.length}</span></h2><p>These people have not joined yet.</p></div><div className={styles.memberList}>{pendingInvitations.map((invite, index) => <div className={styles.member} key={`${invite.email}-${index}`}><span className={`${styles.memberAvatar} ${styles.pendingAvatar}`} aria-hidden="true">{invite.email.slice(0, 1).toUpperCase()}</span><div className={styles.memberIdentity}><strong>{invite.email}</strong><small>Invite pending</small></div><Badge variant="outline" className="capitalize">{invite.role}</Badge></div>)}</div></Card>}
          {company.role !== "member" && <Card className={`${styles.section} gap-0 px-6 py-6 shadow-none`} aria-labelledby="invite-title"><div className={styles.sectionHeading}><h2 id="invite-title">Invite a teammate</h2><p>Create a link for someone to join this workspace.</p></div><form className={styles.inviteForm} onSubmit={createInvite}><label className={styles.field}>Email address<Input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teammate@company.com" /></label><label className={styles.field}>Role<NativeSelect value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "member" | "admin")}><NativeSelectOption value="member">Member</NativeSelectOption><NativeSelectOption value="admin">Admin</NativeSelectOption></NativeSelect></label><ActionButton type="submit" disabled={inviting}>{inviting ? "Creating…" : "Create invite link"}</ActionButton></form>{inviteLink && <div className={styles.inviteResult}><label className={styles.field}>Invite link<Input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /></label><Button variant="outline" type="button" onClick={copyInvite}>Copy link</Button></div>}<p className={styles.feedback} role="status">{inviteMessage}</p></Card>}
        </> : <div className={styles.empty}>No team is available until you join a workspace.</div>}
      </>}
    </div>
  </main>;
}
