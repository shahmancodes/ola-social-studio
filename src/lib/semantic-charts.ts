import type { SlideSpec } from "./schemas";
import { barScale } from "./chart-scale";

type Component = NonNullable<SlideSpec["semanticComponent"]>;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function semanticValue(value: number, unit = "") {
  const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  return /^[£$€]$/.test(unit) ? unit + number : number + (unit && unit !== "%" ? ` ${unit}` : unit);
}

function wrapLabel(value: string, width: number, size: number) {
  const limit = Math.max(3, Math.floor(width / (size * .62)));
  const lines: string[] = [];
  let current = "";
  for (const word of value.split(/\s+/)) {
    if (current && current.length + word.length + 1 > limit) { lines.push(current); current = ""; }
    let rest = word;
    while (rest.length > limit) { lines.push(rest.slice(0, limit)); rest = rest.slice(limit); }
    current = current ? `${current} ${rest}` : rest;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
function label(x: number, y: number, value: string, anchor = "middle", size = 20, accent = false, width = Infinity) {
  const lines = wrapLabel(value, width, size);
  const content = lines.length === 1 ? escape(value) : lines.map((entry, i) => `<tspan x="${x}" dy="${i ? size * 1.2 : 0}">${escape(entry)}</tspan>`).join("");
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="var(--sc-${accent ? "accent" : "muted"})">${content}</text>`;
}
const line = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--sc-line)" stroke-width="1"/>`;
const title = (value: string) => `<title>${escape(value)}</title>`;

/** Shared axes keep quantitative graphics readable in both the editor and exports. */
export function semanticChartPlot(component: Component) {
  const { items, kind, unit } = component;
  const left = 104, right = 722, top = 32, bottom = 310;
  const domain = barScale(items.map(item => kind === "scatterPlot" ? item.value2 : item.value), kind === "scatterPlot" ? "" : unit);
  const y = (value: number) => bottom - (value - domain.min) / (domain.max - domain.min) * (bottom - top);
  let plot = "", plotHeight = 400;
  if (kind === "bulletChart") {
    const scale = barScale(items.flatMap(item => [item.value, item.value2]), unit);
    const x = (value: number) => left + value / scale.max * (right - left);
    const lineCounts = items.map(item => wrapLabel(item.label, 375, 22).length);
    const step = Math.max(270 / items.length, Math.max(...lineCounts) * 26 + 40);
    const plotBottom = 54 + items.length * step;
    plotHeight = Math.max(400, plotBottom + 60);
    plot = scale.ticks.map(tick => label(x(tick), 25, semanticValue(tick, unit), "middle", 18) + line(x(tick), 38, x(tick), plotBottom - 10)).join("");
    plot += items.map((item, index) => {
      const row = 54 + index * step;
      const barY = row + lineCounts[index] * 26 + 5;
      return label(left, row + 16, item.label, "start", 22, false, 375) + label(right, row + 16, `${semanticValue(item.value, unit)} / ${semanticValue(item.value2, unit)}`, "end", 20) + `<rect x="${left}" y="${barY}" width="${right - left}" height="16" rx="4" fill="var(--sc-line)"/><rect data-actual="${item.value}" x="${left}" y="${barY}" width="${x(item.value) - left}" height="16" rx="4" fill="var(--sc-accent)"/><path data-target="${item.value2}" d="M${x(item.value2)} ${barY - 6}v28" stroke="var(--sc-ink)" stroke-width="3"/>`;
    }).join("");
    plot += `<rect x="245" y="${plotHeight - 35}" width="20" height="10" rx="2" fill="var(--sc-accent)"/>${label(275, plotHeight - 22, component.leftTitle || "Actual", "start", 20)}<path d="M445 ${plotHeight - 41}v24" stroke="var(--sc-ink)" stroke-width="3"/>${label(458, plotHeight - 22, component.rightTitle || "Target", "start", 20)}`;
  } else {
    plot = domain.ticks.map(tick => line(left, y(tick), right, y(tick)) + label(left - 14, y(tick) + 6, semanticValue(tick, kind === "scatterPlot" || unit.length > 3 ? "" : unit), "end", 18)).join("");
    const categorySize = items.length > 8 ? 15 : 18;
    const interval = (right - left) / (kind === "lineChart" ? items.length - 1 : items.length);
    // Dense category axes show evenly spaced ticks; all observations remain in
    // the plot, point titles and accessible description. Avoid splintering dates.
    const crowded = items.some(item => item.label.length * categorySize * .62 > interval * .8);
    const tickCount = crowded ? Math.min(6, items.length) : items.length;
    const tickIndices = Array.from({ length: tickCount }, (_, i) => Math.round(i * (items.length - 1) / (tickCount - 1)));
    const tickSet = new Set(tickIndices);
    const tickSpacing = Math.min(...tickIndices.slice(1).map((value, i) => value - tickIndices[i]));
    const categoryWidth = interval * tickSpacing * .8;
    if (kind === "lineChart" || kind === "histogram") plotHeight = Math.max(400, 350 + Math.max(...tickIndices.map(i => wrapLabel(items[i].label, categoryWidth, categorySize).length)) * categorySize * 1.2 + (unit.length > 3 ? 35 : 0));
    if (kind === "lineChart") {
      const x = (index: number) => left + index / (items.length - 1) * (right - left);
      plot += `<path d="${items.map((item, i) => `${i ? "L" : "M"}${x(i)},${y(item.value)}`).join(" ")}" fill="none" stroke="var(--sc-accent)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
      plot += items.map((item, i) => `<circle cx="${x(i)}" cy="${y(item.value)}" r="5" fill="var(--sc-accent)">${title(`${item.label}: ${semanticValue(item.value, unit)}`)}</circle>${tickSet.has(i) ? label(x(i), 342, item.label, i === 0 ? "start" : i === items.length - 1 ? "end" : "middle", categorySize, false, categoryWidth) : ""}`).join("");
      plot += label(right, y(items.at(-1)!.value) - 14, semanticValue(items.at(-1)!.value, unit), "end", 22, true);
    } else if (kind === "histogram") {
      const step = (right - left) / items.length;
      plot += items.map((item, i) => `<rect x="${left + i * step + 1}" y="${y(item.value)}" width="${step - 2}" height="${bottom - y(item.value)}" fill="var(--sc-accent)">${title(`${item.label}: ${semanticValue(item.value, unit)}`)}</rect>${tickSet.has(i) ? label(left + (i + .5) * step, 342, item.label, "middle", categorySize, false, categoryWidth) : ""}`).join("");
    } else if (kind === "scatterPlot") {
      const scale = barScale(items.map(item => item.value), "");
      const x = (value: number) => left + (value - scale.min) / (scale.max - scale.min) * (right - left);
      plot += scale.ticks.map(tick => line(x(tick), top, x(tick), bottom) + label(x(tick), 342, semanticValue(tick), "middle", 18)).join("");
      plot += items.map(item => `<circle cx="${x(item.value)}" cy="${y(item.value2)}" r="7" fill="${item.color || "var(--sc-accent)"}" stroke="var(--sc-surface)" stroke-width="2">${title(`${item.label}: ${item.value}, ${item.value2}`)}</circle>`).join("");
      plot += label((left + right) / 2, 386, component.leftTitle || "X", "middle", 20) + `<g transform="rotate(-90 22 170)">${label(22, 170, component.rightTitle || "Y", "middle", 20)}</g>`;
    }
    if (kind !== "scatterPlot" && unit.length > 3) plot += label(left, plotHeight - 14, unit, "start", 18);
  }
  const description = items.map(item => `${item.label}: ${semanticValue(item.value, unit)}${kind === "scatterPlot" ? `, ${item.value2}` : kind === "bulletChart" ? `; target ${semanticValue(item.value2, unit)}` : ""}`).join("; ");
  return `<div class="sc-chart-plot"><svg viewBox="0 0 760 ${plotHeight}" role="img" aria-label="${escape(component.prompt || description)}" xmlns="http://www.w3.org/2000/svg"><desc>${escape(description)}</desc>${plot}</svg></div>`;
}

export const SEMANTIC_CHART_CSS = `
  .sc-chart-plot{flex:1;min-height:0;margin-top:3%;width:100%}
  .sc-chart-plot svg{display:block;width:100%;height:100%;overflow:visible;font-family:var(--sc-font)}
  .rd-semantic-bulletChart{display:flex;flex-direction:column}
`;
