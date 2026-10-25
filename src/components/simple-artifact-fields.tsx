"use client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { SimpleArtifact } from "@/lib/simple-content";
import type { SlideSpec } from "@/lib/schemas";
import type { OlaTarget } from "@/lib/ola-edit";
import { createSemanticComponent, SEMANTIC_COMPONENT_CHOICES, type SemanticKind } from "@/lib/semantic-component-presets";
import { SemanticComponentFields } from "./semantic-component-fields";
import { VISUAL_LAYOUTS, type VisualLayout } from "@/lib/visual-layout-types";
import { ResponsiveLayoutSchema } from "@/lib/composition-design";
import { artifactPages, withArtifactPages, resolvedComponent, COMPOSITION_FAMILIES, syncArtifactComposition, type Composition, type CopyPage } from "@/lib/composition";

import controlStyles from "./canvas-controls.module.css";
import { DESIGN_RECIPES,recipeIssues,recipeProfile } from '@/lib/design-recipes';

type Component = NonNullable<SlideSpec["semanticComponent"]>;

function ComponentControl({ value, accent, companyId, onChange, onSelect, locked = false }: { value?: Component; accent: string; companyId: string; onChange: (next: Component | undefined) => void; onSelect?: () => void; locked?: boolean }) {
  return <details onClickCapture={onSelect} onFocusCapture={onSelect} style={{ margin: "16px 0", borderTop: "1px solid #e7e7eb", paddingTop: 12 }}>
    <summary>Structured visual{value ? ` · ${SEMANTIC_COMPONENT_CHOICES.find((choice) => choice.kind === value.kind)?.name ?? value.kind}` : " · none"}</summary>
    <label><span>Component</span><NativeSelect disabled={locked} value={value?.kind ?? ""} onChange={(event) => onChange(event.target.value ? createSemanticComponent(event.target.value as SemanticKind) : undefined)}>
      <NativeSelectOption value="">None</NativeSelectOption>{SEMANTIC_COMPONENT_CHOICES.map((choice) => <NativeSelectOption value={choice.kind} key={choice.kind}>{choice.name}</NativeSelectOption>)}
    </NativeSelect></label>
    {value && <SemanticComponentFields lockStructure={locked} component={value} accent={accent} companyId={companyId} onChange={(patch) => onChange({ ...value, ...patch })} />}
  </details>;
}

type FieldsProps = { artifact: SimpleArtifact; accent: string; companyId: string; activeIndex?: number; assets?: Array<{ id: string; name: string }>; fonts?: Array<{ id: string; name: string }>; onChange: (next: SimpleArtifact) => void; onSelectionChange?: (target: OlaTarget) => void };

export function SimpleArtifactFields(props: FieldsProps) {
  if (props.artifact.designVersion === 2 && props.artifact.type !== "article") return <AdvancedVisualFields {...props}/>;
  const pages = artifactPages(props.artifact), page = pages[props.activeIndex ?? 0];
  if (!page?.composition) return <LegacyFields {...props} />;
  const update = (patch: Partial<Composition>) => props.onChange(withArtifactPages(props.artifact, pages.map((p, i) => i === (props.activeIndex ?? 0) ? { ...p, composition: { ...p.composition!, ...patch } } : p)));
  const display = withArtifactPages(props.artifact, pages.map(p=>({...p,semanticComponent:resolvedComponent(p)})));
  const c = page.composition;
  return <>
    <CompositionControls {...props}/>
    <LegacyFields {...props} artifact={display} onChange={next=>props.onChange(syncArtifactComposition(props.artifact,next))}/>
  </>;
}

