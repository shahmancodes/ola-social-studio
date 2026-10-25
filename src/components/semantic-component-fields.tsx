"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { SemanticComponentSchema, type SlideSpec } from "@/lib/schemas";

type Component = NonNullable<SlideSpec["semanticComponent"]>;
type Item = Component["items"][number];
type Style = NonNullable<Component["style"]>;

const defaults: Style = {
  foreground: "#07070A", muted: "#53535C", line: "#D7D7DC", surface: "#FFFFFF",
  accent: "#7F22FE", seriesTwo: "#9599A6", seriesThree: "#C9CBD2",
  seriesFour: "#467640", seriesFive: "#9B4874", headingFontFamily: null,
  onAccent: "#FFFFFF", fontFamily: "manrope", quoteFontFamily: "serif",
};

const countBounds: Partial<Record<Component["kind"], [number, number]>> = {
  processSteps: [2, 4], metricGrid: [2, 4], bulletChart: [2, 4],
  processLoop: [2, 4], checklist: [2, 5], comparison: [2, 4], timeline: [2, 5],
  chatExchange: [2, 5], annotatedExample: [2, 3], progress: [3, 8],
  labeledVisual: [2, 5], priorityStack: [2, 6], continuum: [3, 7],
  barChart: [2, 8], lineChart: [3, 12], stackedBar: [2, 6],
  scatterPlot: [3, 12], histogram: [3, 12],
  pieChart: [3, 5], hierarchyPyramid: [3, 5], hubSpoke: [2, 4],
  conversionFunnel: [3, 5], waterfall: [3, 7], quadrant: [2, 8],
  calendarHeatmap: [2, 42], swimlane: [2, 5], proportionalFlow: [2, 8],
};

const chartKinds = new Set<Component["kind"]>(["barChart", "lineChart", "stackedBar", "scatterPlot", "histogram", "bulletChart"]);
const diagramKinds = new Set<Component["kind"]>(["pieChart", "hierarchyPyramid", "hubSpoke", "conversionFunnel", "waterfall", "quadrant", "venn", "calendarHeatmap", "swimlane", "proportionalFlow", "marketSizing"]);
const hasValue = new Set<Component["kind"]>([...chartKinds, "metricGrid", "metricSpotlight", "pieChart", "conversionFunnel", "waterfall", "calendarHeatmap", "swimlane", "proportionalFlow", "marketSizing"]);
const hasDetail = new Set<Component["kind"]>(["relatedPair", "processSteps", "metricGrid", "decisionTree", "checklist", "comparison", "timeline", "annotatedExample", "scoreBreakdown", "labeledVisual", "priorityStack", "pullQuote", "venn"]);

