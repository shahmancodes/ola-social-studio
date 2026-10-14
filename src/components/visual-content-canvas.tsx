"use client";

import { useEffect, useRef, useState } from "react";
import type { SimpleArtifact } from "@/lib/simple-content";
import type { OlaTarget } from "@/lib/ola-edit";
import { useOlaMode } from "./ola-mode";
import styles from "./visual-content-canvas.module.css";
import { STORY_SAFE_AREA } from "@/lib/story-safe-area";

type VisualArtifact = Extract<SimpleArtifact, { type: "post" | "story" | "carousel" | "presentation" }>;
type Field = "title" | "body";

function pageFields(artifact: VisualArtifact, index: number) {
  return artifact.type === "post" || artifact.type === "story"
    ? { title: artifact.headline, body: artifact.subline, layout: artifact.layout ?? "split" }
    : { title: artifact.slides[index]?.title ?? "", body: artifact.slides[index]?.body ?? "", layout: artifact.slides[index]?.layout ?? "hero" };
}

export function VisualContentCanvas({ artifact, projectId, version, activeIndex, onChange, onSelectionChange, onActiveIndexChange }: { artifact: VisualArtifact; projectId: string; version: number; activeIndex: number; onChange: (next: SimpleArtifact) => void; onSelectionChange?: (target: OlaTarget) => void; onActiveIndexChange?: (index: number) => void }) {
  const olaMode = useOlaMode();
  const [url, setUrl] = useState(`/api/content/${projectId}/preview?slide=${activeIndex + 1}&v=${version}`);
  const [editing, setEditing] = useState<Field | null>(null);
  const [error, setError] = useState("");
  const [showStoryGuide, setShowStoryGuide] = useState(true);
  const [showInstagramUi, setShowInstagramUi] = useState(false);
  const objectUrl = useRef<string | null>(null);
  const revision = useRef(0);
  const fields = pageFields(artifact, activeIndex);
  useEffect(() => {
    const current = ++revision.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/content/${projectId}/draft-preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ artifact, index: activeIndex }), signal: controller.signal });
        if (!response.ok) throw new Error((await response.json()).error ?? "Preview unavailable.");
        const next = URL.createObjectURL(await response.blob());
        if (current !== revision.current) { URL.revokeObjectURL(next); return; }
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = next; setUrl(next); setError("");
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Preview unavailable."); }
    }, 380);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [artifact, activeIndex, projectId]);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  function change(field: Field, value: string) {
    if (artifact.type === "post" || artifact.type === "story") onChange({ ...artifact, [field === "title" ? "headline" : "subline"]: value });
    else onChange({ ...artifact, slides: artifact.slides.map((slide, index) => index === activeIndex ? { ...slide, [field]: value } : slide) });
  }
  function select(field: Field) {
    const path = artifact.type === "post" || artifact.type === "story" ? [field === "title" ? "headline" : "subline"] : ["slides", activeIndex, field];
    onSelectionChange?.({ label: field === "title" ? "Title" : "Body", path });
    if (!olaMode) setEditing(field);
  }
  useEffect(() => { setEditing(null); }, [olaMode, activeIndex]);
  const appearancePath = artifact.type === "post" || artifact.type === "story" ? ["visualOverrides"] : ["slides", activeIndex, "visualOverrides"];
  const titleBox = fields.layout === "split" ? styles.titleSplit : fields.layout === "statement" || fields.layout === "closing" ? styles.titleStatement : styles.titleDefault;
  const bodyBox = fields.layout === "split" ? styles.bodySplit : fields.layout === "statement" || fields.layout === "closing" ? styles.bodyStatement : styles.bodyDefault;
  const storyTitleBox = artifact.type === "story" && artifact.storyTreatment ? styles[`storyTitle${artifact.storyTreatment === "quick-tip" ? "Tip" : artifact.storyTreatment === "announcement" ? "Announcement" : artifact.storyTreatment === "image-showcase" ? "Showcase" : "Conversation"}`] : titleBox;
  const storyBodyBox = artifact.type === "story" && artifact.storyTreatment ? styles[`storyBody${artifact.storyTreatment === "quick-tip" ? "Tip" : artifact.storyTreatment === "announcement" ? "Announcement" : artifact.storyTreatment === "image-showcase" ? "Showcase" : "Conversation"}`] : bodyBox;
  return <div className={styles.wrap} data-comment-mode={olaMode || undefined}>
    {artifact.type === "story" && <div className={styles.storyControls}><button type="button" aria-pressed={showStoryGuide} onClick={() => setShowStoryGuide((value) => !value)}>Safe area {showStoryGuide ? "on" : "off"}</button><button type="button" aria-pressed={showInstagramUi} onClick={() => setShowInstagramUi((value) => !value)}>Instagram interface {showInstagramUi ? "on" : "off"}</button></div>}
    <div className={`${styles.canvas} ${artifact.type === "presentation" ? styles.wide : artifact.type === "story" ? styles.tall : styles.portrait}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Live ${artifact.type} preview`} />
      {artifact.type === "story" && showStoryGuide && <div className={styles.safeArea} style={{ top: `${STORY_SAFE_AREA.top / STORY_SAFE_AREA.height * 100}%`, bottom: `${(STORY_SAFE_AREA.height - STORY_SAFE_AREA.bottom) / STORY_SAFE_AREA.height * 100}%` }} aria-hidden="true"><span>KEEP TEXT INSIDE</span></div>}
      {artifact.type === "story" && showInstagramUi && <div className={styles.instagramUi} aria-hidden="true"><div className={styles.instagramTop}>◯ &nbsp; your story <span>×</span></div><div className={styles.instagramBottom}>Send message… <span>♡ &nbsp; ↗</span></div></div>}
      <button type="button" data-comment-target className={styles.backgroundTarget} aria-label="Select page background for Ola" title="Select background for Ola" onClick={() => onSelectionChange?.({ label: "Background appearance", path: [...appearancePath, "background"] })} />
      {fields.layout === "split" ? <button type="button" data-comment-target className={styles.artworkTarget} aria-label="Select artwork for Ola" title="Select artwork for Ola" onClick={() => onSelectionChange?.({ label: "Artwork appearance", path: [...appearancePath, "artwork"] })} /> : null}
      {(["title", "body"] as const).map((field) => editing === field ? <textarea key={field} autoFocus aria-label={`Edit ${field} on canvas`} className={`${styles.inline} ${field === "title" ? storyTitleBox : storyBodyBox}`} value={fields[field]} onChange={(event) => change(field, event.target.value)} onBlur={() => setEditing(null)} onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }} /> : <button key={field} type="button" data-comment-target className={`${styles.hotspot} ${field === "title" ? storyTitleBox : storyBodyBox}`} aria-label={`${olaMode ? "Comment on" : "Edit"} ${field} on canvas`} title={`${olaMode ? "Comment on" : "Click to edit"} ${field}`} onClick={() => select(field)}><span>{olaMode ? "Comment on" : "Edit"} {field}</span></button>)}
    </div>
    {artifact.type === "carousel" && <div className={styles.thumbnailStrip} aria-label="Carousel slide order">{artifact.slides.map((slide, index) => <button type="button" key={slide.id ?? index} onClick={() => onActiveIndexChange?.(index)} aria-current={index === activeIndex ? "true" : undefined} aria-label={`Open slide ${index + 1}: ${slide.title}`} className={`${styles.thumbnail} ${index === activeIndex ? styles.thumbnailActive : ""}`}><span>{index + 1}</span>{artifact.imagePaths[index] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/content/${projectId}/preview?slide=${index + 1}&v=${version}`} alt="" /> : <strong>{slide.title}</strong>}<small>{slide.role ?? "Slide"}</small></button>)}</div>}
    {artifact.type === "carousel" && <label className={styles.captionEditor}><strong>Caption</strong><textarea value={artifact.caption} onChange={(event) => onChange({ ...artifact, caption: event.target.value })} rows={4} aria-label="Carousel caption" /></label>}
    {(artifact.type === "story" || artifact.type === "carousel") && <a className={styles.exportLink} href={`/api/content/${projectId}/download`}>Export {artifact.type === "story" ? "1080 × 1920 PNG" : "ordered slides and caption ZIP"}</a>}
    {error && <p className={styles.error} role="status">{error}</p>}
    <p className={styles.help}>{olaMode ? "Select a component to add a comment for Ola." : "Click text to edit it. Use the controls for layout and artwork."}</p>
  </div>;
}
