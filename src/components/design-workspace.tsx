"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import type { DesignIntake, DesignSpec } from "@/lib/freeform-design";
import { ShareButton } from "./share-button";
import { DownloadButton } from "./download-button";
import { FreeformCanvasEditor } from "./freeform-canvas-editor";
import { UniversalEditor } from "./universal-editor";
import { ArrowLeftIcon, ArrowRightIcon } from "./ui-icons";
import { useOlaEditor } from "./ola-panel";
import type { OlaTarget } from "@/lib/ola-edit";
import styles from "./design-workspace.module.css";

type Row = { id: string; company_id: string; brief: string; status: string; version: number; artifact_json: string | null; brand_snapshot_json: string };
function readState(row: Row): DesignIntake | DesignSpec | null { try { return JSON.parse(row.artifact_json ?? "null"); } catch { return null; } }
function isIntake(value: DesignIntake | DesignSpec | null): value is DesignIntake { return Boolean(value && "phase" in value); }
function isDesign(value: DesignIntake | DesignSpec | null): value is DesignSpec { return Boolean(value && "type" in value && value.type === "design"); }
function withIds(value: DesignSpec): DesignSpec { return { ...value, elements: value.elements.map((element, index) => ({ ...element, id: element.id ?? `element-${index + 1}` })) }; }