function CompositionControls(props:FieldsProps) {
  const pages=artifactPages(props.artifact),page=pages[props.activeIndex??0],c=page?.composition;if(!c)return null;
  const update=(patch:Partial<Composition>)=>props.onChange(withArtifactPages(props.artifact,pages.map((p,i)=>i===(props.activeIndex??0)?{...p,composition:{...p.composition!,...patch}}:p)));
  return (
    <details style={{marginBottom:20}} onClickCapture={()=>props.onSelectionChange?.({label:'Composition',path:props.artifact.type==='carousel'||props.artifact.type==='presentation'?['slides',props.activeIndex??0,'composition']:['composition']})}><summary>Composition</summary>
      <p className="text-xs text-muted-foreground">{c.intent.goal} · {c.intent.reason}</p>
      <label><span>Design recipe</span><NativeSelect value={c.recipe?.id??''} onChange={e=>{const recipe=DESIGN_RECIPES.find(r=>r.id===e.target.value);update({recipe:recipe?{version:1,id:recipe.id}:undefined,...(recipe?{family:recipe.family,responsive:{...c.responsive!,anchor:recipeProfile(recipe.id,props.artifact.type==='article'?'poster':props.artifact.type).anchor,visualWeight:recipeProfile(recipe.id,props.artifact.type==='article'?'poster':props.artifact.type).weight}}:{})});}}><NativeSelectOption value="">Custom composition</NativeSelectOption>{DESIGN_RECIPES.map(r=><NativeSelectOption key={r.id} value={r.id} disabled={recipeIssues(page,{...c,family:r.family,recipe:{version:1,id:r.id}}).length>0}>{r.name}</NativeSelectOption>)}</NativeSelect></label>
      {c.recipe&&<p className="text-xs text-muted-foreground">Native format variant · {DESIGN_RECIPES.find(r=>r.id===c.recipe!.id)?.needs} The recipe controls its main arrangement; local spacing, scale and brand-font edits remain available.</p>}
      <label><span>Composition family</span><NativeSelect value={c.family} onChange={e=>update({family:e.target.value as Composition['family'],recipe:undefined})}>{COMPOSITION_FAMILIES.filter(f=>(f!=="image-led"||page.assetId)&&(f!=="diagram-led"||page.semanticComponent||page.visualContent)&&(f!=="comparison"||c.bodyMode==='comparison'||page.semanticComponent?.kind==='comparison'||page.visualContent?.kind==='comparison')).map(f=><NativeSelectOption key={f} value={f}>{f.replaceAll('-',' ')}</NativeSelectOption>)}</NativeSelect></label>
      {!c.responsive ? <button type="button" onClick={()=>update({responsive:ResponsiveLayoutSchema.parse({version:1})})}>Use content-responsive layout</button> : <>
        <label><span>Arrangement</span><NativeSelect value={c.responsive.arrangement} onChange={e=>update({responsive:{...c.responsive!,arrangement:e.target.value as 'auto'|'stack'|'columns'}})}>{['auto','stack','columns'].map(v=><NativeSelectOption key={v} value={v}>{v}</NativeSelectOption>)}</NativeSelect></label>
        <label><span>Group position</span><NativeSelect value={c.responsive.anchor} onChange={e=>update({responsive:{...c.responsive!,anchor:e.target.value as 'start'|'center'|'end'}})}>{['start','center','end'].map(v=><NativeSelectOption key={v} value={v}>{v}</NativeSelectOption>)}</NativeSelect></label>
        <label><span>Focal point</span><NativeSelect value={c.responsive.focal} onChange={e=>update({responsive:{...c.responsive!,focal:e.target.value as 'title'|'artwork'}})}><NativeSelectOption value="title">Headline</NativeSelectOption>{(page.assetId||page.semanticComponent||page.visualContent)&&<NativeSelectOption value="artwork">Visual</NativeSelectOption>}</NativeSelect></label>
        <label><span>Group spacing</span><Input type="number" min="0.008" max="0.08" step="0.005" value={c.responsive.gap} onChange={e=>update({responsive:{...c.responsive!,gap:Number(e.target.value)}})}/></label>
        <label><span>Visual prominence</span><Input type="number" min="0.25" max="0.65" step="0.05" value={c.responsive.visualWeight} onChange={e=>update({responsive:{...c.responsive!,visualWeight:Number(e.target.value)}})}/></label>
        <label><span>Visual treatment</span><NativeSelect value={c.responsive.visual.treatment} onChange={e=>update({responsive:{...c.responsive!,visual:{...c.responsive!.visual,treatment:e.target.value as 'plain'|'cards'|'numbered'|'annotated',annotations:e.target.value==='annotated'?c.responsive!.visual.annotations:[]}}})}>{['plain','cards','numbered',...(c.responsive.visual.annotations.length?['annotated']:[])].map(v=><NativeSelectOption key={v} value={v}>{v}</NativeSelectOption>)}</NativeSelect></label>
        <label><span>Diagram direction</span><NativeSelect value={c.responsive.visual.direction} onChange={e=>update({responsive:{...c.responsive!,visual:{...c.responsive!.visual,direction:e.target.value as 'auto'|'horizontal'|'vertical'}}})}>{['auto','horizontal','vertical'].map(v=><NativeSelectOption key={v} value={v}>{v}</NativeSelectOption>)}</NativeSelect></label>
        {c.responsive.visual.annotations.map((a,i)=><div key={a.copyId}><p className="text-xs">Image annotation {i+1}</p>{(['x','y'] as const).map(axis=><label key={axis}><span>{axis.toUpperCase()} position in image</span><Input type="number" min="0.02" max="0.98" step="0.01" value={a[axis]} onChange={e=>update({responsive:{...c.responsive!,visual:{...c.responsive!.visual,annotations:c.responsive!.visual.annotations.map((v,n)=>n===i?{...v,[axis]:Number(e.target.value)}:v)}}})}/></label>)}</div>)}
        {!!c.responsive.adjustments.length&&<button type="button" onClick={()=>update({responsive:{...c.responsive!,adjustments:[]}})}>Reset local layout adjustments ({c.responsive.adjustments.length})</button>}
      </>}
      <label><span>Text scale</span><Input type="number" min="0.85" max="1.15" step="0.05" value={c.tuning.scale} onChange={e=>update({tuning:{...c.tuning,scale:Number(e.target.value)}})}/></label>
      <label><span>Column proportion</span><Input type="number" min="0.35" max="0.65" step="0.05" value={c.tuning.split} onChange={e=>update({tuning:{...c.tuning,split:Number(e.target.value)}})}/></label>
      <label><span>Spacing</span><NativeSelect value={c.tuning.density} onChange={e=>update({tuning:{...c.tuning,density:e.target.value as Composition['tuning']['density']}})}>{['airy','balanced','compact'].map(v=><NativeSelectOption key={v} value={v}>{v}</NativeSelectOption>)}</NativeSelect></label>
      <label><span>Text alignment</span><NativeSelect value={c.tuning.align} onChange={e=>update({tuning:{...c.tuning,align:e.target.value as 'left'|'center'}})}><NativeSelectOption value="left">Left</NativeSelectOption><NativeSelectOption value="center">Center</NativeSelectOption></NativeSelect></label>
      <label><span>Reverse arrangement</span><input type="checkbox" checked={c.tuning.mirror} onChange={e=>update({tuning:{...c.tuning,mirror:e.target.checked}})}/></label>
      {(['headingFontId','bodyFontId'] as const).map(key=><label key={key}><span>{key==='headingFontId'?'Heading font':'Body font'}</span><NativeSelect value={c.tuning[key]??''} onChange={e=>update({tuning:{...c.tuning,[key]:e.target.value||undefined}})}><NativeSelectOption value="">Brand default</NativeSelectOption>{props.fonts?.map(font=><NativeSelectOption key={font.id} value={font.id}>{font.name}</NativeSelectOption>)}</NativeSelect></label>)}
      <label><span>Selected artwork</span><NativeSelect value={page.assetId??''} onChange={e=>props.onChange(withArtifactPages(props.artifact,pages.map((p,i)=>i===(props.activeIndex??0)?{...p,assetId:e.target.value||undefined}:p)))}><NativeSelectOption value="">None</NativeSelectOption>{props.assets?.map(asset=><NativeSelectOption key={asset.id} value={asset.id}>{asset.name}</NativeSelectOption>)}</NativeSelect></label>
      {page.supportingAssetIds?.map((id,slot)=><label key={slot}><span>Triptych image {slot+2}</span><NativeSelect value={id} onChange={e=>props.onChange(withArtifactPages(props.artifact,pages.map((p,i)=>i===(props.activeIndex??0)?{...p,supportingAssetIds:p.supportingAssetIds?.map((v,n)=>n===slot?e.target.value:v)}:p)))}>{props.assets?.map(asset=><NativeSelectOption key={asset.id} value={asset.id} disabled={asset.id===page.assetId||page.supportingAssetIds?.some((v,n)=>n!==slot&&v===asset.id)}>{asset.name}</NativeSelectOption>)}</NativeSelect></label>)}
    </details>
  );
}

