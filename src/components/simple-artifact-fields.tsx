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

type Component = NonNullable<SlideSpec["semanticComponent"]>;

function ComponentControl({ value, accent, companyId, onChange, onSelect }: { value?: Component; accent: string; companyId: string; onChange: (next: Component | undefined) => void; onSelect?: () => void }) {
  return <details onClickCapture={onSelect} onFocusCapture={onSelect} style={{ margin: "16px 0", borderTop: "1px solid #e7e7eb", paddingTop: 12 }}>
    <summary>Structured visual{value ? ` · ${SEMANTIC_COMPONENT_CHOICES.find((choice) => choice.kind === value.kind)?.name ?? value.kind}` : " · none"}</summary>
    <label><span>Component</span><NativeSelect value={value?.kind ?? ""} onChange={(event) => onChange(event.target.value ? createSemanticComponent(event.target.value as SemanticKind) : undefined)}>
      <NativeSelectOption value="">None</NativeSelectOption>{SEMANTIC_COMPONENT_CHOICES.map((choice) => <NativeSelectOption value={choice.kind} key={choice.kind}>{choice.name}</NativeSelectOption>)}
    </NativeSelect></label>
    {value && <SemanticComponentFields component={value} accent={accent} companyId={companyId} onChange={(patch) => onChange({ ...value, ...patch })} />}
  </details>;
}

