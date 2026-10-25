"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowRight, Building2, ChevronDown, FolderOpen, Menu, Plus, ShieldCheck } from "lucide-react";
import { OlaLogo } from "./ola-logo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import styles from "./workspace-shell.module.css";

type CompanyOption = { id: string; name: string; logoAssetId: string | null; onboardingStep: number };

function WorkspaceAvatar({ company }: { company: CompanyOption }) {
  const [failed, setFailed] = useState(false);
  return <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground" aria-hidden="true">{company.logoAssetId && !failed
    ? <Image src={`/api/companies/${company.id}/assets/${company.logoAssetId}`} alt="" width={36} height={36} className="size-full object-contain bg-white" unoptimized onError={() => setFailed(true)} />
    : <Building2 className="size-4" />}</span>;
}

export function WorkspaceShell({ children, companies, companyId, email, displayName }: { children: ReactNode; companies: CompanyOption[]; companyId?: string; email: string; displayName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const selected = companies.find((company) => company.id === companyId) ?? companies[0];
  const editorMode = pathname.startsWith("/content/") || pathname.startsWith("/intake/") || /^\/projects\/[^/]+\/result$/.test(pathname);
  const items = [
    { label: "Projects", href: selected ? `/projects?company=${selected.id}` : "/projects", Icon: FolderOpen, active: pathname.startsWith("/projects") || pathname.startsWith("/content") },
    { label: "Brand", href: selected ? `/companies/${selected.id}/settings` : "/workspace", Icon: ShieldCheck, active: /\/(theme|settings|assets)/.test(pathname) },
  ];

  function changeCompany(nextId: string) {
    if (pathname === "/videos") router.push(`/videos?company=${nextId}`);
    else if (pathname === "/projects") router.push(`/projects?company=${nextId}`);
    else if (pathname === "/profile") router.push(`/profile?company=${nextId}${new URLSearchParams(window.location.search).get("tab") === "team" ? "&tab=team" : ""}`);
    else if (pathname.includes("/assets")) router.push(`/companies/${nextId}/settings?tab=assets`);
    else if (pathname.includes("/whatsapp")) router.push(`/companies/${nextId}/whatsapp`);
    else if (pathname.includes("/theme") || pathname.includes("/settings")) router.push(`/companies/${nextId}/settings${window.location.search}`);
    else router.push(`/workspace?company=${nextId}`);
    setOpen(false);
  }

  const navigation = <div className="flex h-full min-h-0 flex-col gap-5 p-4">
    {selected && <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" className="h-auto w-full justify-start gap-3 px-1 py-2" aria-label={`Switch workspace, current workspace ${selected.name}`}><WorkspaceAvatar key={selected.id} company={selected} /><span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{selected.name}</span><ChevronDown className="size-3.5 text-muted-foreground" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuRadioGroup value={selected.id} onValueChange={changeCompany}>{companies.map((company) => <DropdownMenuRadioItem key={company.id} value={company.id}>{company.name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
        <DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/companies/new" onClick={() => setOpen(false)}><Plus /> Add company</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>}
    {selected && selected.onboardingStep < 5 && <Button asChild variant="secondary" size="sm" className="justify-between"><Link href={`/companies/${selected.id}/onboarding`} onClick={() => setOpen(false)}>Finish company setup <ArrowRight /></Link></Button>}
    <Button asChild className="rainbow-action h-10 w-full gap-2.5 hover:bg-primary"><Link href={selected ? `/workspace?company=${selected.id}` : "/workspace"} onClick={() => setOpen(false)} aria-current={pathname === "/workspace" ? "page" : undefined}><Plus className="size-4" /> Create</Link></Button>
    <nav className="grid gap-1" aria-label="Company navigation">{items.map(({ Icon, ...item }) => <Button key={item.label} asChild variant="ghost" className={cn("h-10 justify-start gap-3 px-3 text-muted-foreground", item.active && "bg-accent text-accent-foreground")}><Link href={item.href} onClick={() => setOpen(false)} aria-current={item.active ? "page" : undefined}><Icon className="size-4" />{item.label}</Link></Button>)}</nav>
    <div className="flex-1" />
    {selected && <Button asChild variant="outline" size="sm" className="h-10 justify-start border-emerald-100 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"><Link href={`/companies/${selected.id}/whatsapp`} onClick={() => setOpen(false)} aria-current={pathname.includes("/whatsapp") ? "page" : undefined}><Image src="/whatsapp-glyph-green.svg" alt="" width={17} height={17} unoptimized /> Connect WhatsApp <ArrowRight className="ml-auto size-3.5" /></Link></Button>}
    <Separator />
    <Button asChild variant="ghost" className="h-auto justify-start px-1 py-2"><Link href={selected ? `/profile?company=${selected.id}` : "/profile"} aria-label="Open profile" aria-current={pathname === "/profile" ? "page" : undefined} onClick={() => setOpen(false)}><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{(displayName || email).slice(0, 1).toUpperCase()}</span><span className="grid min-w-0 gap-0.5 text-left"><strong className="truncate text-xs font-semibold">{displayName || email.split("@")[0]}</strong><small className="truncate text-[11px] text-muted-foreground">{email}</small></span></Link></Button>
  </div>;

  return <div className={cn(styles.layout, editorMode && styles.editorMode)}>
    <aside className={styles.sidebar} aria-label="Main navigation">{navigation}</aside>
    <div className={styles.content}>
      <header className={styles.mobileBar}><Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Open navigation"><Menu /></Button></SheetTrigger><SheetContent side="left" className="w-64 gap-0 p-0"><SheetHeader className="sr-only"><SheetTitle>Workspace navigation</SheetTitle></SheetHeader>{navigation}</SheetContent></Sheet><Link href="/workspace" aria-label="ola home"><OlaLogo decorative className="h-8 w-auto" /></Link></header>
      <header className={styles.contentHeader}><Link href="/workspace" aria-label="ola home"><OlaLogo decorative className="h-8 w-auto" /></Link></header>
      {children}
    </div>
  </div>;
}