function LegacyFields({ artifact, accent, companyId, activeIndex = 0, assets = [], onChange, onSelectionChange }: FieldsProps) {
  const select = (label: string, path: OlaTarget["path"]) => {
    const choose = () => onSelectionChange?.({ label, path });
    return { "data-editor-target": JSON.stringify(path), onClickCapture: choose, onFocusCapture: choose };
  };
  if (artifact.type === "post") return <>
    {artifact.designVersion === 2 && !artifact.composition && <><label {...select("Layout", ["layout"])}><span>Layout</span><NativeSelect value={artifact.layout ?? "split"} onChange={(event) => onChange({ ...artifact, layout: event.target.value as VisualLayout })}>{VISUAL_LAYOUTS.map((layout) => <NativeSelectOption key={layout} value={layout}>{layout}</NativeSelectOption>)}</NativeSelect></label><label {...select("Brand artwork", ["assetId"])}><span>Brand artwork</span><NativeSelect value={artifact.assetId ?? ""} onChange={(event) => onChange({ ...artifact, assetId: event.target.value || undefined })}><NativeSelectOption value="">None</NativeSelectOption>{assets.map((asset) => <NativeSelectOption key={asset.id} value={asset.id}>{asset.name}</NativeSelectOption>)}</NativeSelect></label><label {...select("Eyebrow", ["eyebrow"])}><span>Eyebrow</span><Input value={artifact.eyebrow ?? ""} onChange={(event) => onChange({ ...artifact, eyebrow: event.target.value })} /></label></>}
    <label {...select("Headline", ["headline"])}><span>Headline</span><Textarea value={artifact.headline} onChange={(event) => onChange({ ...artifact, headline: event.target.value })} /></label>
    <label {...select("Subline", ["subline"])}><span>Subline</span><Textarea value={artifact.subline} onChange={(event) => onChange({ ...artifact, subline: event.target.value })} /></label>
    <label {...select("Caption", ["caption"])}><span>Caption</span><Textarea rows={8} value={artifact.caption} onChange={(event) => onChange({ ...artifact, caption: event.target.value })} /></label>
    <ComponentControl locked={!!artifact.composition} value={artifact.semanticComponent} accent={accent} companyId={companyId} onChange={(semanticComponent) => onChange({ ...artifact, semanticComponent })} onSelect={() => onSelectionChange?.({ label: "Structured visual", path: ["semanticComponent"] })} />
  </>;

  if (artifact.type === "poster") return <>
    <label><span>Headline</span><Textarea value={artifact.headline} onChange={e=>onChange({...artifact,headline:e.target.value})}/></label>
    <label><span>Supporting copy</span><Textarea value={artifact.subline} onChange={e=>onChange({...artifact,subline:e.target.value})}/></label>
    <label><span>Call to action</span><Input value={artifact.cta} onChange={e=>onChange({...artifact,cta:e.target.value})}/></label>
    <label hidden={!!artifact.composition}><span>Layout</span><NativeSelect value={artifact.layout??"hero"} onChange={e=>onChange({...artifact,layout:e.target.value as VisualLayout})}>{VISUAL_LAYOUTS.map(l=><NativeSelectOption key={l} value={l}>{l}</NativeSelectOption>)}</NativeSelect></label>
    <label><span>Artwork</span><NativeSelect value={artifact.assetId??""} onChange={e=>onChange({...artifact,assetId:e.target.value||undefined})}><NativeSelectOption value="">None</NativeSelectOption>{assets.map(a=><NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>)}</NativeSelect></label>
    <ComponentControl locked={!!artifact.composition} value={artifact.semanticComponent} accent={accent} companyId={companyId} onChange={semanticComponent=>onChange({...artifact,semanticComponent})}/>
  </>;
  if (artifact.type === "story") return <>
    <label hidden={!!artifact.composition} {...select("Story treatment", ["storyTreatment"])}><span>Story treatment</span><NativeSelect value={artifact.storyTreatment ?? "quick-tip"} onChange={(event) => onChange({ ...artifact, storyTreatment: event.target.value as NonNullable<typeof artifact.storyTreatment> })}><NativeSelectOption value="quick-tip">Quick tip</NativeSelectOption><NativeSelectOption value="announcement">Announcement</NativeSelectOption><NativeSelectOption value="image-showcase">Image-led showcase</NativeSelectOption><NativeSelectOption value="conversation-prompt">Conversation prompt</NativeSelectOption></NativeSelect></label>
    {artifact.designVersion === 2 && !artifact.composition && <><label {...select("Layout", ["layout"])}><span>Layout</span><NativeSelect value={artifact.layout ?? "statement"} onChange={(event) => onChange({ ...artifact, layout: event.target.value as VisualLayout })}>{VISUAL_LAYOUTS.map((layout) => <NativeSelectOption key={layout} value={layout}>{layout}</NativeSelectOption>)}</NativeSelect></label><label {...select("Brand artwork", ["assetId"])}><span>Brand artwork</span><NativeSelect value={artifact.assetId ?? ""} onChange={(event) => onChange({ ...artifact, assetId: event.target.value || undefined })}><NativeSelectOption value="">None</NativeSelectOption>{assets.map((asset) => <NativeSelectOption key={asset.id} value={asset.id}>{asset.name}</NativeSelectOption>)}</NativeSelect></label></>}
    <label {...select("Headline", ["headline"])}><span>Headline</span><Textarea value={artifact.headline} onChange={(event) => onChange({ ...artifact, headline: event.target.value })} /></label>
    <label {...select("Subline", ["subline"])}><span>Subline</span><Textarea value={artifact.subline} onChange={(event) => onChange({ ...artifact, subline: event.target.value })} /></label>
    <label {...select("CTA", ["cta"])}><span>Optional CTA text</span><Input value={artifact.cta} onChange={(event) => onChange({ ...artifact, cta: event.target.value })} /></label>
    <ComponentControl locked={!!artifact.composition} value={artifact.semanticComponent} accent={accent} companyId={companyId} onChange={(semanticComponent) => onChange({ ...artifact, semanticComponent })} onSelect={() => onSelectionChange?.({ label: "Structured visual", path: ["semanticComponent"] })} />
  </>;

  if (artifact.type === "article") return <>
    {artifact.sections.map((section, index) => index !== activeIndex ? null : <div key={index}>
      <p className="mb-4 text-xs leading-5 text-muted-foreground">Add a structured visual to support this section.</p>
      <ComponentControl value={section.semanticComponent} accent={accent} companyId={companyId} onChange={(semanticComponent) => onChange({ ...artifact, sections: artifact.sections.map((item, position) => position === index ? { ...item, semanticComponent } : item) })} onSelect={() => onSelectionChange?.({ label: `Section ${index + 1} visual`, path: ["sections", index, "semanticComponent"] })} />
    </div>)}
  </>;

  return <>
    {artifact.designVersion === 2 && artifact.slides.map((slide, index) => index !== activeIndex ? null : <div key={index} hidden={!!slide.composition}><label {...select(`Slide ${index + 1} layout`, ["slides", index, "layout"])}><span>Slide layout</span><NativeSelect value={slide.layout ?? "hero"} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, layout: event.target.value as VisualLayout } : item) })}>{VISUAL_LAYOUTS.map((layout) => <NativeSelectOption key={layout} value={layout}>{layout}</NativeSelectOption>)}</NativeSelect></label><label {...select(`Slide ${index + 1} artwork`, ["slides", index, "assetId"])}><span>Brand artwork</span><NativeSelect value={slide.assetId ?? ""} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, assetId: event.target.value || undefined } : item) })}><NativeSelectOption value="">None</NativeSelectOption>{assets.map((asset) => <NativeSelectOption key={asset.id} value={asset.id}>{asset.name}</NativeSelectOption>)}</NativeSelect></label><label {...select(`Slide ${index + 1} eyebrow`, ["slides", index, "eyebrow"])}><span>Eyebrow</span><Input value={slide.eyebrow ?? ""} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, eyebrow: event.target.value } : item) })} /></label></div>)}
    {artifact.type === "carousel" && <label {...select(`Slide ${activeIndex + 1} role`, ["slides", activeIndex, "role"])}><span>Narrative role</span><NativeSelect value={artifact.slides[activeIndex]?.role ?? "explanation"} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((slide, index) => index === activeIndex ? { ...slide, role: event.target.value as NonNullable<typeof slide.role> } : slide) })}>{["hook", "context", "explanation", "example", "takeaway", "close"].map((role) => <NativeSelectOption key={role} value={role}>{role}</NativeSelectOption>)}</NativeSelect></label>}
    <label {...select("Project title", ["title"])}><span>{artifact.type === "carousel" ? "Carousel" : "Presentation"} title</span><Input value={artifact.title} onChange={(event) => onChange({ ...artifact, title: event.target.value })} /></label>
    {artifact.slides.map((slide, index) => index !== activeIndex ? null : <div key={index}>
      <label {...select(`Slide ${index + 1} title`, ["slides", index, "title"])}><span>Slide {index + 1} title</span><Input value={slide.title} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, title: event.target.value } : item) })} /></label>
      <Textarea {...select(`Slide ${index + 1} body`, ["slides", index, "body"])} aria-label={`Slide ${index + 1} body`} rows={5} value={slide.body} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, body: event.target.value } : item) })} />
      <ComponentControl locked={!!slide.composition} value={slide.semanticComponent} accent={accent} companyId={companyId} onChange={(semanticComponent) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, semanticComponent } : item) })} onSelect={() => onSelectionChange?.({ label: `Slide ${index + 1} visual`, path: ["slides", index, "semanticComponent"] })} />
    </div>)}
    {artifact.type === "carousel" && <label {...select("Caption", ["caption"])}><span>Caption</span><Textarea rows={5} value={artifact.caption} onChange={(event) => onChange({ ...artifact, caption: event.target.value })} /></label>}
  </>;
}

