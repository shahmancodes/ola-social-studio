"use client";
import type { SimpleArtifact } from "@/lib/simple-content";
import type { SlideSpec } from "@/lib/schemas";
import { generateHTML, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { semanticComponentHtml, SEMANTIC_COMPONENT_CSS } from "@/lib/semantic-components";
import { useEffect, useRef, useState } from "react";
import { useOlaMode } from "./ola-mode";
import type { OlaTarget } from "@/lib/ola-edit";
import styles from "./simple-artifact-preview.module.css";

function DraftImage({ artifact, projectId, version, dirty, style, alt }: { artifact: SimpleArtifact; projectId: string; version: number; dirty: boolean; style: React.CSSProperties; alt: string }) {
  const [url, setUrl] = useState(`/api/content/${projectId}/preview?v=${version}`);
  const objectUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!dirty) { setUrl(`/api/content/${projectId}/preview?v=${version}`); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/content/${projectId}/draft-preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ artifact, index: 0 }), signal: controller.signal });
        if (!response.ok) return;
        const next = URL.createObjectURL(await response.blob());
        if (controller.signal.aborted) { URL.revokeObjectURL(next); return; }
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = next; setUrl(next);
      } catch { /* Keep the last visible preview while the draft is edited. */ }
    }, 320);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [artifact, projectId, version, dirty]);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  // eslint-disable-next-line @next/next/no-img-element
  return <img style={style} src={url} alt={alt} />;
}

function articleBodyHtml(bodyJson: unknown) {
  try { return generateHTML(bodyJson as JSONContent, [StarterKit]); }
  catch { return null; }
}

function ComponentPreview({ component, accent, companyId }: { component: NonNullable<SlideSpec["semanticComponent"]>; accent: string; companyId: string }) {
  const assetPath = component.assetPath ?? "";
  const illustration = assetPath.startsWith("company:")
    ? `/api/companies/${companyId}/assets/${encodeURIComponent(assetPath.slice("company:".length))}`
    : assetPath ? `/api/assets/${assetPath.split("/").map(encodeURIComponent).join("/")}` : "";
  return <div style={{ width: "100%", aspectRatio: "1080 / 760", containerType: "inline-size", position: "relative", overflow: "hidden", background: "white", "--rd-accent": accent } as React.CSSProperties}>
    <style>{SEMANTIC_COMPONENT_CSS}</style>
    <div dangerouslySetInnerHTML={{ __html: semanticComponentHtml(component, "", illustration) }} />
  </div>;
}