export function SimpleArtifactFields({ artifact, accent, companyId, activeIndex = 0, assets = [], onChange, onSelectionChange }: { artifact: SimpleArtifact; accent: string; companyId: string; activeIndex?: number; assets?: Array<{ id: string; name: string }>; onChange: (next: SimpleArtifact) => void; onSelectionChange?: (target: OlaTarget) => void }) {
  const select = (label: string, path: OlaTarget["path"]) => {
    const choose = () => onSelectionChange?.({ label, path });
    return { "data-editor-target": JSON.stringify(path), onClickCapture: choose, onFocusCapture: choose };
  };
  if (artifact.type === "post") return <>
    {artifact.designVersion === 2 && <><label {...select("Layout", ["layout"])}><span>Layout</span><NativeSelect value={artifact.layout ?? "split"} onChange={(event) => onChange({ ...artifact, layout: event.target.value as VisualLayout })}>{VISUAL_LAYOUTS.map((layout) => <NativeSelectOption key={layout} value={layout}>{layout}</NativeSelectOption>)}</NativeSelect></label><label {...select("Brand artwork", ["assetId"])}><span>Brand artwork</span><NativeSelect value={artifact.assetId ?? ""} onChange={(event) => onChange({ ...artifact, assetId: event.target.value || undefined })}><NativeSelectOption value="">None</NativeSelectOption>{assets.map((asset) => <NativeSelectOption key={asset.id} value={asset.id}>{asset.name}</NativeSelectOption>)}</NativeSelect></label><label {...select("Eyebrow", ["eyebrow"])}><span>Eyebrow</span><Input value={artifact.eyebrow ?? ""} onChange={(event) => onChange({ ...artifact, eyebrow: event.target.value })} /></label></>}
    <label {...select("Headline", ["headline"])}><span>Headline</span><Textarea value={artifact.headline} onChange={(event) => onChange({ ...artifact, headline: event.target.value })} /></label>
    <label {...select("Subline", ["subline"])}><span>Subline</span><Textarea value={artifact.subline} onChange={(event) => onChange({ ...artifact, subline: event.target.value })} /></label>
    <label {...select("Caption", ["caption"])}><span>Caption</span><Textarea rows={8} value={artifact.caption} onChange={(event) => onChange({ ...artifact, caption: event.target.value })} /></label>
    <ComponentControl value={artifact.semanticComponent} accent={accent} companyId={companyId} onChange={(semanticComponent) => onChange({ ...artifact, semanticComponent })} onSelect={() => onSelectionChange?.({ label: "Structured visual", path: ["semanticComponent"] })} />
  </>;

  if (artifact.type === "story") return <>
    <label {...select("Story treatment", ["storyTreatment"])}><span>Story treatment</span><NativeSelect value={artifact.storyTreatment ?? "quick-tip"} onChange={(event) => onChange({ ...artifact, storyTreatment: event.target.value as NonNullable<typeof artifact.storyTreatment> })}><NativeSelectOption value="quick-tip">Quick tip</NativeSelectOption><NativeSelectOption value="announcement">Announcement</NativeSelectOption><NativeSelectOption value="image-showcase">Image-led showcase</NativeSelectOption><NativeSelectOption value="conversation-prompt">Conversation prompt</NativeSelectOption></NativeSelect></label>
    {artifact.designVersion === 2 && <><label {...select("Layout", ["layout"])}><span>Layout</span><NativeSelect value={artifact.layout ?? "statement"} onChange={(event) => onChange({ ...artifact, layout: event.target.value as VisualLayout })}>{VISUAL_LAYOUTS.map((layout) => <NativeSelectOption key={layout} value={layout}>{layout}</NativeSelectOption>)}</NativeSelect></label><label {...select("Brand artwork", ["assetId"])}><span>Brand artwork</span><NativeSelect value={artifact.assetId ?? ""} onChange={(event) => onChange({ ...artifact, assetId: event.target.value || undefined })}><NativeSelectOption value="">None</NativeSelectOption>{assets.map((asset) => <NativeSelectOption key={asset.id} value={asset.id}>{asset.name}</NativeSelectOption>)}</NativeSelect></label></>}
    <label {...select("Headline", ["headline"])}><span>Headline</span><Textarea value={artifact.headline} onChange={(event) => onChange({ ...artifact, headline: event.target.value })} /></label>
    <label {...select("Subline", ["subline"])}><span>Subline</span><Textarea value={artifact.subline} onChange={(event) => onChange({ ...artifact, subline: event.target.value })} /></label>
    <label {...select("CTA", ["cta"])}><span>Optional CTA text</span><Input value={artifact.cta} onChange={(event) => onChange({ ...artifact, cta: event.target.value })} /></label>
    <ComponentControl value={artifact.semanticComponent} accent={accent} companyId={companyId} onChange={(semanticComponent) => onChange({ ...artifact, semanticComponent })} onSelect={() => onSelectionChange?.({ label: "Structured visual", path: ["semanticComponent"] })} />
  </>;

  if (artifact.type === "article") return <>
    {artifact.sections.map((section, index) => index !== activeIndex ? null : <div key={index}>
      <p className="mb-4 text-xs leading-5 text-muted-foreground">Add a structured visual to support this section.</p>
      <ComponentControl value={section.semanticComponent} accent={accent} companyId={companyId} onChange={(semanticComponent) => onChange({ ...artifact, sections: artifact.sections.map((item, position) => position === index ? { ...item, semanticComponent } : item) })} onSelect={() => onSelectionChange?.({ label: `Section ${index + 1} visual`, path: ["sections", index, "semanticComponent"] })} />
    </div>)}
  </>;

  return <>
    {artifact.designVersion === 2 && artifact.slides.map((slide, index) => index !== activeIndex ? null : <div key={index}><label {...select(`Slide ${index + 1} layout`, ["slides", index, "layout"])}><span>Slide layout</span><NativeSelect value={slide.layout ?? "hero"} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, layout: event.target.value as VisualLayout } : item) })}>{VISUAL_LAYOUTS.map((layout) => <NativeSelectOption key={layout} value={layout}>{layout}</NativeSelectOption>)}</NativeSelect></label><label {...select(`Slide ${index + 1} artwork`, ["slides", index, "assetId"])}><span>Brand artwork</span><NativeSelect value={slide.assetId ?? ""} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, assetId: event.target.value || undefined } : item) })}><NativeSelectOption value="">None</NativeSelectOption>{assets.map((asset) => <NativeSelectOption key={asset.id} value={asset.id}>{asset.name}</NativeSelectOption>)}</NativeSelect></label><label {...select(`Slide ${index + 1} eyebrow`, ["slides", index, "eyebrow"])}><span>Eyebrow</span><Input value={slide.eyebrow ?? ""} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, eyebrow: event.target.value } : item) })} /></label></div>)}
    {artifact.type === "carousel" && <label {...select(`Slide ${activeIndex + 1} role`, ["slides", activeIndex, "role"])}><span>Narrative role</span><NativeSelect value={artifact.slides[activeIndex]?.role ?? "explanation"} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((slide, index) => index === activeIndex ? { ...slide, role: event.target.value as NonNullable<typeof slide.role> } : slide) })}>{["hook", "context", "explanation", "example", "takeaway", "close"].map((role) => <NativeSelectOption key={role} value={role}>{role}</NativeSelectOption>)}</NativeSelect></label>}
    <label {...select("Project title", ["title"])}><span>{artifact.type === "carousel" ? "Carousel" : "Presentation"} title</span><Input value={artifact.title} onChange={(event) => onChange({ ...artifact, title: event.target.value })} /></label>
    {artifact.slides.map((slide, index) => index !== activeIndex ? null : <div key={index}>
      <label {...select(`Slide ${index + 1} title`, ["slides", index, "title"])}><span>Slide {index + 1} title</span><Input value={slide.title} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, title: event.target.value } : item) })} /></label>
      <Textarea {...select(`Slide ${index + 1} body`, ["slides", index, "body"])} aria-label={`Slide ${index + 1} body`} rows={5} value={slide.body} onChange={(event) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, body: event.target.value } : item) })} />
      <ComponentControl value={slide.semanticComponent} accent={accent} companyId={companyId} onChange={(semanticComponent) => onChange({ ...artifact, slides: artifact.slides.map((item, position) => position === index ? { ...item, semanticComponent } : item) })} onSelect={() => onSelectionChange?.({ label: `Slide ${index + 1} visual`, path: ["slides", index, "semanticComponent"] })} />
    </div>)}
    {artifact.type === "carousel" && <label {...select("Caption", ["caption"])}><span>Caption</span><Textarea rows={5} value={artifact.caption} onChange={(event) => onChange({ ...artifact, caption: event.target.value })} /></label>}
  </>;
}
