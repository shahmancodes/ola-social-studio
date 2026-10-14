"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useEffect, useState } from "react";
import type { SlideSpec } from "@/lib/schemas";

type Component = NonNullable<SlideSpec["semanticComponent"]>;
type Item = Component["items"][number];
type Style = NonNullable<Component["style"]>;

const defaults: Style = {
  foreground: "#07070A", muted: "#53535C", line: "#D7D7DC", surface: "#FFFFFF",
  accent: "#7F22FE", seriesTwo: "#9599A6", seriesThree: "#C9CBD2",
  onAccent: "#FFFFFF", fontFamily: "manrope", quoteFontFamily: "serif",
};

const countBounds: Partial<Record<Component["kind"], [number, number]>> = {
  processLoop: [2, 4], checklist: [2, 5], comparison: [2, 4], timeline: [2, 5],
  chatExchange: [2, 5], annotatedExample: [2, 3], progress: [3, 8],
  labeledVisual: [2, 5], priorityStack: [2, 6], continuum: [3, 7],
  barChart: [2, 8], lineChart: [3, 12], stackedBar: [2, 6],
  scatterPlot: [3, 12], histogram: [3, 12],
};

const chartKinds = new Set<Component["kind"]>(["barChart", "lineChart", "stackedBar", "scatterPlot", "histogram"]);
const hasValue = new Set<Component["kind"]>([...chartKinds, "metricSpotlight"]);
const hasDetail = new Set<Component["kind"]>(["decisionTree", "checklist", "comparison", "timeline", "annotatedExample", "scoreBreakdown", "labeledVisual", "priorityStack", "pullQuote"]);

