"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRightIcon } from "@/components/ui-icons";
import { FolderOpen, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import styles from "./projects.module.css";

export type LibraryProject = {
  id: string;
  title: string;
  brief: string;
  contentType: string;
  status: string;
  statusLabel: string;
  updatedAt: string;
  destination: string;
  preview: string | null;
  slideCount: number;
  pipelineHref: string | null;
};

type StatusFilter = "all" | "active" | "ready" | "attention";
type SortOrder = "recent" | "oldest" | "name";

const typeNames: Record<string, string> = {
  intake: "Planning",
  carousel: "Carousel",
  post: "Post",
  story: "Story",
  article: "Article",
  presentation: "Presentation",
  design: "Design",
};

function typeName(type: string) {
  return typeNames[type] ?? type.replaceAll("_", " ");
}

function matchesStatus(item: LibraryProject, filter: StatusFilter) {
  if (filter === "ready") return item.status === "complete";
  if (filter === "attention") return item.status === "failed" || item.status === "stopped" || item.status === "needs-review";
  if (filter === "active") return !["complete", "failed", "stopped", "needs-review"].includes(item.status);
  return true;
}

function ProjectTile({ item }: { item: LibraryProject }) {
  const date = new Date(item.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Hong_Kong" });
  const label = typeName(item.contentType);
  return <Card className="gap-0 overflow-hidden py-0 shadow-none transition-shadow hover:shadow-md">
    <Link className={`${styles.preview} rounded-none border-0`} href={item.destination} aria-label={`Open ${item.title}`}>
      {item.preview ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.preview} alt="" loading="lazy" decoding="async" /> : <span className={styles.previewFallback} data-type={item.contentType} aria-hidden="true"><span className={styles.mockPage}><span className={styles.mockTop} /><span className={styles.mockHeading} /><span className={styles.mockLine} /><span className={styles.mockLineShort} /><span className={styles.mockShape} /></span><span className={styles.mockType}>{label}</span></span>}
      {item.status !== "complete" && <Badge variant="outline" className={`absolute top-3 left-3 bg-white/95 text-[10px] ${["failed", "stopped", "needs-review"].includes(item.status) ? "text-destructive" : "text-muted-foreground"}`}>{item.statusLabel}</Badge>}
    </Link>
    <CardContent className="p-4">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-sm leading-5 font-semibold"><Link className="line-clamp-2 hover:text-accent-foreground" href={item.destination}>{item.title}</Link></h3>
        {item.pipelineHref && <Button asChild variant="ghost" size="icon-xs"><Link href={item.pipelineHref} aria-label={`Open ${item.title} pipeline`} title="View pipeline"><ArrowRightIcon size={16} /></Link></Button>}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{label}{item.slideCount ? ` · ${item.slideCount} slides` : ""} <span aria-hidden="true">·</span> <time dateTime={item.updatedAt}>{date}</time></p>
    </CardContent>
  </Card>;
}

export function ProjectsLibrary({ companyId, items }: { companyId?: string; items: LibraryProject[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState<SortOrder>("recent");
  const createHref = companyId ? `/workspace?company=${companyId}` : "/workspace";
  const types = [...new Set(items.map((item) => item.contentType))].sort((a, b) => typeName(a).localeCompare(typeName(b)));
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visible = items.filter((item) => matchesStatus(item, status) && (type === "all" || item.contentType === type) && (!normalizedSearch || `${item.title} ${item.brief}`.toLocaleLowerCase().includes(normalizedSearch)))
    .sort((a, b) => sort === "name" ? a.title.localeCompare(b.title) : sort === "oldest" ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt));
  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All projects" },
    { key: "active", label: "In progress" },
    { key: "ready", label: "Ready" },
    { key: "attention", label: "Needs attention" },
  ];

  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
    <PageHeader title="Projects" description="Everything you’re making, all in one place." actions={<Button asChild><Link href={createHref}><Plus /> New project</Link></Button>} />

    {items.length ? <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input aria-label="Search projects" className="bg-card pl-9" type="search" placeholder="Search your projects" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <Select value={type} onValueChange={setType}><SelectTrigger aria-label="Filter by project type" className="w-40 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{types.map((entry) => <SelectItem key={entry} value={entry}>{typeName(entry)}</SelectItem>)}</SelectContent></Select>
        <Select value={sort} onValueChange={(value) => setSort(value as SortOrder)}><SelectTrigger aria-label="Sort projects" className="w-44 bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recent">Recently edited</SelectItem><SelectItem value="oldest">Oldest edited</SelectItem><SelectItem value="name">Name A–Z</SelectItem></SelectContent></Select>
      </div>

      <Tabs value={status} onValueChange={(value) => setStatus(value as StatusFilter)}><div className="overflow-x-auto pb-1"><TabsList aria-label="Project status">{filters.map((filter) => <TabsTrigger key={filter.key} value={filter.key} className="gap-2 px-3">{filter.label}<Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">{items.filter((item) => matchesStatus(item, filter.key)).length}</Badge></TabsTrigger>)}</TabsList></div>

      <TabsContent value={status} className="mt-4"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{status === "all" ? "All projects" : filters.find((filter) => filter.key === status)?.label}</h2><span className="text-xs text-muted-foreground">{visible.length} {visible.length === 1 ? "project" : "projects"}</span></div>
      {visible.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visible.map((item) => <ProjectTile key={item.id} item={item} />)}</div> : <Card className="items-center gap-3 py-12 text-center shadow-none"><h3 className="font-semibold">No matching projects</h3><p className="text-sm text-muted-foreground">Try a different search or filter.</p><Button variant="outline" onClick={() => { setSearch(""); setStatus("all"); setType("all"); }}>Clear filters</Button></Card>}
      </TabsContent></Tabs>
    </> : <Card className="items-center gap-4 px-6 py-16 text-center shadow-none"><FolderOpen className="size-9 text-muted-foreground" /><h2 className="text-xl font-semibold">Your projects will live here.</h2><p className="max-w-sm text-sm leading-6 text-muted-foreground">Start with a brief. You’ll see drafts, work in progress, and finished designs together.</p><Button asChild><Link href={createHref}>Create your first project <ArrowRightIcon size={16} /></Link></Button></Card>}
  </main>;
}