function AdvancedVisualFields(props: FieldsProps) {
  const { artifact, activeIndex = 0, onChange, accent, companyId }=props;
  const pages = artifactPages(artifact), page = pages[activeIndex];
  if (!page) return null;
  const c = page.composition;
  const update = (next: CopyPage) => onChange(withArtifactPages(artifact, pages.map((p, i) => i === activeIndex ? next : p)));
  return <details className={controlStyles.advanced}>
    <summary>Advanced</summary>
    {c && <CompositionControls {...props}/>}
    <details><summary>Text fields</summary>
      <p className="text-xs text-muted-foreground">You can also edit this text directly on the page.</p>
      <label>Headline<Textarea value={page.title} onChange={e => update({ ...page, title: e.target.value })}/></label>
      <label>Supporting text<Textarea value={page.body} onChange={e => update({ ...page, body: e.target.value })}/></label>
      {page.cta !== undefined && <label>Call to action<Input value={page.cta} onChange={e => update({ ...page, cta: e.target.value })}/></label>}
    </details>
    <ComponentControl locked={!!c} value={resolvedComponent(page)} accent={accent} companyId={companyId} onChange={semanticComponent => onChange(syncArtifactComposition(artifact, withArtifactPages(artifact, pages.map((p, i) => i === activeIndex ? { ...p, semanticComponent } : p))))}/>
  </details>;
}
