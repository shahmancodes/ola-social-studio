"use client";

import { COMPOSITION_FAMILIES, type CopyPage, type Composition } from "@/lib/composition";
import { VISUAL_LAYOUTS } from "@/lib/visual-layout-types";
import styles from "./canvas-controls.module.css";

const LABELS: Record<string, string> = { "oversized-typography": "Big headline", "asymmetric-editorial": "Side by side", "image-led": "Image first", "diagram-led": "Visual story", comparison: "Compare", "modular-grid": "Cards", hero: "Spotlight", split: "Side by side", steps: "Step by step", statement: "Big headline", diagram: "Visual story", closing: "Closing note" };
function LayoutThumbnail({ layout }: { layout: string }) {
  const columns = ["asymmetric-editorial", "split", "comparison"].includes(layout);
  const image = layout === "image-led";
  const grid = ["modular-grid", "steps", "diagram", "diagram-led"].includes(layout);
  return <svg viewBox="0 0 100 68" aria-hidden="true"><rect x="1" y="1" width="98" height="66" rx="6" fill="var(--card)" stroke="var(--border)" />{image ? <><rect x="10" y="9" width="80" height="30" rx="3" fill="currentColor" opacity=".2"/><path d="M10 47H75M10 55H60" stroke="currentColor" strokeWidth="4"/></> : columns ? <><rect x="10" y="12" width="34" height="32" rx="2" fill="currentColor"/><path d="M56 28H89M56 36H85M56 44H89M56 52H78" stroke="currentColor" strokeWidth="3" opacity=".5"/></> : grid ? <><path d="M10 14H75M10 22H55" stroke="currentColor" strokeWidth="4"/>{[10,38,66].map(x=><rect key={x} x={x} y="35" width="24" height="22" rx="3" fill="currentColor" opacity=".25"/>)}</> : <><path d="M10 16H84M10 29H68" stroke="currentColor" strokeWidth="8"/><path d="M10 48H86M10 55H67" stroke="currentColor" strokeWidth="3" opacity=".5"/></>}</svg>;
}
export function CanvasLayoutChoices({ page, onChange }: { page: CopyPage; onChange: (next: CopyPage) => void }) {
  const current = page.composition?.family ?? page.layout ?? "hero";
  const layouts = page.composition ? COMPOSITION_FAMILIES.filter(f => (f !== "image-led" || page.assetId) && (f !== "diagram-led" || page.semanticComponent) && (f !== "comparison" || page.composition?.bodyMode === "comparison" || page.semanticComponent?.kind === "comparison")) : VISUAL_LAYOUTS;
  function choose(layout: string) {
    if (!page.composition) { onChange({ ...page, layout: layout as NonNullable<CopyPage["layout"]> }); return; }
    const c = page.composition;
    onChange({ ...page, composition: { ...c, family: layout as Composition["family"], responsive: c.responsive ? { ...c.responsive, arrangement: "auto", adjustments: c.responsive.adjustments.filter(a => a.action !== "reflow") } : undefined } });
  }
  return <div className={styles.layoutChoices} role="group" aria-label="Page layout">{layouts.map(layout => <button type="button" key={layout} className={styles.layoutChoice} aria-pressed={current === layout} onClick={() => choose(layout)}><LayoutThumbnail layout={layout}/><span>{LABELS[layout]}</span></button>)}</div>;
}
