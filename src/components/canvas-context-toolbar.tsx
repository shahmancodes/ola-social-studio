"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Crop, ImagePlus, LayoutTemplate, Move, RotateCcw, X } from "lucide-react";
import type { CanvasPreview, CanvasText } from "@/lib/canvas-text";
import type { CopyPage } from "@/lib/composition";
import type { TextAppearance } from "@/lib/editor-appearance";
import { CanvasLayoutChoices } from "./canvas-layout-choices";
import styles from "./canvas-controls.module.css";
import { TextboxControls } from "./textbox-controls";
import { FontPicker } from "./font-picker";
import { typographyIssues } from '@/lib/design-typography';

export type CanvasSelection = { kind: "text"; id: string } | { kind: "image" } | { kind: "background" };
export function CanvasContextToolbar({ selection, target, preview, page, width, assets, fonts, companyId, onChange, onStyle, onClose, onCropMode, cropMode }: {
  selection: CanvasSelection; target?: CanvasText; preview: CanvasPreview; page: CopyPage; width: number;
  assets: Array<{ id: string; name: string }>; fonts: Array<{ id: string; name: string }>; companyId: string;
  onChange: (page: CopyPage) => void; onStyle: (patch: TextAppearance) => void; onClose: () => void;
  cropMode: boolean; onCropMode: (enabled: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [toolbarWidth, setToolbarWidth] = useState(420);
  useLayoutEffect(() => { const el = ref.current; if (!el) return; const observer = new ResizeObserver(([entry]) => setToolbarWidth(entry.contentRect.width)); observer.observe(el); return () => observer.disconnect(); }, []);
  const scale = width / preview.width;
  const box = selection.kind === "text" ? target : selection.kind === "image" ? preview.artwork : undefined;
  const top = Math.max(8, (box?.y ?? 0) * scale - 60);
  const left = Math.max(0, Math.min((box?.x ?? 0) * scale, width - toolbarWidth));
  const textStyle = target ? page.editorAppearance?.text?.[target.id] : undefined;
  const crop = page.editorAppearance?.image?.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  function cropZoom(zoom: number) {
    const size = 1 / zoom;
    onChange({ ...page, editorAppearance: { ...page.editorAppearance, image: { ...page.editorAppearance?.image, crop: { width: size, height: size, x: Math.min(1 - size, Math.max(0, crop.x + (crop.width - size) / 2)), y: Math.min(1 - size, Math.max(0, crop.y + (crop.height - size) / 2)) } } } });
  }
  return <div ref={ref} className={styles.toolbar} style={{ top, left }} data-canvas-toolbar role="toolbar" aria-label={selection.kind === "text" ? "Text formatting" : selection.kind === "image" ? "Image controls" : "Page design"} onPointerDown={event => { if ((event.target as HTMLElement).closest("button")) event.preventDefault(); }}>
    {selection.kind === "text" && target ? <>
      <FontPicker fonts={fonts} value={textStyle ?? {}} onChange={onStyle}/>
      <input className={styles.size} type="number" aria-label="Text size" min={12} max={180} value={Math.round(textStyle?.fontSize ?? target.fontSize)} onChange={e => { const value = Number(e.target.value); if (value >= 12 && value <= 180) onStyle({ fontSize: value }); }} />
      <input type="color" aria-label="Text color" title="Text color" value={textStyle?.color ?? target.color} onChange={e => onStyle({ color: e.target.value })}/>
      {([['bold', Bold, textStyle?.bold ?? target.fontWeight >= 700], ['italic', Italic, textStyle?.italic ?? target.italic ?? false], ['underline', Underline, textStyle?.underline ?? target.underline ?? false]] as const).map(([key, Icon, active]) => <button type="button" key={key} aria-label={key[0].toUpperCase()+key.slice(1)} aria-pressed={active} onClick={() => onStyle({ [key]: !active })}><Icon size={16}/></button>)}
      <span className={styles.separator}/>
      {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([align, Icon]) => <button type="button" key={align} aria-label={`Align ${align}`} aria-pressed={(textStyle?.align ?? target.align) === align} onClick={() => onStyle({ align })}><Icon size={16}/></button>)}
      <TextboxControls target={target} appearance={textStyle} onStyle={onStyle}/>
      <details className={styles.menu}><summary>Typography</summary><div className={styles.popover}>
        <label className={styles.inlineLabel}>Line height<input type="number" aria-label="Line height" min={.95} max={1.65} step={.05} value={textStyle?.leading??target.typography?.leading??1.15} onChange={e=>{const n=Number(e.target.value);if(n>=.95&&n<=1.65)onStyle({leading:n});}}/></label>
        <label className={styles.inlineLabel}>Letter spacing (em)<input type="number" aria-label="Letter spacing" min={-.06} max={.16} step={.005} value={textStyle?.tracking??target.typography?.tracking??0} onChange={e=>{const n=Number(e.target.value);if(n>=-.06&&n<=.16)onStyle({tracking:n});}}/></label>
        <label className={styles.inlineLabel}>Break after words<input key={target.id+'-breaks'} aria-label="Break after words" placeholder="2, 5" defaultValue={(textStyle?.breakAfter??target.typography?.breakAfter??[]).join(', ')} onBlur={e=>{const breaks=e.target.value.trim()?e.target.value.split(',').map(v=>Number(v.trim())):[];const issues=breaks.length>8||breaks.some(n=>!Number.isInteger(n)||n<1)?['Use up to eight word numbers.']:typographyIssues(target.text,{breakAfter:breaks});e.target.setCustomValidity(issues[0]??'');if(issues.length)e.target.reportValidity();else onStyle({breakAfter:breaks});}}/></label>
        <label className={styles.inlineLabel}>Emphasize a phrase<input key={target.id+'-emphasis'} aria-label="Emphasize a phrase" placeholder="Words already in this text" defaultValue={(()=>{const span=(textStyle?.emphasis??target.typography?.emphasis)?.[0];return span?(target.text.match(/\S+/g)??[]).slice(span.start,span.end).join(" "):"";})()} onBlur={e=>{const words=target.text.match(/\S+/g)??[],phrase=e.target.value.match(/\S+/g)??[];const start=words.findIndex((_,i)=>phrase.every((w,j)=>words[i+j]===w));if(!phrase.length){onStyle({emphasis:[]});return;}e.target.setCustomValidity(start<0?'Use an exact phrase from this text.':'');if(start<0)e.target.reportValidity();else onStyle({emphasis:[{start,end:start+phrase.length,treatment:'accent'}]});}}/></label>
      </div></details>
    </> : selection.kind === "image" ? <>
      <details className={styles.menu}><summary><ImagePlus size={16}/> Replace</summary><div className={styles.popover}><AssetChoices assets={assets} companyId={companyId} selected={page.assetId} onSelect={id => onChange({ ...page, assetId: id, editorAppearance: { ...page.editorAppearance, image: undefined } })}/></div></details>
      {page.assetId && <button type="button" aria-label="Crop image" aria-pressed={cropMode} disabled={page.composition?.responsive?.visual.treatment === "annotated"} title={page.composition?.responsive?.visual.treatment === "annotated" ? "Keep the full image so annotation points stay accurate" : "Crop image"} onClick={() => onCropMode(!cropMode)}><Crop size={16}/> Crop</button>}
      {cropMode ? <><label className={styles.inlineLabel}>Zoom<input type="range" aria-label="Crop zoom" min={1} max={4} step={.05} value={1 / crop.width} onChange={e => cropZoom(Number(e.target.value))}/></label><button type="button" aria-label="Reset crop" onClick={() => onChange({ ...page, editorAppearance: { ...page.editorAppearance, image: { ...page.editorAppearance?.image, crop: undefined } } })}><RotateCcw size={16}/></button></> : <span className={styles.hint}><Move size={14}/> Drag to position</span>}
    </> : <>
      <input type="color" aria-label="Background color" title="Background color" value={page.visualOverrides?.background ?? preview.color} onChange={e => onChange({ ...page, visualOverrides: { ...page.visualOverrides, background: e.target.value } })}/>
      <details className={styles.menu}><summary><LayoutTemplate size={16}/> Layout</summary><div className={styles.popover}><CanvasLayoutChoices page={page} onChange={onChange}/>{page.composition && <><p className={styles.groupLabel}>Spacing</p><div className={styles.segmented}>{([['compact','Close'],['balanced','Balanced'],['airy','Spacious']] as const).map(([density, label]) => <button type="button" key={density} aria-pressed={page.composition!.tuning.density === density} onClick={() => onChange({ ...page, composition: { ...page.composition!, tuning: { ...page.composition!.tuning, density } } })}>{label}</button>)}</div><label className={styles.check}><input type="checkbox" checked={page.composition.tuning.mirror} onChange={e => onChange({ ...page, composition: { ...page.composition!, tuning: { ...page.composition!.tuning, mirror: e.target.checked } } })}/> Swap sides</label><p className={styles.hint}>For a column layout, drag the divider on the page to adjust the balance.</p></>}</div></details>
      {page.composition?.responsive&&<details className={styles.menu}><summary>Composition</summary><div className={styles.popover}>
        <label className={styles.inlineLabel}>Rule<select aria-label="Composition rule" value={page.composition.responsive.craft?.rule??'none'} onChange={e=>{const responsive=page.composition!.responsive!;onChange({...page,composition:{...page.composition!,responsive:{...responsive,craft:{version:1,surface:'background',horizontalAnchor:'left',measure:1,distribution:'packed',stagger:0,...responsive.craft,rule:e.target.value as 'none'|'top'|'inset'}}}});}}>{['none','top','inset'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label className={styles.inlineLabel}>Surface<select aria-label="Composition surface" value={page.composition.responsive.craft?.surface??'background'} onChange={e=>{const responsive=page.composition!.responsive!;onChange({...page,composition:{...page.composition!,responsive:{...responsive,craft:{version:1,horizontalAnchor:'left',measure:1,distribution:'packed',stagger:0,...responsive.craft,surface:e.target.value as 'background'|'alternate'|'dark'|'accent'}}}});}}>{['background','alternate','dark','accent'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label className={styles.inlineLabel}>Content width<input type="range" aria-label="Content width" min={.65} max={1} step={.05} value={page.composition.responsive.craft?.measure??1} onChange={e=>{const responsive=page.composition!.responsive!;onChange({...page,composition:{...page.composition!,responsive:{...responsive,craft:{version:1,surface:'background',horizontalAnchor:'left',distribution:'packed',stagger:0,...responsive.craft,measure:Number(e.target.value)}}}});}}/></label>
      </div></details>}
      <details className={styles.menu}><summary><ImagePlus size={16}/> Image</summary><div className={styles.popover}><AssetChoices assets={assets} companyId={companyId} selected={page.assetId} onSelect={id => onChange({ ...page, assetId: id, editorAppearance: { ...page.editorAppearance, image: undefined } })}/></div></details>
    </>}
    <button type="button" aria-label="Close canvas controls" onClick={onClose}><X size={15}/></button>
  </div>;
}
function AssetChoices({ assets, companyId, selected, onSelect }: { assets: Array<{ id: string; name: string }>; companyId: string; selected?: string; onSelect: (id: string) => void }) {
  if (!assets.length) return <p className={styles.hint}>Add images to your brand library to use them here.</p>;
  return <div className={styles.assets} role="group" aria-label="Choose an image">{assets.map(asset => <button type="button" key={asset.id} aria-pressed={selected === asset.id} onClick={() => onSelect(asset.id)}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/companies/${companyId}/assets/${asset.id}`} alt=""/><span>{asset.name}</span></button>)}</div>;
}