export function SemanticComponentFields({ component, accent, companyId, onChange, lockStructure = false }: {
  lockStructure?: boolean;
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
  const style = { ...defaults, accent, ...component.style };
  const count = countBounds[component.kind];
  const updateItem = (index: number, patch: Partial<Item>) => {
    const items = component.items.map((item, position) => position === index ? { ...item, ...patch } : item);
    if (component.kind === "waterfall") items[items.length - 1] = { ...items.at(-1)!, value: items.slice(0, -1).reduce((total, item) => total + item.value, 0) };
    onChange({ items });
  };
  const updateStyle = (patch: Partial<Style>) => onChange({ style: { ...style, ...patch } });
  const resize = (length: number) => {
    const blank = (index: number): Item => ({
      label: `Item ${index + 1}`, detail: "", tag: "", speaker: "student" as const,
      value: component.kind === "pieChart" || component.kind === "proportionalFlow" ? 1 : 0, value2: ["swimlane", "bulletChart"].includes(component.kind) ? 1 : 0, value3: 0, x: 50, y: 50,
      radius: 14, color: null, group: "source",
    });
    const cells = new Set(component.items.slice(0, length).map(item => `${item.x}:${item.y}`));
    const items = Array.from({ length }, (_, index) => {
      if (component.items[index]) return component.items[index];
      const item = blank(index);
      if (component.kind === "calendarHeatmap") for (let cell = 0; cell < 42; cell++) {
        const x = Math.floor(cell / 7), y = cell % 7;
        if (!cells.has(`${x}:${y}`)) { item.x = x; item.y = y; cells.add(`${x}:${y}`); break; }
      }
      return item;
    });
    if (component.kind === "waterfall") {
      const changes = component.items.slice(1, -1);
      items.splice(0, items.length, component.items[0], ...Array.from({ length: length - 2 }, (_, index) => changes[index] ?? blank(index + 1)), component.items.at(-1)!);
      items[items.length - 1] = { ...items.at(-1)!, value: items.slice(0, -1).reduce((total, item) => total + item.value, 0) };
    }
    onChange({ items, activeIndex: Math.min(component.activeIndex, length - 1) });
  };
  const validation = SemanticComponentSchema.safeParse(component);
  return <div>
    <strong>{component.kind.replace(/([A-Z])/g, " $1").toLowerCase()}</strong>
    {count && <label>{component.kind === "hierarchyPyramid" ? "Layers" : component.kind === "pieChart" ? "Segments" : "Items"}<NativeSelect disabled={lockStructure} value={component.items.length} onChange={(event) => resize(Number(event.target.value))}>{Array.from({ length: count[1] - count[0] + 1 }, (_, index) => index + count[0]).map((value) => <NativeSelectOption value={value} key={value}>{value}</NativeSelectOption>)}</NativeSelect></label>}
    {component.kind === "pieChart" && <label>Chart style<NativeSelect value={component.chartStyle} onChange={event => onChange({ chartStyle: event.target.value as Component["chartStyle"] })}><NativeSelectOption value="pie">Pie</NativeSelectOption><NativeSelectOption value="donut">Donut</NativeSelectOption></NativeSelect></label>}
    {(diagramKinds.has(component.kind) || component.kind === "relatedPair") && <label>Source or note<Input value={component.note} onChange={event => onChange({ note: event.target.value })} /></label>}
    {component.kind === "proportionalFlow" && <p>Source and destination totals must match. Choose a side for each item.</p>}
    {!validation.success && <p role="alert">{validation.error.issues[0]?.message}</p>}
    {!["processLoop", "comparison", "timeline", "chatExchange", "scoreBreakdown", "decisionTree"].includes(component.kind) && <label>Short label<Input value={component.prompt} onChange={(event) => onChange({ prompt: event.target.value })} /></label>}
    {["relatedPair", "annotatedExample", "pullQuote", "labeledVisual", "priorityStack", "continuum", "metricSpotlight", "progress", "barChart", "lineChart", "stackedBar", "scatterPlot", "histogram", "bulletChart"].includes(component.kind) && <label>{component.kind === "pullQuote" ? "Quote" : component.kind === "annotatedExample" ? "Example answer" : "Heading or explanation"}<Textarea rows={2} value={component.answer} onChange={(event) => onChange({ answer: event.target.value })} /></label>}
    {component.kind === "decisionTree" && <label>Question<Input value={component.prompt} onChange={(event) => onChange({ prompt: event.target.value })} /></label>}
    {["comparison", "stackedBar", "scatterPlot", "continuum", "chatExchange", "quadrant", "venn", "bulletChart"].includes(component.kind) && <label>{component.kind === "bulletChart" ? "Actual legend" : component.kind === "venn" ? "Left set" : component.kind === "quadrant" || component.kind === "scatterPlot" ? "Horizontal axis" : component.kind === "comparison" ? "Left title" : component.kind === "stackedBar" ? "First series" : component.kind === "chatExchange" ? "First speaker" : "Left endpoint"}<Input value={component.leftTitle} onChange={(event) => onChange({ leftTitle: event.target.value })} /></label>}
    {["comparison", "stackedBar", "scatterPlot", "continuum", "chatExchange", "quadrant", "venn", "bulletChart"].includes(component.kind) && <label>{component.kind === "bulletChart" ? "Target legend" : component.kind === "venn" ? "Right set" : component.kind === "quadrant" || component.kind === "scatterPlot" ? "Vertical axis" : component.kind === "comparison" ? "Right title" : component.kind === "stackedBar" ? "Second series" : component.kind === "chatExchange" ? "Second speaker" : "Right endpoint"}<Input value={component.rightTitle} onChange={(event) => onChange({ rightTitle: event.target.value })} /></label>}
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
      {["timeline", "decisionTree", "scoreBreakdown", "priorityStack", "marketSizing"].includes(component.kind) && <label>{component.kind === "marketSizing" ? "Market label (TAM / SAM / SOM)" : "Tag"}<Input value={item.tag} onChange={(event) => updateItem(index, { tag: event.target.value })} /></label>}
      {component.kind === "chatExchange" && <label>Speaker<NativeSelect value={item.speaker} onChange={(event) => updateItem(index, { speaker: event.target.value as Item["speaker"] })}><NativeSelectOption value="student">{component.leftTitle || "First speaker"}</NativeSelectOption><NativeSelectOption value="mascot">{component.rightTitle || "Second speaker"}</NativeSelectOption></NativeSelect></label>}
      {hasValue.has(component.kind) && <label>{component.kind === "bulletChart" ? "Actual" : component.kind === "scatterPlot" ? "X value" : component.kind === "swimlane" ? "Start" : component.kind === "waterfall" && index === component.items.length - 1 ? "Closing total (calculated)" : "Value"}<Input type="number" step="any" readOnly={component.kind === "waterfall" && index === component.items.length - 1} value={item.value} onChange={(event) => updateItem(index, { value: Number(event.target.value) })} /></label>}
      {component.kind === "swimlane" && <label>Duration<Input type="number" min="0.01" step="any" value={item.value2} onChange={event => updateItem(index, { value2: Number(event.target.value) })} /></label>}
      {component.kind === "proportionalFlow" && <label>Flow side<NativeSelect value={item.group} onChange={event => updateItem(index, { group: event.target.value as Item["group"] })}><NativeSelectOption value="source">Source</NativeSelectOption><NativeSelectOption value="destination">Destination</NativeSelectOption></NativeSelect></label>}
      {component.kind === "quadrant" && <><label>X (%)<Input type="number" min="0" max="100" value={item.x} onChange={event => updateItem(index, { x: Number(event.target.value) })} /></label><label>Y (%)<Input type="number" min="0" max="100" value={item.y} onChange={event => updateItem(index, { y: Number(event.target.value) })} /></label><label>Dot radius (6–32)<Input type="number" min="6" max="32" value={item.radius} onChange={event => updateItem(index, { radius: Number(event.target.value) })} /></label></>}
      {component.kind === "calendarHeatmap" && <><label>Week (1–6)<Input type="number" min="1" max="6" value={item.x + 1} onChange={event => updateItem(index, { x: Number(event.target.value) - 1 })} /></label><label>Weekday (1 = Monday)<Input type="number" min="1" max="7" value={item.y + 1} onChange={event => updateItem(index, { y: Number(event.target.value) - 1 })} /></label></>}
      {diagramKinds.has(component.kind) && <label>Override item color<input type="color" value={item.color || [style.accent, style.seriesTwo, style.seriesThree, style.seriesFour, style.seriesFive][index % 5]} onChange={event => updateItem(index, { color: event.target.value })} />{item.color && <Button type="button" variant="ghost" size="sm" onClick={() => updateItem(index, { color: null })}>Use default</Button>}</label>}
      {["stackedBar", "scatterPlot", "bulletChart"].includes(component.kind) && <label>{component.kind === "bulletChart" ? "Target" : component.kind === "scatterPlot" ? "Y value" : "Second value"}<Input type="number" value={item.value2} onChange={(event) => updateItem(index, { value2: Number(event.target.value) })} /></label>}
      {component.kind === "stackedBar" && <label>Third value<Input type="number" value={item.value3} onChange={(event) => updateItem(index, { value3: Number(event.target.value) })} /></label>}
      {component.kind === "labeledVisual" && <><label>Marker X (%)<Input type="number" min="0" max="100" value={item.x} onChange={(event) => updateItem(index, { x: Number(event.target.value) })} /></label><label>Marker Y (%)<Input type="number" min="0" max="100" value={item.y} onChange={(event) => updateItem(index, { y: Number(event.target.value) })} /></label></>}
    </div>)}
    <details><summary>Colours and fonts</summary>
      {([ ["foreground", "Main text"], ["muted", "Secondary text"], ["line", "Rules and grid"], ["surface", "Node and marker fill"], ["accent", "Accent"], ["seriesTwo", "Second series"], ["seriesThree", "Third series"], ["seriesFour", "Fourth series"], ["seriesFive", "Fifth series"], ["onAccent", "Text on accent"] ] as const).map(([key, label]) => <label key={key}>{label}<input type="color" value={style[key] || defaults[key]} onChange={(event) => updateStyle({ [key]: event.target.value })} /></label>)}
      <label>Heading font<NativeSelect value={style.headingFontFamily ?? "inherit"} onChange={event => updateStyle({ headingFontFamily: event.target.value === "inherit" ? null : event.target.value as Style["fontFamily"] })}><NativeSelectOption value="inherit">Same as main font</NativeSelectOption><NativeSelectOption value="manrope">Manrope</NativeSelectOption><NativeSelectOption value="poppins">Poppins</NativeSelectOption><NativeSelectOption value="system">System sans</NativeSelectOption><NativeSelectOption value="serif">Serif</NativeSelectOption></NativeSelect></label>
      <label>Main font<NativeSelect value={style.fontFamily} onChange={(event) => updateStyle({ fontFamily: event.target.value as Style["fontFamily"] })}><NativeSelectOption value="manrope">Manrope</NativeSelectOption><NativeSelectOption value="poppins">Poppins</NativeSelectOption><NativeSelectOption value="system">System sans</NativeSelectOption><NativeSelectOption value="serif">Serif</NativeSelectOption></NativeSelect></label>
      <label>Quote font<NativeSelect value={style.quoteFontFamily} onChange={(event) => updateStyle({ quoteFontFamily: event.target.value as Style["quoteFontFamily"] })}><NativeSelectOption value="serif">Serif</NativeSelectOption><NativeSelectOption value="manrope">Manrope</NativeSelectOption><NativeSelectOption value="poppins">Poppins</NativeSelectOption><NativeSelectOption value="system">System sans</NativeSelectOption></NativeSelect></label>
    </details>
  </div>;
}
