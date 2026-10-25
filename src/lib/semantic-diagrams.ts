import { SemanticComponentSchema, type SlideSpec } from "./schemas";

type Component = NonNullable<SlideSpec["semanticComponent"]>;
type Item = Component["items"][number];
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const palette = ["var(--sc-accent)", "var(--sc-series-2)", "var(--sc-series-3)", "var(--sc-series-4)", "var(--sc-series-5)"];
const color = (item: Item, index: number) => item.color || palette[index % palette.length];
function sliceTextColor(component: Component, item: Item, index: number) {
  if (!item.color && index === 0) return "var(--sc-on-accent)";
  const hex = item.color || [component.style?.accent || "#7F22FE", component.style?.seriesTwo || "#9599A6", component.style?.seriesThree || "#C9CBD2", component.style?.seriesFour || "#467640", component.style?.seriesFive || "#9B4874"][index];
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? "#07070A" : "#FFFFFF";
}
const number = (value: number) => Number(value.toFixed(2)).toLocaleString("en-US");
const amount = (value: number, unit: string, compact = false) => {
  const magnitude = Math.abs(value);
  const divisor = compact ? magnitude >= 1e9 ? 1e9 : magnitude >= 1e6 ? 1e6 : magnitude >= 1e3 ? 1e3 : 1 : 1;
  const suffix = divisor === 1e9 ? "B" : divisor === 1e6 ? "M" : divisor === 1e3 ? "K" : "";
  const numeric = number(value / divisor) + suffix;
  return /^[£$€]$/.test(unit) ? unit + numeric : numeric + (unit && unit !== "%" ? ` ${unit}` : unit);
};