export function DesignWorkspace({ initialRow }: { initialRow: Row }) {
  const [row, setRow] = useState(initialRow);
  const [state, setState] = useState<DesignIntake | DesignSpec | null>(() => readState(initialRow));
  const [answer, setAnswer] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<DesignSpec | null>(() => { const value = readState(initialRow); return isDesign(value) ? withIds(value) : null; });
  const [dirty, setDirty] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<OlaTarget | null>(null);
  const olaTargets: OlaTarget[] = draft ? [
    { label: "Background", path: ["background"] },
    { label: "Title", path: ["title"] },
    ...draft.elements.map((element, index) => ({ label: `${element.kind === "component" ? "Structured visual" : element.kind} ${index + 1}`, path: ["elements", index], id: element.id })),
  ] : [];
  const ola = useOlaEditor<DesignSpec | null>({ projectId: row.id, stage: "design", document: draft, baseVersion: row.version, targets: olaTargets, selectedTarget, onAccept: (candidate) => { if (candidate) { setDraft(candidate); setState(candidate); setDirty(true); } } });
  useEffect(() => {
    if (["complete", "needs-review", "failed", "stopped", "awaiting-input"].includes(row.status)) return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/content/${row.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json(); const next = readState(result.project); setRow(result.project); setState(next); if (isDesign(next)) setDraft(withIds(next));
    }, 2000);
    return () => clearInterval(timer);
  }, [row.id, row.status]);
  async function submitAnswer(value: string) {
    setBusy(true); setError("");
    const response = await fetch(`/api/content/${row.id}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answer: value }) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) { setError(result.error); return; }
    setAnswer(""); setRow({ ...row, status: "clarifying" });
  }
  async function save(spec: DesignSpec) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/content/${row.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ artifact: spec, version: row.version }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save design.");
      const next = readState(result.project); setRow(result.project); setState(next); setDraft(isDesign(next) ? withIds(next) : null); setDirty(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save design."); }
    finally { setBusy(false); }
  }
  async function action(method: "POST" | "DELETE") {
    const response = await fetch(`/api/content/${row.id}`, { method });
    if (!response.ok) { setError((await response.json()).error); return; }
    setRow({ ...row, status: method === "DELETE" ? "stopped" : "queued" });
  }
  const intake = isIntake(state) ? state : null;
  const design = isDesign(state) ? state : null;
  const visible = ola.preview ?? draft ?? design;
  const brand = JSON.parse(row.brand_snapshot_json) as { colors?: string[] };
  const accent = /^#[0-9a-fA-F]{6}$/.test(brand.colors?.[1] ?? "") ? brand.colors![1] : /^#[0-9a-fA-F]{6}$/.test(brand.colors?.[0] ?? "") ? brand.colors![0] : "#6848C9";
  return <main className={styles.page}>
    <header className={styles.header}><div><a className={styles.back} href={`/projects?company=${row.company_id}`}><ArrowLeftIcon size={15} /> All projects</a>{!design ? <span className={styles.status}>Design · {row.status.replaceAll("-", " ")}</span> : null}</div>{!["complete", "failed", "stopped"].includes(row.status) && <Button variant="outline" className={styles.cancel} type="button" onClick={() => action("DELETE")}>Cancel</Button>}</header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {row.status === "failed" && <p className={styles.failure}>Designing stopped after an error. <Button variant="outline" type="button" onClick={() => action("POST")}>Retry</Button></p>}
    {intake && <section className={styles.intake}>
      <h2>Design brief</h2>
      {intake.answers.map((item, index) => <p key={index}><strong>{item.question}</strong><br />{item.answer}</p>)}
      {intake.sources.length > 0 && <details><summary>Design and size references ({intake.sources.length})</summary><ul>{intake.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> — {source.note}</li>)}</ul></details>}
      {intake.question && row.status === "awaiting-input" ? <><h3>{intake.question.text}</h3>{intake.question.options.length > 0 && <div className={styles.options}>{intake.question.options.map((option) => <Button variant="outline" key={option} type="button" disabled={busy} onClick={() => submitAnswer(option)}>{option}</Button>)}</div>}<form onSubmit={(event) => { event.preventDefault(); void submitAnswer(answer); }}><label><span>Your answer</span><Input value={answer} onChange={(event) => setAnswer(event.target.value)} required /></label><Button variant="default" className={styles.continue} disabled={busy}>Continue <ArrowRightIcon size={18} /></Button></form></> : <p>{row.status === "stopped" ? "Cancelled." : "Researching the format and checking what else is needed…"}</p>}
    </section>}
    {design && visible && <UniversalEditor format="Design" title={visible.title} status={row.status} dirty={dirty} saving={busy} saveDisabled={row.status === "stopped" || !draft?.elements.length || ola.pending || ola.working} onSave={() => { if (draft) void save(draft); }} note={ola.pending ? "Previewing Ola's proposed changes. Accept or discard them in chat." : `${design.size.label} · ${design.size.widthPx} × ${design.size.heightPx} px${dirty ? " · Save to update downloads" : ""}`} ola={ola.panel} olaMode={ola.olaMode} onOlaModeChange={ola.setOlaMode} olaSelectionKey={ola.selectionKey} previewing={ola.pending || ola.working} actions={<>{row.status === "complete" && !dirty && !ola.pending ? <ShareButton projectId={row.id} /> : null}</>} primaryActions={<DownloadButton projectId={row.id} format="design" disabledReason={ola.pending ? "Accept or discard Ola’s proposed changes before downloading." : dirty || busy ? "Save your changes before downloading." : ola.working ? "Wait for Ola to finish before downloading." : !["complete", "needs-review"].includes(row.status) ? "Downloads are available when the draft is ready." : undefined} needsReview={row.status === "needs-review"} />}>
      <FreeformCanvasEditor key={`${row.version}:${ola.previewKey ?? "draft"}`} projectId={row.id} companyId={row.company_id} initial={ola.preview ?? design} accent={accent} busy={busy || ola.pending || ola.working} onSave={save} showSaveButton={false} onSelectionChange={setSelectedTarget} onDraftChange={(next) => { if (!ola.pending) { setDraft(next); setDirty(true); } }} />
      {design.sources.length > 0 && <details><summary>Design references</summary><ul>{design.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> — {source.note}</li>)}</ul></details>}
      {design.visualReferences && <details><summary>Visual references ({design.visualReferences.references.length})</summary><p>{design.visualReferences.summary}</p><ul>{design.visualReferences.references.map((reference) => <li key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer">{reference.title}</a> — {reference.observedPattern}</li>)}</ul></details>}
    </UniversalEditor>}
  </main>;
}
