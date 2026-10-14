"use client";
import { useLayoutEffect, useRef, type CSSProperties, type TextareaHTMLAttributes } from "react";
import type { Editor } from "@tiptap/core";
import type { SimpleArtifact } from "@/lib/simple-content";
import type { OlaTarget } from "@/lib/ola-edit";
import { RichTextField } from "./rich-text-field";
import { useOlaMode } from "./ola-mode";
import styles from "./article-document-editor.module.css";

type Article = Extract<SimpleArtifact, { type: "article" }>;

function DocumentHeading(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    const resize = () => { field.style.height = "auto"; field.style.height = `${field.scrollHeight}px`; };
    resize();
    let width = field.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = field.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth; resize(); }
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [props.value, props.style?.fontSize]);
  return <textarea {...props} ref={ref} rows={1} />;
}

export function ArticleDocumentEditor({ artifact, activeIndex, editorKey, onChange, onSelectionChange, onEditorReady, disabled = false }: { artifact: Article; activeIndex: number; editorKey: number | string; onChange: (next: SimpleArtifact) => void; onSelectionChange?: (target: OlaTarget) => void; onEditorReady: (editor: Editor | null) => void; disabled?: boolean }) {
  const olaMode = useOlaMode();
  const section = artifact.sections[activeIndex];
  if (!section) return null;
  const appearance = artifact.articleStyle;
  return <div className={styles.paper} data-comment-mode={olaMode || undefined} style={{ width: appearance?.pageWidth ? `min(100%, ${appearance.pageWidth}px)` : undefined, background: appearance?.background, color: appearance?.color, "--article-body-size": appearance?.bodySize ? `${appearance.bodySize}px` : undefined, "--article-color": appearance?.color } as CSSProperties}>
    <span className={styles.kicker}>Article draft</span>
    <DocumentHeading data-comment-target className={styles.title} style={{ fontSize: appearance?.titleSize, color: appearance?.color }} aria-label="Article title" value={artifact.title} readOnly={disabled || olaMode} onClick={() => onSelectionChange?.({ label: "Article title", path: ["title"] })} onChange={(event) => onChange({ ...artifact, title: event.target.value })} />
    <div className={styles.sectionMeta}>Section {activeIndex + 1} of {artifact.sections.length}</div>
    <DocumentHeading data-comment-target className={styles.sectionTitle} style={{ fontSize: appearance?.headingSize, color: appearance?.color }} aria-label="Section title" value={section.title} readOnly={disabled || olaMode} onClick={() => onSelectionChange?.({ label: `Section ${activeIndex + 1} title`, path: ["sections", activeIndex, "title"] })} onChange={(event) => onChange({ ...artifact, sections: artifact.sections.map((item, index) => index === activeIndex ? { ...item, title: event.target.value } : item) })} />
    <div data-comment-target role={olaMode ? "button" : undefined} tabIndex={olaMode ? 0 : undefined} aria-label={olaMode ? `Comment on section ${activeIndex + 1} body` : undefined} onClick={() => onSelectionChange?.({ label: `Section ${activeIndex + 1} body`, path: ["sections", activeIndex, "body"] })} onKeyDown={(event) => { if (olaMode && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectionChange?.({ label: `Section ${activeIndex + 1} body`, path: ["sections", activeIndex, "body"] }); } }} onFocusCapture={() => onSelectionChange?.({ label: `Section ${activeIndex + 1} body`, path: ["sections", activeIndex, "body"] })}><RichTextField key={`${activeIndex}-${editorKey}`} body={section.body} bodyJson={section.bodyJson} onEditorReady={onEditorReady} disabled={disabled || olaMode} onChange={(bodyJson, body) => onChange({ ...artifact, sections: artifact.sections.map((item, index) => index === activeIndex ? { ...item, body, bodyJson } : item) })} /></div>
  </div>;
}