export function SimpleArtifactPreview({ artifact, projectId, companyId, version, accent, background, activeIndex = 0, dirty = false, onSelectionChange }: { artifact: SimpleArtifact; projectId: string; companyId: string; version: number; accent: string; background: string; activeIndex?: number; dirty?: boolean; onSelectionChange?: (target: OlaTarget) => void }) {
  const olaMode = useOlaMode();
  const pick = (label: string, path: OlaTarget["path"]) => {
    onSelectionChange?.({ label, path });
    if (!olaMode) {
      const control = Array.from(document.querySelectorAll<HTMLElement>("[data-editor-target]")).find((element) => element.dataset.editorTarget === JSON.stringify(path));
      (control?.matches("input,textarea,select") ? control : control?.querySelector<HTMLElement>("input,textarea,select"))?.focus();
    }
  };
  if (artifact.type === "post") return <>
    <div className={styles.imageTargets} data-comment-mode={olaMode || undefined}>
      <DraftImage artifact={artifact} projectId={projectId} version={version} dirty={dirty} style={{ width: "100%", borderRadius: 18 }} alt="Post preview" />
      <button type="button" data-comment-target className={`${styles.zone} ${styles.background}`} aria-label="Select post background for Ola" onClick={() => pick("Background", ["visualOverrides", "background"])} />
      <button type="button" data-comment-target className={`${styles.zone} ${styles.postTitle}`} aria-label="Select post headline for Ola" onClick={() => pick("Headline", ["headline"])} />
      <button type="button" data-comment-target className={`${styles.zone} ${styles.postSubline}`} aria-label="Select post subline for Ola" onClick={() => pick("Subline", ["subline"])} />
      {artifact.assetId || artifact.semanticComponent ? <button type="button" data-comment-target className={`${styles.zone} ${styles.postArtwork}`} aria-label="Select post artwork for Ola" onClick={() => pick(artifact.semanticComponent ? "Structured visual" : "Brand artwork", artifact.semanticComponent ? ["semanticComponent"] : ["assetId"])} /> : null}
    </div>
    <p>{dirty ? "Save to update the download." : <a href={`/api/content/${projectId}/download`}>Download PNG</a>} · Caption is editable in the controls.</p>
  </>;
  if (artifact.type === "story") return <>
    <div className={`${styles.imageTargets} ${styles.storyTargets}`} data-comment-mode={olaMode || undefined}>
      <DraftImage artifact={artifact} projectId={projectId} version={version} dirty={dirty} style={{ width: "100%", borderRadius: 18 }} alt="Instagram Story preview" />
      <button type="button" data-comment-target className={`${styles.zone} ${styles.background}`} aria-label="Select story background for Ola" onClick={() => pick("Background", ["visualOverrides", "background"])} />
      <button type="button" data-comment-target className={`${styles.zone} ${styles.storyTitle}`} aria-label="Select story headline for Ola" onClick={() => pick("Headline", ["headline"])} />
      <button type="button" data-comment-target className={`${styles.zone} ${styles.storySubline}`} aria-label="Select story subline for Ola" onClick={() => pick("Subline", ["subline"])} />
      {artifact.assetId || artifact.semanticComponent ? <button type="button" data-comment-target className={`${styles.zone} ${styles.storyArtwork}`} aria-label="Select story artwork for Ola" onClick={() => pick(artifact.semanticComponent ? "Structured visual" : "Brand artwork", artifact.semanticComponent ? ["semanticComponent"] : ["assetId"])} /> : null}
      {artifact.cta ? <button type="button" data-comment-target className={`${styles.zone} ${styles.storyCta}`} aria-label="Select story CTA for Ola" onClick={() => pick("CTA", ["cta"])} /> : null}
    </div>
    <p>{dirty ? "Save to update the download." : <a href={`/api/content/${projectId}/download`}>Download 1080 × 1920 PNG</a>}</p>
  </>;
  if (artifact.type === "article") return <>
    <div style={{ whiteSpace: "pre-wrap", background: "white", borderRadius: 16, padding: 32 }}><h2>{artifact.title}</h2>{artifact.sections.map((section, index) => { if (index !== activeIndex) return null; const html = section.bodyJson ? articleBodyHtml(section.bodyJson) : null; return <section key={index}><h3>{section.title}</h3>{html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <p>{section.body}</p>}{section.semanticComponent && <ComponentPreview component={section.semanticComponent} accent={accent} companyId={companyId} />}</section>; })}</div>
    <p>{dirty ? "Save to update the downloads." : <><a href={`/api/content/${projectId}/download?format=html`}>Download HTML</a> · <a href={`/api/content/${projectId}/download?format=md`}>Download Markdown</a></>}</p>
  </>;
  if (artifact.type === "carousel") return <>
    <div style={{ maxWidth: 540, margin: "0 auto" }}>{artifact.slides.map((slide, index) => index !== activeIndex ? null : dirty || index >= artifact.imagePaths.length ? <div key={index} style={{ aspectRatio: "4/5", background, borderRadius: 12, padding: "12% 9%", boxSizing: "border-box", color: "#111" }}><small style={{ color: accent }}>Draft slide {index + 1}</small><h2 style={{ fontSize: "clamp(24px, 4vw, 42px)", lineHeight: 1.1 }}>{slide.title}</h2><p style={{ fontSize: "clamp(15px, 2vw, 22px)", lineHeight: 1.4 }}>{slide.body}</p></div> : /* eslint-disable-next-line @next/next/no-img-element */ <img key={index} src={`/api/content/${projectId}/preview?slide=${index + 1}&v=${version}`} alt={`Slide ${index + 1}: ${slide.title}`} style={{ display: "block", width: "100%", borderRadius: 12 }} />)}</div>
    <p>{dirty ? "Save to render and download the updated carousel." : <a href={`/api/content/${projectId}/download`}>Download carousel ZIP</a>}</p>
  </>;
  return <>
    <div style={{ display: "grid", gap: 16 }}>{artifact.slides.map((slide, index) => index !== activeIndex ? null : <div key={index} style={{ aspectRatio: "16/9", background, padding: "2% 6%", borderRadius: 14, overflow: "hidden", position: "relative" }}><small>{index + 1}</small><h2 style={{ margin: "3% 0 1%" }}>{slide.title}</h2><p style={{ margin: 0 }}>{slide.body}</p>{slide.semanticComponent && <div style={{ position: "absolute", left: "27.75%", top: "36.7%", width: "44.25%" }}><ComponentPreview component={slide.semanticComponent} accent={accent} companyId={companyId} /></div>}</div>)}</div>
    <p>{dirty ? "Save to update the deck." : <a href={`/api/content/${projectId}/download`}>Download editable PPTX</a>}</p>
  </>;
}
