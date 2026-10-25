"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, ImagePlus, Layers, LoaderCircle, Smartphone, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { CREATIVE_FORMATS, REFERENCE_LIMIT, REFERENCE_MAX_BYTES } from "@/lib/creative-brief";
import { inferRequestedFormat, isActiveFormat, type ActiveFormat } from "@/lib/format-availability";

type Draft = { brief: string; format: ActiveFormat | ""; slideCount: number; audience: string; tone: string; referenceNames: string[] };
export function SimpleCreateForm({ companyId, companyName, brandAudience = "", brandTone = "" }: { companyId: string; companyName: string; brandAudience?: string; brandTone?: string }) {
  const router = useRouter();
  const storageKey = `ola-creative-brief:${companyId}`;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<Draft>({ brief: "", format: "", slideCount: 0, audience: brandAudience, tone: brandTone, referenceNames: [] });
  const [ready, setReady] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [missingReferences, setMissingReferences] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inferred = inferRequestedFormat(draft.brief);
  const format = draft.format || (inferred && isActiveFormat(inferred) ? inferred : "");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<Draft> | null;
      const landingBrief = sessionStorage.getItem("content-studio-draft");
      if (saved) {
        const referenceNames = Array.isArray(saved.referenceNames) ? saved.referenceNames.filter((name): name is string => typeof name === "string") : [];
        setDraft({ brief: typeof saved.brief === "string" ? saved.brief : "", format: saved.format && isActiveFormat(saved.format) ? saved.format : "", slideCount: Number.isInteger(saved.slideCount) && saved.slideCount! >= 3 && saved.slideCount! <= 9 ? saved.slideCount! : 0, audience: typeof saved.audience === "string" ? saved.audience : brandAudience, tone: typeof saved.tone === "string" ? saved.tone : brandTone, referenceNames });
        setMissingReferences(referenceNames);
      }
      if (landingBrief) {
        setDraft(current => ({ ...current, brief: landingBrief, format: "" }));
        sessionStorage.removeItem("content-studio-draft");
      }
    } catch { /* Creation still works when browser storage is unavailable. */ }
    setReady(true);
  }, [storageKey, brandAudience, brandTone]);

  useEffect(() => {
    if (!ready || busy) return;
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); setSavedLocally(true); } catch { setSavedLocally(false); }
  }, [draft, ready, busy, storageKey]);
  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file)); setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files]);

  function chooseFiles(selected: File[]) {
    const next = [...files, ...selected];
    if (next.length > REFERENCE_LIMIT) { setError(`Choose up to ${REFERENCE_LIMIT} reference images.`); return; }
    if (next.some(file => !file.type.startsWith("image/") || !file.size || file.size > REFERENCE_MAX_BYTES)) { setError("Choose images under 10 MB each."); return; }
    setError(""); setFiles(next); setMissingReferences([]);
    setDraft(current => ({ ...current, referenceNames: next.map(file => file.name) }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy || draft.brief.trim().length < 3) return;
    if (missingReferences.length) { setError("Reattach your reference images, or remove them before creating."); return; }
    if (!draft.format && inferred && !isActiveFormat(inferred)) { setError(`${inferred} is Coming Soon. Select Story, carousel or poster to use your brief.`); return; }
    setBusy(true); setError("");
    try {
      const payload = { companyId, brief: draft.brief.trim(), ...(format ? { format } : {}), slideCount: draft.slideCount || undefined, audience: draft.audience, tone: draft.tone };
      const form = new FormData(); form.set("brief", JSON.stringify(payload));
      files.forEach(file => form.append("references", file));
      const response = await fetch("/api/requests", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not start creating.");
      try { localStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
      router.push(`/intake/${data.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start creating."); setBusy(false); }
  }

  return <form className="grid gap-5" onSubmit={submit} aria-label="Create with Ola">
    <fieldset disabled={busy || !ready} className="contents">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>Using <strong className="font-medium text-foreground">{companyName}’s brand</strong></span><Link className="underline underline-offset-4" href={`/companies/${companyId}/settings?tab=details`}>Edit brand</Link></div>
      <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <label htmlFor="workspace-brief" className="mb-2 block text-sm font-medium">What would you like to create?</label>
        <Textarea ref={textarea} id="workspace-brief" name="brief" value={draft.brief} onChange={event => setDraft(current => ({ ...current, brief: event.target.value }))} onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} required minLength={3} maxLength={5000} rows={4} className="min-h-32 resize-y border-0 px-0 text-base shadow-none focus-visible:ring-0" placeholder="Announce our new course. Include the launch date, who it’s for, and what makes it useful…" aria-describedby="brief-help" />
        <p id="brief-help" className="mt-2 text-xs leading-5 text-muted-foreground">Include your key message, confirmed facts, and any exact wording to keep.</p>
      </div>
      <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-medium">Choose a format <span className="font-normal text-muted-foreground">· or let Ola ask</span></legend>
        <div className="grid gap-2 sm:grid-cols-3">{(Object.keys(CREATIVE_FORMATS) as ActiveFormat[]).map(key => {
          const Icon = key === "story" ? Smartphone : key === "carousel" ? Layers : ImageIcon;
          return <label key={key} className={`relative flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${format === key ? "border-ring bg-accent/35" : "hover:bg-muted/40"}`}>
            <input className="sr-only" type="radio" name="format" value={key} checked={format === key} onChange={() => setDraft(current => ({ ...current, format: key }))} /><Icon className="mt-0.5 size-4 shrink-0" /><span className="grid gap-1"><strong className="text-sm font-medium">{CREATIVE_FORMATS[key].label}</strong><small className="text-[11px] leading-4 text-muted-foreground">{CREATIVE_FORMATS[key].detail}</small></span>{format === key && <Check className="ml-auto size-3.5 shrink-0 text-primary" />}
          </label>;
        })}</div>
        {format === "carousel" && <label className="mt-2 flex items-center gap-3 text-sm">Slides<select aria-label="Number of slides" className="rounded-md border bg-card px-3 py-2" value={draft.slideCount} onChange={event => setDraft(current => ({ ...current, slideCount: Number(event.target.value) }))}><option value={0}>Auto (3–9)</option>{[3, 4, 5, 6, 7, 8, 9].map(count => <option key={count} value={count}>{count} slides</option>)}</select></label>}
      </fieldset>
      <div className="grid gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">Reference images <span className="font-normal text-muted-foreground">· optional</span></p><p className="mt-1 text-xs text-muted-foreground">Up to 4 images · 10 MB each · used as visual references</p></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"><ImagePlus className="size-4" /> Add images<input aria-label="Add reference images" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple onChange={event => { const selected = Array.from(event.target.files ?? []); if (selected.length) chooseFiles(selected); event.target.value = ""; }} /></label></div>
        {files.length > 0 && <ul className="grid gap-2 sm:grid-cols-2">{files.map((file, index) => <li key={`${file.name}-${index}`} className="flex min-w-0 items-center gap-2 rounded-md border p-2">{/* eslint-disable-next-line @next/next/no-img-element */}{previews[index] && <img src={previews[index]} alt="" className="size-10 rounded object-cover" />}<span className="min-w-0 flex-1 truncate text-xs">{file.name}</span><IconButton type="button" label={`Remove reference ${file.name}`} size="icon-sm" onClick={() => { const next = files.filter((_, i) => i !== index); setFiles(next); setDraft(current => ({ ...current, referenceNames: next.map(item => item.name) })); }}><X /></IconButton></li>)}</ul>}
        {missingReferences.length > 0 && <div className="text-xs leading-5" role="status"><p>Brief restored. Reattach: {missingReferences.join(", ")}. Browsers cannot restore selected files.</p><Button type="button" variant="link" size="sm" className="px-0" onClick={() => { setMissingReferences([]); setDraft(current => ({ ...current, referenceNames: [] })); }}>Continue without these images</Button></div>}
      </div>
      <details open className="rounded-lg border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">Audience & tone <span className="font-normal text-muted-foreground">· {draft.audience || draft.tone ? "prefilled from your brand or saved brief" : "optional"}</span></summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-xs font-medium">Audience<Input value={draft.audience} maxLength={2000} placeholder="Who will see this?" onChange={event => setDraft(current => ({ ...current, audience: event.target.value }))} /></label><label className="grid gap-2 text-xs font-medium">Tone<Input value={draft.tone} maxLength={2000} placeholder="e.g. Friendly and professional" onChange={event => setDraft(current => ({ ...current, tone: event.target.value }))} /></label></div><p className="mt-3 text-xs leading-5 text-muted-foreground">These choices apply to this project. Leave a field blank and Ola will ask if it needs more detail.</p></details>
    </fieldset>
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{busy ? "Starting your project…" : savedLocally ? "Brief saved on this device · Ctrl/⌘ + Enter to create" : "Ctrl/⌘ + Enter to create"}</span><Button size="lg" type="submit" disabled={!ready || busy || draft.brief.trim().length < 3}>{busy ? <LoaderCircle className="animate-spin" /> : null}{busy ? "Starting…" : "Create draft"}{!busy && <ArrowRight />}</Button></div>
  </form>;
}