// SVG labels wrap without truncating the user's copy. Explicit widths keep labels
// in their own columns across font choices and exported component sizes.
function text(x: number, y: number, value: string, options: { size?: number; width?: number; anchor?: "start" | "middle" | "end"; bold?: boolean; fill?: string } = {}) {
  const { size = 20, width = 444, anchor = "start", bold = false, fill = "var(--sc-ink)" } = options;
  const limit = Math.max(3, Math.floor(width / (size * .52)));
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (line && `${line} ${word}`.length > limit) { lines.push(line); line = ""; }
      let rest = word;
      while (rest.length > limit) { if (line) { lines.push(line); line = ""; } lines.push(rest.slice(0, limit)); rest = rest.slice(limit); }
      line = line ? `${line} ${rest}` : rest;
    }
    lines.push(line);
  }
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? size * 1.15 : 0}">${escape(line)}</tspan>`).join("")}</text>`;
}
const line = (x1: number, y1: number, x2: number, y2: number, dashed = false) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--sc-line)" stroke-width="1.5"${dashed ? ' stroke-dasharray="4 5"' : ""}/>`;
const soft = (percent: number) => `color-mix(in srgb,var(--sc-accent) ${percent}%,var(--sc-surface))`;
const polar = (x: number, y: number, radius: number, angle: number) => [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
function arc(outer: number, inner: number, start: number, end: number) {
  const a = polar(140, 201, outer, start), b = polar(140, 201, outer, end), c = polar(140, 201, inner, end), d = polar(140, 201, inner, start), large = end - start > Math.PI ? 1 : 0;
  return inner ? `M${a} A${outer} ${outer} 0 ${large} 1 ${b} L${c} A${inner} ${inner} 0 ${large} 0 ${d} Z` : `M140 201 L${a} A${outer} ${outer} 0 ${large} 1 ${b} Z`;
}

function pie(component: Component) {
  const sum = component.items.reduce((total, item) => total + item.value, 0), donut = component.chartStyle === "donut";
  let angle = -Math.PI / 2;
  return component.items.map((item, index) => {
    const proportion = item.value / sum, end = angle + proportion * Math.PI * 2, middle = (angle + end) / 2;
    // Keep a gap small enough that even a tiny positive slice remains visible.
    const gap = Math.min(.012, (end - angle) / 8), point = polar(140, 201, donut ? 94 : 79, middle);
    const percentage = `${number(proportion * 100)}%`, y = 46 + index * 70;
    const html = `<path data-slice="${index}" data-value="${item.value}" d="${arc(123, donut ? 65 : 0, angle + gap, end - gap)}" fill="${color(item, index)}"><title>${escape(`${item.label}: ${amount(item.value, component.unit)} (${percentage})`)}</title></path>${proportion >= .075 ? text(point[0], point[1] + 6, percentage, { size: 18, anchor: "middle", bold: true, fill: sliceTextColor(component, item, index) }) : ""}<circle cx="282" cy="${y - 6}" r="5" fill="${color(item, index)}"/>${text(297, y, item.label, { size: 18, width: 144 })}${text(297, y + 43, percentage, { size: 20, bold: true })}`;
    angle = end;
    return html;
  }).join("") + (donut ? text(140, 207, "100%", { anchor: "middle", size: 26, bold: true }) : "") + text(140, 376, `Total ${amount(sum, component.unit, true)}`, { anchor: "middle", size: 18, width: 260, fill: "var(--sc-muted)" });
}

function pyramid(component: Component) {
  const step = 344 / component.items.length, half = (y: number) => (y - 16) / 344 * 142;
  return component.items.map((item, index) => {
    const top = 16 + index * step, bottom = 16 + (index + 1) * step - (index === component.items.length - 1 ? 0 : 3), middle = (top + bottom) / 2;
    return `<path data-layer="${index}" d="M${150 - half(top)} ${top} H${150 + half(top)} L${150 + half(bottom)} ${bottom} H${150 - half(bottom)} Z" fill="${index === 0 ? color(item, index) : item.color || soft(12 + index * 9)}"/>${text(150, middle + 7, String(index + 1), { anchor: "middle", bold: true, fill: index === 0 ? "var(--sc-on-accent)" : "var(--sc-ink)" })}${line(150 + half(middle) + 9, middle, 305, middle)}${text(317, middle + 7, item.label, { size: 18, width: 126, bold: true })}`;
  }).join("");
}

function hub(component: Component) {
  const positions = [[222, 55], [67, 200], [377, 200], [222, 345]];
  const indices = component.items.length === 2 ? [1, 2] : component.items.length === 3 ? [0, 1, 2] : [0, 1, 2, 3];
  return indices.map(index => line(222, 200, positions[index][0], positions[index][1])).join("") + component.items.map((item, index) => {
    const [x, y] = positions[indices[index]];
    return `<rect x="${x - 64}" y="${y - 33}" width="128" height="66" rx="12" fill="${item.color || soft(12)}"/>${text(x, y - 3, item.label, { size: 18, width: 115, anchor: "middle", bold: true })}`;
  }).join("") + `<circle cx="222" cy="200" r="75" fill="var(--sc-accent)"/>${text(222, 195, component.prompt, { size: 22, anchor: "middle", width: 128, bold: true, fill: "var(--sc-on-accent)" })}`;
}

function funnel(component: Component) {
  const step = 342 / component.items.length, opening = component.items[0].value;
  return component.items.map((item, index) => {
    const top = 286 - index * 196 / component.items.length, bottom = 286 - (index + 1) * 196 / component.items.length, y = 10 + index * step, last = index === component.items.length - 1;
    return `<path data-stage="${index}" d="M${149 - top / 2} ${y} H${149 + top / 2} L${149 + bottom / 2} ${y + step - 8} H${149 - bottom / 2} Z" fill="${item.color || (last ? "var(--sc-accent)" : soft(14 + index * 12))}"/>${text(149, y + step / 2 + 4, String(index + 1).padStart(2, "0"), { anchor: "middle", bold: true, fill: last ? "var(--sc-on-accent)" : "var(--sc-ink)" })}${line(149 + (top + bottom) / 4 + 9, y + step / 2, 305, y + step / 2)}${text(319, y + 16, item.label, { width: 125, size: 17 })}${text(319, y + 53, amount(item.value, component.unit), { size: 23, bold: true, width: 125 })}`;
  }).join("") + text(222, 397, `${number(component.items.at(-1)!.value / opening * 100)}% overall conversion · taper not to scale`, { anchor: "middle", size: 16 });
}

function waterfall(component: Component) {
  let running = 0;
  const stages = component.items.map((item, index) => {
    const total = index === 0 || index === component.items.length - 1;
    const start = total ? 0 : running, end = total ? item.value : running + item.value;
    running = end;
    return { item, start, end, total };
  });
  const values = stages.flatMap(s => [s.start, s.end]), minimum = Math.min(0, ...values), maximum = Math.max(0, ...values), span = maximum - minimum || 1;
  const rough = span / 3, power = 10 ** Math.floor(Math.log10(rough));
  const tickStep = ([1, 2, 5, 10].find(step => step >= rough / power) ?? 10) * power;
  const low = Math.floor(minimum / tickStep) * tickStep, high = Math.max(low + tickStep, Math.ceil(maximum / tickStep) * tickStep), range = high - low;
  const y = (value: number) => 304 - (value - low) / range * 250, step = 382 / stages.length, width = Math.min(54, step * .6);
  const ticks = Array.from({ length: Math.round(range / tickStep) + 1 }, (_, i) => low + i * tickStep);
  return ticks.map(tick => line(54, y(tick), 62, y(tick)) + text(49, y(tick) + 6, amount(tick, "", true), { anchor: "end", size: 16, width: 60, fill: "var(--sc-muted)" })).join("") + line(62, y(0), 444, y(0)) + stages.map((stage, index) => {
    const x = 62 + step * (index + .5) - width / 2, top = y(Math.max(stage.start, stage.end)), height = Math.abs(y(stage.start) - y(stage.end));
    const fill = stage.item.color || (stage.total ? index === 0 ? "var(--sc-ink)" : "var(--sc-accent)" : stage.item.value >= 0 ? "var(--sc-increase)" : "var(--sc-decrease)");
    return `<rect data-waterfall-bar="${index}" data-from="${stage.start}" data-to="${stage.end}" x="${x}" y="${top}" width="${width}" height="${Math.max(1, height)}" rx="3" fill="${fill}"><title>${escape(`${stage.item.label}: ${amount(stage.item.value, component.unit)}`)}</title></rect>${text(x + width / 2, top - 13, `${!stage.total && stage.item.value > 0 ? "+" : ""}${amount(stage.item.value, "", true)}`, { anchor: "middle", size: 19, bold: true })}${text(x + width / 2, 341, stage.item.label, { anchor: "middle", size: 16, width: step - 5 })}${index < stages.length - 1 ? line(x + width, y(stage.end), x + step, y(stage.end), true) : ""}`;
  }).join("") + text(0, 17, component.unit ? `CHANGE · ${component.unit}` : "OPENING + CHANGES = CLOSING", { size: 16, fill: "var(--sc-muted)" }) + `<circle cx="10" cy="393" r="5" fill="var(--sc-increase)"/>${text(23, 399, "Increase", { size: 16 })}<circle cx="123" cy="393" r="5" fill="var(--sc-decrease)"/>${text(136, 399, "Decrease", { size: 16 })}${text(444, 399, `Net ${amount(component.items.at(-1)!.value - component.items[0].value, component.unit)}`, { size: 18, anchor: "end", bold: true })}`;
}

function quadrant(component: Component) {
  return `<rect x="48" y="24" width="366" height="306" fill="${soft(8)}"/>${line(48, 177, 414, 177)}${line(231, 24, 231, 330)}${component.items.map((item, index) => {
    const x = Math.max(48 + item.radius, Math.min(414 - item.radius, 48 + item.x / 100 * 366)), y = Math.max(24 + item.radius, Math.min(330 - item.radius, 330 - item.y / 100 * 306));
    const right = x < 260, labelX = right ? x + item.radius + 10 : x - item.radius - 10;
    return `<circle data-point="${index}" cx="${x}" cy="${y}" r="${item.radius}" fill="${color(item, index)}"/>${text(labelX, y + 5, item.label, { size: 17, width: right ? 440 - labelX : labelX - 48, anchor: right ? "start" : "end", bold: true })}`;
  }).join("")}${text(231, 372, `${component.leftTitle || "X"} · low → high`, { anchor: "middle", size: 18 })}<g transform="rotate(-90 18 177)">${text(18, 177, component.rightTitle || "Y", { anchor: "middle", size: 18, width: 270 })}</g>${text(231, 402, `${component.rightTitle || "Y"} increases upwards`, { anchor: "middle", size: 16, fill: "var(--sc-muted)" })}`;
}

function venn(component: Component) {
  const items = component.items;
  return `<circle cx="144" cy="202" r="126" fill="${items[0].color || soft(10)}"/><circle cx="300" cy="202" r="126" fill="none" stroke="${items[1].color || "var(--sc-accent)"}" stroke-width="2"/><path d="M222 103 A126 126 0 0 1 222 301 A126 126 0 0 1 222 103" fill="${items[2].color || soft(28)}"/>${text(95, 35, component.leftTitle || "Set A", { anchor: "middle", width: 185, bold: true })}${text(349, 35, component.rightTitle || "Set B", { anchor: "middle", width: 185, bold: true })}${[97, 347, 222].map((x, i) => text(x, 192, items[i].label, { anchor: "middle", width: i === 2 ? 96 : 125, size: 18, bold: true }) + (items[i].detail ? text(x, 258, items[i].detail, { anchor: "middle", width: i === 2 ? 85 : 118, size: 16 }) : "")).join("")}`;
}

function heatmap(component: Component) {
  const max = Math.max(1, ...component.items.map(item => item.value));
  const rows = Math.max(5, ...component.items.map(item => item.y + 1)), height = rows === 7 ? 32 : 44;
  return ["M", "T", "W", "T", "F", "S", "S"].slice(0, rows).map((name, row) => text(17, 87 + row * height, name, { size: 18 })).join("") + Array.from({ length: 6 * rows }, (_, index) => {
    const col = Math.floor(index / rows), row = index % rows, item = component.items.find(item => item.x === col && item.y === row), fill = item ? soft(8 + item.value / max * 80) : "var(--sc-surface)";
    return `<rect data-cell="${col}:${row}" data-missing="${!item}" x="${48 + col * 65}" y="${65 + row * height}" width="52" height="${height - 10}" rx="4" fill="${item?.color || fill}"${item ? "" : ' stroke="var(--sc-line)" stroke-dasharray="2 3"'}><title>${escape(item ? `${item.label}: ${amount(item.value, component.unit)}` : `Week ${col + 1}, day ${row + 1}: no data`)}</title></rect>`;
  }).join("") + Array.from({ length: 6 }, (_, i) => text(74 + i * 65, 330, `W${i + 1}`, { anchor: "middle", size: 17 })).join("") + [0, .25, .5, .75, 1].map((fraction, i) => `<rect x="${115 + i * 37}" y="365" width="28" height="25" rx="3" fill="${soft(8 + fraction * 80)}"/>`).join("") + text(45, 384, "0", { size: 17 }) + text(313, 384, `${number(max)} ${component.unit}`, { size: 17, width: 130 }) + text(222, 415, "Outline = no data", { anchor: "middle", size: 15, fill: "var(--sc-muted)" });
}

function swimlane(component: Component) {
  const end = Math.max(...component.items.map(item => item.value + item.value2)), maximum = Math.max(1, end), step = 280 / component.items.length;
  return Array.from({ length: 5 }, (_, index) => text(132 + index * 75, 28, number(index * maximum / 4), { anchor: "middle", size: 16, fill: "var(--sc-muted)" }) + line(132 + index * 75, 45, 132 + index * 75, 338)).join("") + component.items.map((item, index) => {
    const y = 55 + index * step, width = item.value2 / maximum * 300;
    return text(0, y + 25, item.label, { width: 118, size: 18, bold: true }) + `<rect data-task="${index}" x="${132 + item.value / maximum * 300}" y="${y}" width="${width}" height="${Math.min(52, step - 12)}" rx="6" fill="${item.color || (index === 0 ? "var(--sc-accent)" : soft(18 + index * 8))}"><title>${escape(`${item.label}: starts ${item.value}, duration ${amount(item.value2, component.unit)}`)}</title></rect>`;
  }).join("") + text(282, 388, `Time${component.unit ? ` · ${component.unit}` : ""}`, { anchor: "middle", size: 18, fill: "var(--sc-muted)" });
}

function flow(component: Component) {
  const sources = component.items.filter(item => item.group === "source"), destinations = component.items.filter(item => item.group === "destination"), total = sources.reduce((sum, item) => sum + item.value, 0);
  const side = (items: Item[], source: boolean) => {
    let middle = 103, sideY = 48;
    return items.map((item, index) => {
      const size = item.value / total * 224, top = sideY, bottom = top + size, next = middle + size, fill = color(item, index);
      sideY = bottom + 40;
      const path = source ? `M40 ${top} C120 ${top} 120 ${middle} 205 ${middle} L205 ${next} C120 ${next} 120 ${bottom} 40 ${bottom} Z` : `M239 ${middle} C324 ${middle} 324 ${top} 404 ${top} L404 ${bottom} C324 ${bottom} 324 ${next} 239 ${next} Z`;
      middle = next;
      return `<path data-flow="${source ? "source" : "destination"}" data-value="${item.value}" d="${path}" fill="${fill}" opacity=".65"/>${text(source ? 0 : 444, top - 14, `${item.label} · ${amount(item.value, component.unit, true)}`, { anchor: source ? "start" : "end", width: 190, size: 17, bold: true })}`;
    }).join("");
  };
  return side(sources, true) + side(destinations, false) + `<rect x="205" y="103" width="34" height="224" rx="3" fill="var(--sc-ink)"/>${text(222, 81, amount(total, component.unit, true), { size: 23, bold: true, anchor: "middle" })}${text(222, 412, `${amount(total, component.unit, true)} in = ${amount(total, component.unit, true)} out`, { size: 18, anchor: "middle", fill: "var(--sc-muted)" })}`;
}

function market(component: Component) {
  return `<circle cx="137" cy="167" r="134" fill="${component.items[0].color || soft(10)}"/><circle cx="137" cy="211" r="90" fill="${component.items[1].color || soft(28)}"/><circle cx="137" cy="253" r="48" fill="${component.items[2].color || "var(--sc-accent)"}"/>${component.items.map((item, index) => {
    const y = [81, 166, 254][index], start = [247, 221, 185][index];
    return text(137, y + 7, item.tag || ["TAM", "SAM", "SOM"][index], { anchor: "middle", size: 19, bold: true, width: 100, fill: index === 2 ? "var(--sc-on-accent)" : "var(--sc-ink)" }) + line(start, y, 280, y) + text(294, y - 4, amount(item.value, component.unit, true), { size: 26, bold: true, width: 150 }) + text(294, y + 25, item.label, { size: 17, width: 149 });
  }).join("")}` + text(222, 393, "Illustrative nesting · circles not to scale", { anchor: "middle", size: 16, fill: "var(--sc-muted)" });
}

const renderers: Partial<Record<Component["kind"], (component: Component) => string>> = {
  pieChart: pie, hierarchyPyramid: pyramid, hubSpoke: hub, conversionFunnel: funnel,
  waterfall, quadrant, venn, calendarHeatmap: heatmap, swimlane,
  proportionalFlow: flow, marketSizing: market,
};

export function semanticDiagramHtml(component: Component): string | null {
  const render = renderers[component.kind];
  if (!render) return null;
  const validated = SemanticComponentSchema.safeParse(component);
  if (!validated.success) return `<p class="sc-diagram-note" role="alert">${escape(validated.error.issues[0]?.message || "Correct the component data to preview.")}</p>`;
  component = validated.data;
  const title = component.kind === "hubSpoke" ? component.answer : component.prompt;
  return `${title ? `<h3 class="sc-diagram-heading">${escape(title)}</h3>` : ""}<div class="sc-native-diagram"><svg viewBox="0 0 444 426" role="img" aria-label="${escape(title || component.prompt || component.kind)}" xmlns="http://www.w3.org/2000/svg"><desc>${escape(component.items.map(item => `${item.label}${item.detail ? `: ${item.detail}` : ""}`).join("; "))}</desc>${render(component)}</svg></div>${component.note ? `<p class="sc-diagram-note">${escape(component.note)}</p>` : ""}`;
}

export const SEMANTIC_DIAGRAM_CSS = `
  .sc-diagram-component{display:flex;flex-direction:column;gap:1.5%;min-height:0;--sc-series-4:#467640;--sc-series-5:#9B4874;--sc-increase:#4385A4;--sc-decrease:#B96537}
  .sc-diagram-component .sc-diagram-heading{font-family:var(--sc-heading-font,var(--sc-font));font-size:4.4cqw;line-height:1.12;margin:0;letter-spacing:-.025em}
  .sc-native-diagram{position:relative;flex:1;min-height:0;width:100%}
  .sc-native-diagram svg{display:block;width:100%;height:100%;font-family:var(--sc-font)}
  .sc-diagram-component .sc-diagram-note{font-size:2cqw;color:var(--sc-muted);margin:0}
`;
