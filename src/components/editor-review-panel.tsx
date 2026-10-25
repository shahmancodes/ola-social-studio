"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Eye, RotateCcw, Sparkles, X } from "lucide-react";
import type { ReviewItem } from "@/lib/editor-review";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { secondsLabel } from "@/lib/workflow-timing";

export function EditorReviewPanel({ projectId, reportKey, items, summary, passed, open, onOpenChange, onSelect, onAsk, onRunReview, disabled, running, elapsedSeconds = 0 }: {
  projectId: string; reportKey: string; items: ReviewItem[]; summary?: string; passed: boolean;
  open: boolean; onOpenChange: (open: boolean) => void; onSelect: (item: ReviewItem) => void; onAsk: (item: ReviewItem) => void;
  onRunReview?: () => void; disabled: boolean; running: boolean;
  elapsedSeconds?: number;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const storageKey = `ola-review-dismissals:${projectId}`;
  useEffect(() => {
    setDismissed([]); setNotice("");
    try { const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null"); if (saved?.report === reportKey && Array.isArray(saved.ids)) setDismissed(saved.ids.filter((id: unknown): id is string => typeof id === "string")); } catch { /* Optional local preferences. */ }
  }, [reportKey, storageKey]);
  const visible = items.filter(item => !dismissed.includes(item.id));
  function dismiss(ids: string[]) {
    setDismissed(ids);
    try { localStorage.setItem(storageKey, JSON.stringify({ report: reportKey, ids })); } catch { /* Dismissals remain available in this session. */ }
  }
  return <section className="border-b bg-card" aria-label="Design review">
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls="editor-review-findings" onClick={() => onOpenChange(!open)} className="h-auto justify-start px-0 text-left whitespace-normal">{passed ? <CheckCircle2 className="size-4 text-emerald-700" /> : <Eye className="size-4" />}<span>{running ? `Reviewing your draft… · ${secondsLabel(elapsedSeconds)}` : items.length ? `${visible.length} ${visible.length === 1 ? "item" : "items"} to review${dismissed.length ? ` · ${dismissed.length} dismissed` : ""}` : passed ? "Review passed" : "Review your draft"}</span><ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></Button>{onRunReview && <Button type="button" variant="outline" size="sm" disabled={disabled || running} onClick={onRunReview}><RotateCcw /> {running ? "Review running…" : "Run review"}</Button>}</div>
    {open && <div id="editor-review-findings" className="grid gap-3 px-4 pb-4">
      {summary && <p className="text-xs leading-5 text-muted-foreground">{summary}</p>}
      {items.length > 0 && <p className="text-xs leading-5 text-muted-foreground">Check facts and sources before using the draft. Dismiss hides an item on this device; QA status stays unchanged.</p>}
      <ul className="grid gap-3">{visible.map(item => <li key={item.id} className="rounded-lg border p-3"><div className="mb-2 flex flex-wrap gap-2"><Badge variant={item.category === "Facts & sources" ? "outline" : "secondary"} className="text-[10px]">{item.category}</Badge>{item.pageIndex !== null && <span className="text-[11px] text-muted-foreground">Page {item.pageIndex + 1}</span>}</div><p className="text-xs leading-5">{item.problem}</p>{item.successCriterion && <p className="mt-2 text-xs leading-5 text-muted-foreground">Check: {item.successCriterion}</p>}<div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => { onSelect(item); setNotice(item.pageIndex === null ? "Select the affected text or image on the canvas to edit it." : `Page ${item.pageIndex + 1} selected. The affected component is highlighted when it can be identified.`); }}><Eye /> Edit myself</Button><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => { onAsk(item); setNotice("Fix request added to Ola chat. Send it to preview a proposed change."); }}><Sparkles /> Ask Ola to fix</Button><Button type="button" variant="ghost" size="sm" onClick={() => dismiss([...dismissed, item.id])}><X /> Dismiss</Button></div></li>)}</ul>
      {!visible.length && items.length > 0 && <p className="text-xs text-muted-foreground">All findings are dismissed locally. Run review to check the saved draft again.</p>}
      {dismissed.length > 0 && <Button type="button" className="justify-self-start" variant="link" size="sm" onClick={() => dismiss([])}>Show dismissed findings</Button>}
      {!summary && !items.length && <p className="text-xs leading-5 text-muted-foreground">{running ? "Ola is checking the saved draft. Findings will appear here." : "Run review to check facts, layout, and brand fit in the saved draft."}</p>}
      <p role="status" className="text-xs leading-5 text-muted-foreground">{notice}</p>
    </div>}
  </section>;
}