export function SemanticComponentFields({ component, accent, companyId, onChange }: {
  component: Component;
  accent: string;
  companyId?: string;
  onChange: (patch: Partial<Component>) => void;
}) {
  const [companyAssets, setCompanyAssets] = useState<Array<{ id: string; name: string; media_type: string }>>([]);
  useEffect(() => {
    if (!companyId || component.kind !== "labeledVisual") return;
    const controller = new AbortController();
    fetch(`/api/companies/${companyId}/assets`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Asset library unavailable")))
      .then((data: { assets: Array<{ id: string; name: string; media_type: string }> }) => setCompanyAssets(data.assets.filter((asset) => asset.media_type.startsWith("image/"))))
      .catch(() => { if (!controller.signal.aborted) setCompanyAssets([]); });
    return () => controller.abort();
  }, [companyId, component.kind]);
  const style = component.style ?? { ...defaults, accent };
  const count = countBounds[component.kind];
  const updateItem = (index: number, patch: Partial<Item>) => onChange({ items: component.items.map((item, position) => position === index ? { ...item, ...patch } : item) });
  const updateStyle = (patch: Partial<Style>) => onChange({ style: { ...style, ...patch } });
  const resize = (length: number) => {
    const items = Array.from({ length }, (_, index) => component.items[index] ?? {
      label: `Item ${index + 1}`, detail: "", tag: "", speaker: "student" as const,
      value: 0, value2: 0, value3: 0, x: 50, y: 50,
    });
    onChange({ items, activeIndex: Math.min(component.activeIndex, length - 1) });
  };
  return <div>
    <strong>{component.kind.replace(/([A-Z])/g, " $1").toLowerCase()}</strong>
    {count && <label>Items<NativeSelect value={component.items.length} onChange={(event) => resize(Number(event.target.value))}>{Array.from({ length: count[1] - count[0] + 1 }, (_, index) => index + count[0]).map((value) => <NativeSelectOption value={value} key={value}>{value}</NativeSelectOption>)}</NativeSelect></label>}
    {!["processLoop", "comparison", "timeline", "chatExchange", "scoreBreakdown", "decisionTree"].includes(component.kind) && <label>Short label<Input value={component.prompt} onChange={(event) => onChange({ prompt: event.target.value })} /></label>}
    {["annotatedExample", "pullQuote", "labeledVisual", "priorityStack", "continuum", "metricSpotlight", "progress", "barChart", "lineChart", "stackedBar", "scatterPlot", "histogram"].includes(component.kind) && <label>{component.kind === "pullQuote" ? "Quote" : component.kind === "annotatedExample" ? "Example answer" : "Heading or explanation"}<Textarea rows={2} value={component.answer} onChange={(event) => onChange({ answer: event.target.value })} /></label>}
    {component.kind === "decisionTree" && <label>Question<Input value={component.prompt} onChange={(event) => onChange({ prompt: event.target.value })} /></label>}
    {["comparison", "stackedBar", "scatterPlot", "continuum", "chatExchange"].includes(component.kind) && <label>{component.kind === "comparison" ? "Left title" : component.kind === "stackedBar" ? "First series" : component.kind === "scatterPlot" ? "Horizontal axis" : component.kind === "chatExchange" ? "First speaker" : "Left endpoint"}<Input value={component.leftTitle} onChange={(event) => onChange({ leftTitle: event.target.value })} /></label>}
    {["comparison", "stackedBar", "scatterPlot", "continuum", "chatExchange"].includes(component.kind) && <label>{component.kind === "comparison" ? "Right title" : component.kind === "stackedBar" ? "Second series" : component.kind === "scatterPlot" ? "Vertical axis" : component.kind === "chatExchange" ? "Second speaker" : "Right endpoint"}<Input value={component.rightTitle} onChange={(event) => onChange({ rightTitle: event.target.value })} /></label>}
    {["scoreBreakdown", "stackedBar"].includes(component.kind) && <label>{component.kind === "stackedBar" ? "Third series" : "Takeaway"}<Input value={component.takeaway} onChange={(event) => onChange({ takeaway: event.target.value })} /></label>}
    {component.kind === "scoreBreakdown" && <label>Note<Input value={component.note} onChange={(event) => onChange({ note: event.target.value })} /></label>}
    {hasValue.has(component.kind) && <label>Unit<Input value={component.unit} onChange={(event) => onChange({ unit: event.target.value })} placeholder="%, hours, points…" /></label>}
    {["progress", "continuum"].includes(component.kind) && <label>{component.kind === "progress" ? "Current stage" : "Selected position"}<NativeSelect value={component.activeIndex} onChange={(event) => onChange({ activeIndex: Number(event.target.value) })}>{component.items.map((item, index) => <NativeSelectOption value={index} key={index}>{index + 1} · {item.label}</NativeSelectOption>)}</NativeSelect></label>}
    {component.kind === "labeledVisual" && (companyId ? <label>Illustration<NativeSelect value={component.assetPath} onChange={(event) => onChange({ assetPath: event.target.value })}>
      <NativeSelectOption value="">Built-in example illustration</NativeSelectOption>
      {companyAssets.map((asset) => <NativeSelectOption key={asset.id} value={`company:${asset.id}`}>{asset.name}</NativeSelectOption>)}
      {component.assetPath && !companyAssets.some((asset) => `company:${asset.id}` === component.assetPath) ? <NativeSelectOption value={component.assetPath}>Current shared illustration</NativeSelectOption> : null}
    </NativeSelect></label> : <label>Illustration asset path<Input value={component.assetPath} onChange={(event) => onChange({ assetPath: event.target.value })} placeholder="Leave empty for the example illustration" /></label>)}
    {component.items.map((item, index) => <div key={index}>
      <label>{component.kind === "scatterPlot" ? `Point ${index + 1}` : component.kind === "pullQuote" ? "Attribution" : `Item ${index + 1}`}<Input value={item.label} onChange={(event) => updateItem(index, { label: event.target.value })} /></label>
      {hasDetail.has(component.kind) && <label>{component.kind === "pullQuote" ? "Role or source" : "Detail"}<Textarea rows={2} value={item.detail} onChange={(event) => updateItem(index, { detail: event.target.value })} /></label>}
      {["timeline", "decisionTree", "scoreBreakdown", "priorityStack"].includes(component.kind) && <label>Tag<Input value={item.tag} onChange={(event) => updateItem(index, { tag: event.target.value })} /></label>}
      {component.kind === "chatExchange" && <label>Speaker<NativeSelect value={item.speaker} onChange={(event) => updateItem(index, { speaker: event.target.value as Item["speaker"] })}><NativeSelectOption value="student">{component.leftTitle || "First speaker"}</NativeSelectOption><NativeSelectOption value="mascot">{component.rightTitle || "Second speaker"}</NativeSelectOption></NativeSelect></label>}
      {hasValue.has(component.kind) && <label>{component.kind === "scatterPlot" ? "X value" : "Value"}<Input type="number" value={item.value} onChange={(event) => updateItem(index, { value: Number(event.target.value) })} /></label>}
      {["stackedBar", "scatterPlot"].includes(component.kind) && <label>{component.kind === "scatterPlot" ? "Y value" : "Second value"}<Input type="number" value={item.value2} onChange={(event) => updateItem(index, { value2: Number(event.target.value) })} /></label>}
      {component.kind === "stackedBar" && <label>Third value<Input type="number" value={item.value3} onChange={(event) => updateItem(index, { value3: Number(event.target.value) })} /></label>}
      {component.kind === "labeledVisual" && <><label>Marker X (%)<Input type="number" min="0" max="100" value={item.x} onChange={(event) => updateItem(index, { x: Number(event.target.value) })} /></label><label>Marker Y (%)<Input type="number" min="0" max="100" value={item.y} onChange={(event) => updateItem(index, { y: Number(event.target.value) })} /></label></>}
    </div>)}
    <details><summary>Colours and fonts</summary>
      {([ ["foreground", "Main text"], ["muted", "Secondary text"], ["line", "Rules and grid"], ["surface", "Node and marker fill"], ["accent", "Accent"], ["seriesTwo", "Second series"], ["seriesThree", "Third series"], ["onAccent", "Text on accent"] ] as const).map(([key, label]) => <label key={key}>{label}<input type="color" value={style[key]} onChange={(event) => updateStyle({ [key]: event.target.value })} /></label>)}
      <label>Main font<NativeSelect value={style.fontFamily} onChange={(event) => updateStyle({ fontFamily: event.target.value as Style["fontFamily"] })}><NativeSelectOption value="manrope">Manrope</NativeSelectOption><NativeSelectOption value="poppins">Poppins</NativeSelectOption><NativeSelectOption value="system">System sans</NativeSelectOption><NativeSelectOption value="serif">Serif</NativeSelectOption></NativeSelect></label>
      <label>Quote font<NativeSelect value={style.quoteFontFamily} onChange={(event) => updateStyle({ quoteFontFamily: event.target.value as Style["quoteFontFamily"] })}><NativeSelectOption value="serif">Serif</NativeSelectOption><NativeSelectOption value="manrope">Manrope</NativeSelectOption><NativeSelectOption value="poppins">Poppins</NativeSelectOption><NativeSelectOption value="system">System sans</NativeSelectOption></NativeSelect></label>
    </details>
  </div>;
}
