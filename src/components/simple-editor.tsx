"use client";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { syncArtifactComposition } from "@/lib/composition";
import type { SimpleArtifact } from "@/lib/simple-content";
import { ShareButton } from "./share-button";
import { DownloadButton } from "./download-button";
import { EditorReviewPanel } from "./editor-review-panel";
import { editorReviewItems, reviewFixPrompt, reviewOlaTarget, reviewSource, type CanvasReviewFocus, type ReviewItem } from "@/lib/editor-review";
import { useElapsedSeconds } from "./elapsed-time";
import { SimpleArtifactFields } from "./simple-artifact-fields";
import { SimpleArtifactPreview } from "./simple-artifact-preview";
import { ArticleDocumentEditor } from "./article-document-editor";
import { RichTextToolbar } from "./rich-text-field";
import { VisualContentCanvas } from "./visual-content-canvas";
import { UniversalEditor, type EditorPage } from "./universal-editor";
import { ArrowLeftIcon, MoveDownIcon, MoveUpIcon, PlusIcon, RedoIcon, ReviewIcon, TrashIcon, UndoIcon } from "./ui-icons";
import { useOlaEditor } from "./ola-panel";
import { SpecialistQuestion } from "./specialist-question";
import type { OlaTarget } from "@/lib/ola-edit";
import styles from "./simple-editor.module.css";

type ProjectRow = { id: string; company_id: string; brief: string; status: string; version: number; content_type: string; artifact_json: string | null; brand_snapshot_json: string };
function readArtifact(value: string | null): SimpleArtifact | null {
  try {
    const parsed = JSON.parse(value ?? "null") as SimpleArtifact | null;
    if (parsed?.type === "article") return { ...parsed, sections: parsed.sections.map((section, index) => ({ ...section, id: section.id ?? `page-${index + 1}` })) };
    if (parsed?.type === "presentation" || parsed?.type === "carousel") return { ...parsed, slides: parsed.slides.map((slide, index) => ({ ...slide, id: slide.id ?? `page-${index + 1}` })) };
    return parsed?.type ? parsed : null;
  }
  catch { return null; }
}

export function SimpleEditor({ initialRow }: { initialRow: ProjectRow }) {
  const [row, setRow] = useState(initialRow);
  const [artifact, setArtifact] = useState<SimpleArtifact | null>(() => readArtifact(initialRow.artifact_json));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [inlineEditing, setInlineEditing] = useState(false);
  const [canvasPending, setCanvasPending] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStarting, setReviewStarting] = useState(false);
  const reviewSeconds = useElapsedSeconds(reviewStarting || row.status === "qa");
  const [reviewFocus, setReviewFocus] = useState<CanvasReviewFocus | null>(null);
  const [chatRequestKey, setChatRequestKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageRevision, setPageRevision] = useState(0);
  const [articleEditor, setArticleEditor] = useState<Editor | null>(null);
  const [assets, setAssets] = useState<Array<{ id: string; name: string }>>([]);
  const [fonts, setFonts] = useState<Array<{ id: string; name: string }>>([]);
  const artifactRef = useRef(artifact); artifactRef.current = artifact;
  const historyGroup = useRef<string | undefined>(undefined);
  const undoStack = useRef<SimpleArtifact[]>([]);
  const redoStack = useRef<SimpleArtifact[]>([]);
  const revision = useRef(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const olaTargets: OlaTarget[] = [];
  if (artifact) {
    if (artifact.type === "post" || artifact.type === "story" || artifact.type === "poster") {
      for (const field of ["headline", "subline", ...(artifact.type === "post" ? ["caption"] : ["cta"]), "layout", "eyebrow", "assetId"])
        olaTargets.push({ label: field.charAt(0).toUpperCase() + field.slice(1), path: [field] });
      for (const field of ["background", "title", "body", "artwork", ...(artifact.type === "story" ? ["cta"] : []), ...(artifact.eyebrow ? ["eyebrow"] : [])]) olaTargets.push({ label: `${field} appearance`, path: ["visualOverrides", field] });
      if (artifact.semanticComponent) olaTargets.push({ label: "Structured visual", path: ["semanticComponent"] });
    } else {
      olaTargets.push({ label: "Project title", path: ["title"] });
      if (artifact.type === "article") for (const field of ["pageWidth", "titleSize", "headingSize", "bodySize", "background", "color"]) olaTargets.push({ label: `Article ${field}`, path: ["articleStyle", field] });
      if (artifact.type === "carousel") olaTargets.push({ label: "Caption", path: ["caption"] });
      const key = artifact.type === "article" ? "sections" : "slides";
      const parts = artifact.type === "article" ? artifact.sections : artifact.slides;
      parts.forEach((part, index) => {
        const prefix = `${artifact.type === "article" ? "Section" : "Slide"} ${index + 1}`;
        olaTargets.push({ label: prefix, path: [key, index], id: part.id });
        for (const field of ["title", "body", "semanticComponent", "layout", "eyebrow", "assetId"])
          if (field === "title" || field === "body" || artifact.type !== "article") olaTargets.push({ label: `${prefix} ${field}`, path: [key, index, field] });
        if (artifact.type !== "article") for (const field of ["background", "title", "body", "artwork", ...("eyebrow" in part && part.eyebrow ? ["eyebrow"] : [])]) olaTargets.push({ label: `${prefix} ${field} appearance`, path: [key, index, "visualOverrides", field] });
      });
    }
  }
  const ola = useOlaEditor<SimpleArtifact | null>({ projectId: row.id, stage: "simple", document: artifact, baseVersion: row.version, targets: olaTargets, onAccept: (candidate) => { if (candidate) { updateArtifact(candidate); } } });
  const brand = JSON.parse(row.brand_snapshot_json) as { colors?: string[] };
  const accent = /^#[0-9a-fA-F]{6}$/.test(brand.colors?.[1] ?? "") ? brand.colors![1] : /^#[0-9a-fA-F]{6}$/.test(brand.colors?.[0] ?? "") ? brand.colors![0] : "#7F22FE";
  const background = /^#[0-9a-fA-F]{6}$/.test(brand.colors?.[0] ?? "") ? brand.colors![0] : "#F2EDFF";

  useEffect(() => {
    if (["complete", "needs-review", "failed", "stopped"].includes(row.status)) return;
    const interval = setInterval(async () => {
      const pollingRevision = revision.current;
      const response = await fetch(`/api/content/${row.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setRow(data.project);
      if (data.artifact?.type && !dirty && pollingRevision === revision.current) {
        const next = readArtifact(JSON.stringify(data.artifact));
        setArtifact(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [row.id, row.status, dirty]);

  useEffect(() => {
    fetch(`/api/content/${row.id}/assets`).then((response) => response.ok ? response.json() : { assets: [], fonts: [] }).then((data) => {setAssets(data.assets ?? []);setFonts(data.fonts ?? []);}).catch(() => {});
  }, [row.id]);

  useEffect(() => {
    if (!dirty || saving || inlineEditing || !artifact || ola.pending || ola.working) return;
    const timer = setTimeout(() => void save(), 1800);
    return () => clearTimeout(timer);
  // Autosave follows the current artifact and persisted version.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact, dirty, saving, inlineEditing, row.version, ola.pending, ola.working]);

  function updateArtifact(next: SimpleArtifact, group?: string) {
    const current = artifactRef.current;
    if (current) next = syncArtifactComposition(current, next);
    if (current && JSON.stringify(current) === JSON.stringify(next)) return;
    if (current) {
      if (!group || historyGroup.current !== group) {
        undoStack.current.push(current);
        if (undoStack.current.length > 60) undoStack.current.shift();
      }
      historyGroup.current = group;
      redoStack.current = [];
      revision.current += 1; setHistoryVersion(value => value + 1);
    }
    const value = { ...next, quality: undefined } as SimpleArtifact;
    artifactRef.current = value; setArtifact(value); setDirty(true);
  }
  function undo() {
    historyGroup.current = undefined;
    const previous = undoStack.current.pop(); if (!previous || !artifact) return;
    redoStack.current.push(artifact); revision.current += 1; setArtifact(previous); setDirty(true); setPageRevision((value) => value + 1); setHistoryVersion((value) => value + 1);
  }
  function redo() {
    historyGroup.current = undefined;
    const next = redoStack.current.pop(); if (!next || !artifact) return;
    undoStack.current.push(artifact); revision.current += 1; setArtifact(next); setDirty(true); setPageRevision((value) => value + 1); setHistoryVersion((value) => value + 1);
  }
  void historyVersion;

  function changePage(action: "add" | "up" | "down" | "delete") {
    if (!artifact || (artifact.type !== "article" && artifact.type !== "carousel" && artifact.type !== "presentation")) return;
    ola.setTarget(null);
    const isArticle = artifact.type === "article";
    const items = isArticle ? [...artifact.sections] : [...artifact.slides];
    const index = Math.min(activeIndex, items.length - 1);
    const maximum = isArticle || artifact.type === "presentation" ? 20 : 9;
    const minimum = isArticle ? 1 : 3;
    if (action === "add" && items.length < maximum) {
      if (isArticle) updateArtifact({ ...artifact, sections: [...artifact.sections, { id: crypto.randomUUID(), title: "New section", body: "" }] });
      else updateArtifact({ ...artifact, slides: [...artifact.slides, { id: crypto.randomUUID(), title: "New slide", body: "" }] });
      setActiveIndex(items.length);
      return;
    }
    if (action === "delete" && items.length > minimum) {
      if (isArticle) updateArtifact({ ...artifact, sections: artifact.sections.filter((_, position) => position !== index) });
      else updateArtifact({ ...artifact, slides: artifact.slides.filter((_, position) => position !== index) });
      setActiveIndex(Math.min(index, items.length - 2));
      setPageRevision((value) => value + 1);
      return;
    }
    const target = action === "up" ? index - 1 : action === "down" ? index + 1 : index;
    if (target < 0 || target >= items.length || target === index) return;
    if (isArticle) {
      const sections = [...artifact.sections]; [sections[index], sections[target]] = [sections[target], sections[index]];
      updateArtifact({ ...artifact, sections });
    } else {
      const slides = [...artifact.slides]; [slides[index], slides[target]] = [slides[target], slides[index]];
      updateArtifact({ ...artifact, slides });
    }
    setActiveIndex(target);
  }

  async function save() {
    if (!artifact || saving || ola.pending || ola.working) return;
    const savingRevision = revision.current;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/content/${row.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ artifact, version: row.version }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save changes.");
      setRow(data.project);
      if (savingRevision === revision.current) { setArtifact(readArtifact(data.project.artifact_json)); setDirty(false); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes."); }
    finally { setSaving(false); }
  }

  async function retry() {
    const response = await fetch(`/api/content/${row.id}`, { method: "POST" });
    if (response.ok) setRow({ ...row, status: "queued" });
    else setError((await response.json()).error);
  }

  async function cancel() {
    const response = await fetch(`/api/content/${row.id}`, { method: "DELETE" });
    if (response.ok) setRow({ ...row, status: "stopped" });
    else setError((await response.json()).error);
  }

  async function review() {
    if (reviewStarting || row.status === "qa") return;
    if (dirty || inlineEditing || ola.pending || ola.working) { setError("Finish and save your edits before reviewing."); return; }
    setReviewStarting(true); setError(""); setReviewOpen(true);
    try {
      const response = await fetch(`/api/content/${row.id}/review`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not start review.");
      setRow((current) => ({ ...current, status: "qa" }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start review."); }
    finally { setReviewStarting(false); }
  }

  function selectReviewItem(item: ReviewItem) {
    if (!artifact) return;
    ola.setOlaMode(false);
    if (item.pageIndex !== null) setActiveIndex(item.pageIndex);
    ola.setTarget(reviewOlaTarget(artifact, item));
    setReviewFocus(current => ({ key: (current?.key ?? 0) + 1, targets: item.targets, source: reviewSource(artifact, item) }));
  }

  function askAboutReview(item: ReviewItem) {
    selectReviewItem(item);
    ola.preparePrompt(reviewFixPrompt(item));
    setReviewOpen(false);
    setChatRequestKey(current => current + 1);
  }

  const visible = ola.preview ?? artifact;
  const pages: EditorPage[] | undefined = visible?.type === "article"
    ? visible.sections.map((section, index) => ({ id: String(index), label: section.title || `Section ${index + 1}`, detail: `Section ${index + 1}` }))
    : visible?.type === "carousel" || visible?.type === "presentation"
      ? visible.slides.map((slide, index) => ({ id: String(index), label: slide.title || `Slide ${index + 1}`, detail: `Slide ${index + 1}` }))
      : undefined;
  const selectedIndex = Math.min(activeIndex, Math.max(0, (pages?.length ?? 1) - 1));
  const format = row.content_type === "story" ? "Instagram Story" : row.content_type.charAt(0).toUpperCase() + row.content_type.slice(1);
  const maxPages = artifact?.type === "carousel" ? 9 : 20;
  const minPages = artifact?.type === "article" ? 1 : 3;
  const previewNote = dirty && artifact?.type === "carousel" ? "Draft slide preview. Save to see the final render." : dirty && (artifact?.type === "post" || artifact?.type === "story") ? "The image shows the last saved render. Save to refresh it." : undefined;
  const modern = artifact?.designVersion === 2;
  const reviewItems = artifact ? editorReviewItems(artifact) : [];
  const reviewing = reviewStarting || row.status === "qa";
  const editingBlocked = ola.pending || ola.working || reviewing;
  const downloadReason = ola.pending ? "Accept or discard Ola’s proposed changes before downloading."
    : ola.working ? "Wait for Ola to finish before downloading."
    : dirty || inlineEditing || saving ? "Finish editing and wait for changes to save before downloading."
    : !["complete", "needs-review"].includes(row.status) ? "The saved draft will be available when generation or review finishes."
    : canvasPending ? "Wait for the preview to finish updating before downloading." : undefined;
  const pageActions = pages ? <>
    <IconButton variant="ghost" size="icon-sm" type="button" onClick={() => changePage("add")} disabled={ola.pending || pages.length >= maxPages} label={`Add ${artifact?.type === "article" ? "section" : "slide"}`} title={`Add ${artifact?.type === "article" ? "section" : "slide"}`}><PlusIcon size={16} /></IconButton>
    <IconButton variant="ghost" size="icon-sm" type="button" onClick={() => changePage("up")} disabled={ola.pending || selectedIndex === 0} label="Move earlier" title="Move earlier"><MoveUpIcon size={16} /></IconButton>
    <IconButton variant="ghost" size="icon-sm" type="button" onClick={() => changePage("down")} disabled={ola.pending || selectedIndex === pages.length - 1} label="Move later" title="Move later"><MoveDownIcon size={16} /></IconButton>
    <IconButton variant="ghost" size="icon-sm" type="button" onClick={() => changePage("delete")} disabled={ola.pending || pages.length <= minPages} label="Delete page" title="Delete page"><TrashIcon size={16} /></IconButton>
  </> : undefined;

  return <main className={styles.page}>
    <div className={styles.topline}><a className={styles.back} href={`/projects?company=${row.company_id}`}><ArrowLeftIcon size={15} /> All projects</a></div>
    {row.status === "failed" && <p className="form-error">Generation failed. <Button variant="outline" onClick={retry}>Retry generation</Button></p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!visible ? <div className={styles.waiting}><span className={styles.waitingIcon} aria-hidden="true">✳</span>{row.status === "awaiting-input" ? <SpecialistQuestion projectId={row.id} /> : <p>{row.status === "stopped" ? "This project was cancelled." : "Draft is being generated. This page refreshes automatically."}</p>}{!["stopped", "failed", "awaiting-input"].includes(row.status) && <Button variant="outline" onClick={cancel}>Cancel</Button>}</div> : <><UniversalEditor defaultChatOpen={!modern || visible.type === "article"} format={format} title={visible.type === "post" || visible.type === "story" || visible.type === "poster" ? visible.headline : visible.title} status={row.status} dirty={dirty || inlineEditing} saving={saving} saveDisabled={row.status === "stopped" || editingBlocked || inlineEditing} onSave={() => void save()} saveLabel="Save" pages={pages} activePage={String(selectedIndex)} onPageChange={(id) => { setActiveIndex(Number(id)); ola.setTarget(null); }} pageActions={pageActions} note={downloadReason ?? (modern ? "Changes save automatically. Downloads use the latest saved version." : previewNote)} ola={ola.panel} olaMode={ola.olaMode} onOlaModeChange={ola.setOlaMode} olaSelectionKey={ola.selectionKey} chatRequestKey={chatRequestKey} reviewOpen={reviewOpen} onReviewOpenChange={setReviewOpen} previewing={editingBlocked} actions={<><IconButton variant="ghost" size="icon-sm" type="button" label="Undo" title="Undo" disabled={ola.pending || ola.working || !undoStack.current.length} onClick={undo}><UndoIcon /></IconButton><IconButton variant="ghost" size="icon-sm" type="button" label="Redo" title="Redo" disabled={ola.pending || ola.working || !redoStack.current.length} onClick={redo}><RedoIcon /></IconButton><Button type="button" variant={reviewOpen ? "secondary" : "outline"} size="sm" aria-expanded={reviewOpen} aria-controls="editor-review-findings" onClick={() => setReviewOpen(value => !value)}><ReviewIcon /> Review{reviewItems.length > 0 && <span className="rounded-full bg-muted px-1.5 text-[10px]">{reviewItems.length}</span>}</Button>{row.status === "complete" && !dirty && !inlineEditing && !canvasPending ? <ShareButton projectId={row.id} /> : undefined}</>} primaryActions={<DownloadButton projectId={row.id} format={visible.type} disabledReason={downloadReason} needsReview={row.status === "needs-review"} />} review={<EditorReviewPanel projectId={row.id} reportKey={JSON.stringify(artifact?.quality ?? null)} items={reviewItems} summary={artifact?.quality?.summary} passed={Boolean(artifact?.quality?.pass)} open={reviewOpen} onOpenChange={setReviewOpen} onSelect={selectReviewItem} onAsk={askAboutReview} onRunReview={modern ? () => void review() : undefined} disabled={editingBlocked || dirty || inlineEditing || saving} running={reviewing} elapsedSeconds={reviewSeconds} />} formatting={visible.type === "article" ? <RichTextToolbar editor={articleEditor} disabled={ola.olaMode || ola.pending || ola.working} /> : undefined} inspector={modern && visible.type !== "article" ? undefined : <SimpleArtifactFields key={`${visible.type}-${selectedIndex}-${pageRevision}`} artifact={visible} accent={accent} companyId={row.company_id} activeIndex={selectedIndex} assets={assets} fonts={fonts} onChange={updateArtifact} onSelectionChange={ola.setTarget} />}>
      <div className={modern || visible.type === "article" ? styles.modernStage : styles.previewPanel}>
        {visible.type === "article" ? <ArticleDocumentEditor artifact={visible} activeIndex={selectedIndex} editorKey={`${pageRevision}:${ola.previewKey ?? "draft"}`} onChange={updateArtifact} onSelectionChange={ola.setTarget} onEditorReady={setArticleEditor} disabled={ola.pending || ola.working} /> : modern ? <VisualContentCanvas onUndo={undo} onRedo={redo} key={`${row.id}-${selectedIndex}`} disabled={editingBlocked} reviewFocus={reviewFocus} onEditingChange={setInlineEditing} onPreviewPendingChange={setCanvasPending} companyId={row.company_id} assets={assets} fonts={fonts} advanced={<SimpleArtifactFields artifact={visible} accent={accent} companyId={row.company_id} activeIndex={selectedIndex} assets={assets} fonts={fonts} onChange={updateArtifact} onSelectionChange={ola.setTarget} />} artifact={visible} projectId={row.id} version={row.version} activeIndex={selectedIndex} onChange={updateArtifact} onSelectionChange={ola.setTarget} onActiveIndexChange={setActiveIndex} /> : <><div className={styles.panelHeading}><span>PREVIEW</span><h2>{pages ? `${format} ${selectedIndex + 1} of ${pages.length}` : format}</h2><p>The rendered output refreshes after saving.</p></div><SimpleArtifactPreview artifact={visible} projectId={row.id} companyId={row.company_id} version={row.version} accent={accent} background={background} activeIndex={selectedIndex} dirty={dirty || ola.pending} onSelectionChange={ola.setTarget} /></>}
        {visible.researchSources.length > 0 && <details><summary>Research sources ({visible.researchSources.length})</summary><ul>{visible.researchSources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> — {source.claim}</li>)}</ul></details>}
        {visible.visualReferences && <details><summary>Visual references ({visible.visualReferences.references.length})</summary><p>{visible.visualReferences.summary}</p><ul>{visible.visualReferences.references.map((reference) => <li key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer">{reference.title}</a> — {reference.observedPattern}</li>)}</ul></details>}
        {visible.artwork.length > 0 && <details><summary>Optional web artwork ({visible.artwork.length})</summary><ul>{visible.artwork.map((item) => <li key={item.assetUrl}><a href={item.sourcePageUrl} target="_blank" rel="noreferrer">{item.title}</a> — {item.status}; rights: {item.rights}</li>)}</ul></details>}
      </div>
    </UniversalEditor></>}
  </main>;
}
