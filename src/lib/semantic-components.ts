import type { SlideSpec } from "./schemas";

type Component = NonNullable<SlideSpec["semanticComponent"]>;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function emphasis(value: string) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

const fontFamilies = {
  manrope: '"Manrope Variable",Manrope,Arial,sans-serif',
  poppins: 'Poppins,Arial,sans-serif',
  system: 'Arial,Helvetica,sans-serif',
  serif: 'Georgia,"Times New Roman",serif',
} as const;

function componentStyle(component: Component) {
  const style = component.style;
  if (!style) return "";
  return [
    `--rd-accent:${style.accent}`, `--sc-accent:${style.accent}`,
    `--sc-ink:${style.foreground}`, `--sc-muted:${style.muted}`,
    `--sc-line:${style.line}`, `--sc-surface:${style.surface}`,
    `--sc-series-2:${style.seriesTwo}`, `--sc-series-3:${style.seriesThree}`,
    `--sc-on-accent:${style.onAccent}`, `--sc-font:${fontFamilies[style.fontFamily]}`,
    `--sc-quote-font:${fontFamilies[style.quoteFontFamily]}`,
  ].join(";");
}

const finite = (value: number) => Number.isFinite(value) ? value : 0;
const formatValue = (value: number, unit: string) => `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
const maxPositive = (values: number[]) => Math.max(1, ...values.map((value) => Math.max(0, finite(value))));

export function semanticComponentHtml(component: Component, mascotIcon = "", illustrationUrl = "") {
  const items = component.items;
  let content = "";
  switch (component.kind) {
    case "processLoop":
      {
        const arcs = items.length === 2
          ? ["M88 42 Q92 50 88 58", "M12 58 Q8 50 12 42"]
          : items.length === 3
            ? ["M74 13 Q86 20 88 32", "M59 96 Q50 99 41 96", "M12 32 Q14 20 26 13"]
            : ["M74 13 Q86 20 88 32", "M26 87 Q14 80 12 68"];
        content = `<div class="rd-loop-diagram rd-loop-count-${items.length}"><div class="rd-loop-track"></div><svg class="rd-loop-curves" viewBox="0 0 100 100" aria-hidden="true"><defs><marker id="rd-loop-head-${items.length}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="3.5" markerHeight="3.5" orient="auto"><path d="M0 0 L8 4 L0 8 Z" /></marker></defs>${arcs.map((arc) => `<path class="rd-loop-curve" d="${arc}" marker-end="url(#rd-loop-head-${items.length})" />`).join("")}</svg>${items.map((item, index) => `<div class="rd-loop-node rd-loop-node-${index + 1}"><span class="rd-loop-step">${String(index + 1).padStart(2, "0")}</span><span class="rd-loop-label">${emphasis(item.label)}</span></div>`).join("")}<span class="rd-loop-center">REPEAT</span></div>`;
      }
      break;
    case "decisionTree":
      content = `<div class="rd-tree-question">${emphasis(component.prompt)}</div><div class="rd-tree-fork"><svg viewBox="0 0 1000 190" preserveAspectRatio="none" aria-hidden="true"><path d="M500 0 V38 M500 38 C500 118 210 80 210 190 M500 38 C500 118 790 80 790 190" /></svg></div><div class="rd-tree-branches">${items.map((item) => `<div><span class="rd-tree-choice">${emphasis(item.tag || item.label)}</span><strong>${emphasis(item.tag ? item.label : "")}</strong><p>${emphasis(item.detail)}</p></div>`).join("")}</div>`;
      break;
    case "checklist":
      content = `<div class="rd-checklist">${items.map((item) => `<div class="rd-check-row"><span class="rd-check-icon">✓</span><div><strong>${emphasis(item.label)}</strong>${item.detail ? `<p>${emphasis(item.detail)}</p>` : ""}</div></div>`).join("")}</div>`;
      break;
    case "comparison":
      content = `<div class="rd-comparison"><div><h3>${escapeHtml(component.leftTitle)}</h3>${items.map((item) => `<div class="rd-compare-row"><span>✕</span><p>${emphasis(item.label)}</p></div>`).join("")}</div><div><h3>${escapeHtml(component.rightTitle)}</h3>${items.map((item) => `<div class="rd-compare-row"><span>✓</span><p>${emphasis(item.detail)}</p></div>`).join("")}</div></div>`;
      break;
    case "timeline":
      content = `<div class="rd-timeline">${items.map((item) => `<div class="rd-time-row"><span class="rd-time-tag">${escapeHtml(item.tag || "•")}</span><div><strong>${emphasis(item.label)}</strong>${item.detail ? `<p>${emphasis(item.detail)}</p>` : ""}</div></div>`).join("")}</div>`;
      break;
    case "chatExchange":
      content = `<div class="rd-chat">${items.map((item) => `<div class="rd-chat-line rd-chat-${item.speaker}"><span class="rd-chat-speaker">${item.speaker === "mascot" ? `${mascotIcon ? `<img src="${escapeHtml(mascotIcon)}" alt=""> ` : ""}${escapeHtml(component.rightTitle || (mascotIcon ? "TEAM" : "TEAM"))}` : escapeHtml(component.leftTitle || (mascotIcon ? "STUDENT" : "CUSTOMER"))}</span><div class="rd-chat-bubble">${emphasis(item.label)}</div></div>`).join("")}</div>`;
      break;
    case "annotatedExample":
      content = `<div class="rd-example"><span class="rd-example-label">${escapeHtml(component.prompt)}</span><p>${emphasis(component.answer)}</p></div><div class="rd-annotations">${items.map((item, index) => `<div><span>${index + 1}</span><p><strong>${emphasis(item.label)}</strong> ${emphasis(item.detail)}</p></div>`).join("")}</div>`;
      break;
    case "scoreBreakdown":
      content = `<div class="rd-score-formula"><span>${escapeHtml(items[0].tag)}</span><b>+</b><span>${escapeHtml(items[1].tag)}</span><b>=</b><span>${escapeHtml(items[2].tag)}</span></div><div class="rd-score-labels"><div><strong>${emphasis(items[0].label)}</strong><p>${emphasis(items[0].detail)}</p></div><div><strong>${emphasis(items[1].label)}</strong><p>${emphasis(items[1].detail)}</p></div></div><div class="rd-score-takeaway">${emphasis(component.takeaway)}</div>${component.note ? `<p class="rd-score-note">${emphasis(component.note)}</p>` : ""}`;
      break;
    case "progress":
      content = `<div class="sc-progress-head"><span>${emphasis(component.prompt)}</span><strong>${String(component.activeIndex + 1).padStart(2, "0")} <small>/ ${String(items.length).padStart(2, "0")}</small></strong></div><div class="sc-progress-title">${emphasis(component.answer || `${component.activeIndex + 1} steps down. ${items.length - component.activeIndex - 1} to go.`)}</div><div class="sc-progress-stages" style="--sc-count:${items.length}">${items.map((item, index) => `<div class="${index < component.activeIndex ? "done" : index === component.activeIndex ? "active" : ""}"><i></i><span>${emphasis(item.label)}</span></div>`).join("")}</div>`;
      break;
    case "metricSpotlight":
      content = `<span class="sc-kicker">${emphasis(component.prompt)}</span><div class="sc-metric-main"><strong>${formatValue(items[1].value, escapeHtml(component.unit))}</strong><p>${emphasis(component.answer)}</p></div><div class="sc-metric-context"><span>${emphasis(items[0].label)} <b>${formatValue(items[0].value, escapeHtml(component.unit))}</b></span><span>→</span><span>${emphasis(items[1].label)} <b>${formatValue(items[1].value, escapeHtml(component.unit))}</b></span></div>`;
      break;
    case "pullQuote":
      content = `<span class="sc-kicker">${emphasis(component.prompt)}</span><blockquote>“${emphasis(component.answer)}”</blockquote><div class="sc-quote-credit"><i></i><span><strong>${emphasis(items[0].label)}</strong><small>${emphasis(items[0].detail)}</small></span></div>`;
      break;
    case "labeledVisual":
      {
        const illustration = illustrationUrl
          ? `<img class="sc-labeled-image" src="${escapeHtml(illustrationUrl)}" alt="">`
          : `<svg class="sc-labeled-bottle" viewBox="0 0 150 250" aria-hidden="true"><rect class="lid" x="43" y="13" width="64" height="31" rx="8"/><path class="body" d="M42 45 C38 50 35 62 35 72 L35 200 Q35 216 49 216 H101 Q115 216 115 200 V72 C115 62 112 50 108 45 Z"/><path class="wall" d="M46 58 C44 63 43 68 43 75 V196 Q43 207 53 207 H97 Q107 207 107 196 V75 C107 68 106 63 104 58"/><path class="shine" d="M53 65 V192"/><path class="base" d="M45 216 H105"/></svg>`;
        content = `<span class="sc-kicker">${emphasis(component.prompt)}</span><h3>${emphasis(component.answer)}</h3><div class="sc-labeled-layout"><div class="sc-labeled-picture">${illustration}${items.map((item, index) => `<span class="sc-labeled-marker" style="left:${item.x}%;top:${item.y}%">${index + 1}</span>`).join("")}</div><div class="sc-labeled-notes">${items.map((item, index) => `<div><b>${String(index + 1).padStart(2, "0")}</b><span><strong>${emphasis(item.label)}</strong><small>${emphasis(item.detail)}</small></span></div>`).join("")}</div></div>`;
      }
      break;
    case "priorityStack":
      content = `<span class="sc-kicker">${emphasis(component.prompt)}</span><h3>${emphasis(component.answer)}</h3><div class="sc-priorities">${items.map((item, index) => `<div class="${index === 0 ? "first" : ""}"><b>${String(index + 1).padStart(2, "0")}</b><span><small>${emphasis(item.tag)}</small><strong>${emphasis(item.label)}</strong>${item.detail ? `<p>${emphasis(item.detail)}</p>` : ""}</span></div>`).join("")}</div>`;
      break;
    case "continuum":
      content = `<span class="sc-kicker">${emphasis(component.prompt)}</span><h3>${emphasis(component.answer)}</h3><div class="sc-spectrum-choice"><small>SELECTED</small><strong>${emphasis(items[component.activeIndex].label)}</strong></div><div class="sc-spectrum" style="--sc-count:${items.length}">${items.map((item, index) => `<div class="${index === component.activeIndex ? "selected" : ""}"><i></i><span>${emphasis(item.label)}</span></div>`).join("")}</div><div class="sc-spectrum-ends"><span>${emphasis(component.leftTitle || "More freedom")}</span><span>${emphasis(component.rightTitle || "More control")}</span></div>`;
      break;
    case "barChart":
      {
        const maximum = maxPositive(items.map((item) => item.value)) * 1.1;
        content = `<span class="sc-kicker">CATEGORY COMPARISON</span><h3>${emphasis(component.prompt)}</h3><p class="sc-chart-unit">${emphasis(component.answer)}</p><div class="sc-bar-rows">${items.map((item) => `<div><span>${emphasis(item.label)}</span><i><b style="width:${Math.max(0, item.value) / maximum * 100}%"></b></i><strong>${formatValue(item.value, escapeHtml(component.unit))}</strong></div>`).join("")}</div>`;
      }
      break;
    case "lineChart":
      {
        const values = items.map((item) => finite(item.value));
        const minimum = Math.min(...values); const maximum = Math.max(...values);
        const spread = Math.max(1, maximum - minimum);
        const points = values.map((value, index) => `${30 + index * 940 / Math.max(1, items.length - 1)},${315 - (value - minimum) / spread * 250}`);
        content = `<span class="sc-kicker">CHANGE OVER TIME</span><h3>${emphasis(component.prompt)}</h3><p class="sc-chart-unit">${emphasis(component.answer)}</p><div class="sc-line-field"><svg viewBox="0 0 1000 360" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(component.prompt)}"><path d="M${points.join(" L")}"/><circle cx="${points.at(-1)?.split(",")[0]}" cy="${points.at(-1)?.split(",")[1]}" r="8"/></svg><strong>${formatValue(values.at(-1) ?? 0, escapeHtml(component.unit))}</strong></div><div class="sc-line-labels"><span>${emphasis(items[0].label)}</span><span>${emphasis(items.at(-1)?.label ?? "")}</span></div>`;
      }
      break;
    case "stackedBar":
      content = `<span class="sc-kicker">PARTS OF A WHOLE</span><h3>${emphasis(component.prompt)}</h3><p class="sc-chart-unit">${emphasis(component.answer)}</p><div class="sc-stack-rows">${items.map((item) => { const sum = Math.max(1, item.value + item.value2 + item.value3); return `<div><strong>${emphasis(item.label)}</strong><span><i style="width:${Math.max(0, item.value) / sum * 100}%"></i><i style="width:${Math.max(0, item.value2) / sum * 100}%"></i><i style="width:${Math.max(0, item.value3) / sum * 100}%"></i></span></div>`; }).join("")}</div><div class="sc-stack-legend"><span><i></i>${emphasis(component.leftTitle || "Series 1")}</span><span><i></i>${emphasis(component.rightTitle || "Series 2")}</span><span><i></i>${emphasis(component.takeaway || "Series 3")}</span></div>`;
      break;
    case "scatterPlot":
      {
        const xValues = items.map((item) => item.value), yValues = items.map((item) => item.value2);
        const xMin = Math.min(...xValues), yMin = Math.min(...yValues);
        const xSpan = Math.max(1, Math.max(...xValues) - xMin), ySpan = Math.max(1, Math.max(...yValues) - yMin);
        content = `<span class="sc-kicker">RELATIONSHIP</span><h3>${emphasis(component.prompt)}</h3><p class="sc-chart-unit">${emphasis(component.answer)}</p><div class="sc-scatter-wrap"><span class="sc-scatter-y">${emphasis(component.rightTitle || "Y")}</span><div class="sc-scatter-field" role="img" aria-label="${escapeHtml(component.prompt)}">${items.map((item) => `<i style="left:${8 + (item.value - xMin) / xSpan * 84}%;bottom:${8 + (item.value2 - yMin) / ySpan * 84}%" title="${escapeHtml(`${item.label}: ${item.value}, ${item.value2}`)}"></i>`).join("")}</div></div><span class="sc-scatter-x">${emphasis(component.leftTitle || "X")} →</span>`;
      }
      break;
    case "histogram":
      {
        const maximum = maxPositive(items.map((item) => item.value));
        content = `<span class="sc-kicker">DISTRIBUTION</span><h3>${emphasis(component.prompt)}</h3><p class="sc-chart-unit">${emphasis(component.answer)}</p><div class="sc-hist-field" role="img" aria-label="${escapeHtml(component.prompt)}">${items.map((item) => `<i style="height:${Math.max(0, item.value) / maximum * 100}%" title="${escapeHtml(`${item.label}: ${item.value} ${component.unit}`)}"></i>`).join("")}</div><div class="sc-hist-labels"><span>${emphasis(items[0].label)}</span><span>${emphasis(items.at(-1)?.label ?? "")}</span></div>`;
      }
      break;
  }
  return `<div class="rd-semantic rd-semantic-${component.kind}" data-kind="${component.kind}" style="${componentStyle(component)}">${content}</div>`;
}

// cqw is relative to the 1080px slide in export and to the editor canvas in preview.
export const SEMANTIC_COMPONENT_CSS = `
  .rd-semantic{--sc-ink:#07070a;--sc-muted:#53535c;--sc-line:#d7d7dc;--sc-surface:#fff;--sc-accent:var(--rd-accent);--sc-series-2:#9599a6;--sc-series-3:#c9cbd2;--sc-on-accent:#fff;--sc-font:"Manrope Variable",Manrope,Arial,sans-serif;--sc-quote-font:Georgia,serif;position:relative;width:100%;height:100%;font-family:var(--sc-font);color:var(--sc-ink);line-height:1.15}
  .rd-semantic p,.rd-semantic h3{margin:0}.rd-semantic strong{font-weight:800}
  .rd-loop-diagram{position:absolute;top:3%;left:14%;width:72%;aspect-ratio:1}
  .rd-loop-track{position:absolute;inset:17%;border:3px solid var(--rd-accent);border-radius:50%;opacity:.4}
  .rd-loop-curves{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:1}.rd-loop-curve{fill:none;stroke:var(--rd-accent);stroke-width:.65;stroke-linecap:round}.rd-loop-curves marker path{fill:var(--rd-accent)}
  .rd-loop-node{position:absolute;display:flex;flex-direction:column;justify-content:center;align-items:center;width:29%;aspect-ratio:1;border:3px solid #07070a;border-radius:50%;background:#fff;text-align:center;font-size:3.2cqw;font-weight:800;line-height:1.08;padding:2%}
  .rd-loop-step{display:block;color:var(--rd-accent);font-size:2.5cqw;margin-bottom:2%}.rd-loop-label{display:block;max-width:100%;overflow-wrap:anywhere}.rd-loop-node-1{left:35.5%;top:0}.rd-loop-node-2{right:0;top:35.5%}.rd-loop-node-3{left:35.5%;bottom:0}.rd-loop-node-4{left:0;top:35.5%}.rd-loop-node-1{background:var(--rd-accent);border-color:var(--rd-accent);color:#fff}.rd-loop-node-1 .rd-loop-step{color:#fff}.rd-loop-center{position:absolute;left:35%;top:46%;width:30%;text-align:center;color:var(--rd-accent);font-size:3.4cqw;font-weight:800}
  .rd-loop-count-2 .rd-loop-node-2{left:35.5%;right:auto;top:auto;bottom:0}
  .rd-loop-count-3 .rd-loop-node-2{right:5%;top:auto;bottom:7%}.rd-loop-count-3 .rd-loop-node-3{left:5%;bottom:7%}
  .rd-tree-question{width:70%;margin:0 auto;padding:3%;border:2px solid #07070a;border-radius:999px;background:#fff;text-align:center;font-size:3.8cqw;font-weight:800}.rd-tree-fork{height:19%;width:100%}.rd-tree-fork svg{width:100%;height:100%}.rd-tree-fork path{fill:none;stroke:#07070a;stroke-width:3;vector-effect:non-scaling-stroke}.rd-tree-branches{display:grid;grid-template-columns:1fr 1fr;gap:8%;text-align:center}.rd-tree-branches>div{min-width:0}.rd-tree-choice{display:grid;place-items:center;width:55%;min-height:7cqw;margin:0 auto 5%;padding:2%;border:2px solid #07070a;border-radius:999px;background:#fff;font-size:3cqw;font-weight:800}.rd-tree-branches>div:first-child .rd-tree-choice{background:var(--rd-accent);border-color:var(--rd-accent);color:#fff}.rd-tree-branches strong{display:block;font-size:3.3cqw}.rd-tree-branches p{margin:3% auto 0;max-width:95%;font-size:2.9cqw;font-weight:500}
  .rd-checklist{display:grid;gap:4%;height:100%;align-content:space-evenly}.rd-check-row{display:flex;align-items:flex-start;gap:5%;text-align:left}.rd-check-icon{display:grid;place-items:center;flex:none;width:8cqw;height:8cqw;border-radius:50%;background:var(--rd-accent);color:#fff;font-size:4cqw;font-weight:800}.rd-check-row strong{display:block;font-size:3.8cqw;line-height:1.1}.rd-check-row p{margin-top:1.5%;font-size:2.9cqw;font-weight:400}
  .rd-comparison{display:grid;grid-template-columns:1fr 1fr;gap:8%;height:100%;align-items:start}.rd-comparison>div{min-width:0}.rd-comparison h3{min-height:8cqw;font-size:3.5cqw;line-height:1.1;font-weight:800;text-align:left}.rd-compare-row{display:grid;grid-template-columns:5cqw 1fr;gap:2%;align-items:baseline;min-height:9cqw;margin-top:4%;font-size:3.1cqw;text-align:left}.rd-compare-row span{font-size:4.5cqw;font-weight:800;color:#07070a}.rd-comparison>div:last-child .rd-compare-row span{color:var(--rd-accent)}.rd-compare-row p{font-weight:500}
  .rd-timeline{height:100%;display:flex;flex-direction:column;justify-content:space-around;border-left:2px solid #07070a;margin-left:4cqw}.rd-time-row{position:relative;display:flex;align-items:start;gap:4%;margin-left:-4cqw}.rd-time-tag{display:grid;place-items:center;flex:none;width:8cqw;height:8cqw;border:2px solid #07070a;border-radius:50%;background:#fff;font-size:2.6cqw;font-weight:800}.rd-time-row:nth-child(2) .rd-time-tag{color:#fff;background:var(--rd-accent);border-color:var(--rd-accent)}.rd-time-row strong{display:block;font-size:3.5cqw}.rd-time-row p{margin-top:1%;font-size:2.8cqw;font-weight:400}
  .rd-chat{height:100%;display:flex;flex-direction:column;justify-content:space-evenly;gap:2%}.rd-chat-line{max-width:82%;font-size:3.5cqw}.rd-chat-mascot{align-self:flex-end}.rd-chat-speaker{display:flex;align-items:center;gap:2%;margin-bottom:2%;font-size:2.3cqw;font-weight:800}.rd-chat-mascot .rd-chat-speaker{justify-content:flex-end;color:var(--rd-accent)}.rd-chat-speaker img{width:4cqw;height:4cqw;object-fit:contain}.rd-chat-bubble{padding:5% 6%;border:2px solid #07070a;border-radius:3cqw;background:#fff;font-weight:500}.rd-chat-mascot .rd-chat-bubble{background:var(--rd-accent);border-color:var(--rd-accent);color:#fff}
  .rd-example{padding:5%;border:2px solid #07070a;border-radius:2cqw;background:#fff}.rd-example-label{display:block;color:var(--rd-accent);font-size:2.3cqw;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.rd-example p{margin-top:4%;font-size:3.5cqw;line-height:1.25}.rd-example p strong{background:#dccbff}.rd-annotations{display:grid;gap:5%;margin-top:7%}.rd-annotations>div{display:flex;align-items:baseline;gap:4%;font-size:3cqw}.rd-annotations>div>span{display:grid;place-items:center;flex:none;width:5cqw;height:5cqw;border-radius:50%;background:var(--rd-accent);color:#fff;font-weight:800}.rd-annotations p{font-weight:400}
  .rd-score-formula{display:flex;justify-content:center;align-items:center;gap:3%;font-size:10cqw;font-weight:800;letter-spacing:-.06em}.rd-score-formula span:nth-of-type(2){color:var(--rd-accent)}.rd-score-formula b{font-size:6cqw;font-weight:400;color:#53535c}.rd-score-labels{display:grid;grid-template-columns:1fr 1fr;gap:12%;margin:3% auto 0;width:78%;text-align:center;font-size:3cqw}.rd-score-labels p{margin-top:2%;font-weight:400}.rd-score-takeaway{margin:10% auto 0;padding-top:7%;width:82%;border-top:2px solid #a8a8aa;text-align:center;font-size:5cqw;font-weight:800}.rd-score-note{text-align:center;margin:7% auto 0;font-size:2.9cqw;font-weight:500}
  .sc-kicker{display:block;color:var(--sc-muted);font-size:2.1cqw;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.rd-semantic h3{margin:3% 0 0;font-size:5.2cqw;line-height:1.08;letter-spacing:-.05em;font-weight:800}.sc-chart-unit{margin-top:1.5%!important;color:var(--sc-muted);font-size:2.7cqw}
  .rd-semantic-progress{display:flex;flex-direction:column}.sc-progress-head{display:flex;justify-content:space-between;align-items:start;font-size:2.7cqw;font-weight:700}.sc-progress-head strong{font-size:4.4cqw}.sc-progress-head small{color:var(--sc-muted);font-size:2.8cqw}.sc-progress-title{max-width:72%;margin-top:5%;font-size:8.3cqw;line-height:1.04;font-weight:800;letter-spacing:-.055em}.sc-progress-stages{display:grid;grid-template-columns:repeat(var(--sc-count),minmax(0,1fr));gap:.7%;margin-top:auto}.sc-progress-stages>div{min-width:0;color:var(--sc-muted);font-size:2.1cqw}.sc-progress-stages i{display:block;height:2.5cqw;margin-bottom:2cqw;background:var(--sc-line)}.sc-progress-stages .done i{background:var(--sc-accent)}.sc-progress-stages .active i{background:color-mix(in srgb,var(--sc-accent) 38%,var(--sc-surface))}.sc-progress-stages .active span{color:var(--sc-ink);font-weight:800}
  .rd-semantic-metricSpotlight{display:flex;flex-direction:column}.sc-metric-main{display:flex;align-items:end;gap:4%;flex:1}.sc-metric-main strong{color:var(--sc-accent);font-size:17cqw;line-height:.9;letter-spacing:-.1em}.sc-metric-main p{max-width:35%;margin-bottom:1%;font-size:3.3cqw;line-height:1.2;font-weight:600}.sc-metric-context{display:flex;align-items:center;gap:3%;padding-top:3%;border-top:2px solid var(--sc-line);color:var(--sc-muted);font-size:2.6cqw}.sc-metric-context b{color:var(--sc-ink);font-size:3cqw}
  .rd-semantic-pullQuote{display:flex;flex-direction:column}.rd-semantic-pullQuote:before{content:'“';position:absolute;top:-6%;right:1%;font:18cqw/1 var(--sc-quote-font);color:color-mix(in srgb,var(--sc-accent) 10%,var(--sc-surface));pointer-events:none}.rd-semantic-pullQuote blockquote{z-index:1;max-width:93%;margin:auto 0;font:500 6.1cqw/1.2 var(--sc-quote-font);letter-spacing:-.03em}.sc-quote-credit{display:flex;align-items:center;gap:2%;padding-top:3%;border-top:2px solid var(--sc-line)}.sc-quote-credit i{width:.6cqw;height:5cqw;background:var(--sc-accent)}.sc-quote-credit span{display:grid;gap:.5cqw}.sc-quote-credit strong{font-size:2.8cqw}.sc-quote-credit small{color:var(--sc-muted);font-size:2.3cqw}
  .rd-semantic-labeledVisual h3{font-size:5.2cqw}.sc-labeled-layout{display:grid;grid-template-columns:40% minmax(0,1fr);align-items:center;gap:6%;height:78%}.sc-labeled-picture{position:relative;width:100%;height:100%;display:grid;place-items:center}.sc-labeled-bottle,.sc-labeled-image{width:65%;height:95%;object-fit:contain}.sc-labeled-bottle .lid{fill:var(--sc-accent);stroke:var(--sc-ink);stroke-width:2}.sc-labeled-bottle .body{fill:color-mix(in srgb,var(--sc-accent) 10%,var(--sc-surface));stroke:var(--sc-ink);stroke-width:2.5}.sc-labeled-bottle .wall{fill:none;stroke:var(--sc-accent);stroke-width:3}.sc-labeled-bottle .shine{fill:none;stroke:var(--sc-surface);stroke-width:6;stroke-linecap:round}.sc-labeled-bottle .base{fill:none;stroke:var(--sc-ink);stroke-width:4;stroke-linecap:round}.sc-labeled-marker{position:absolute;display:grid;place-items:center;width:5.5cqw;height:5.5cqw;border-radius:50%;background:var(--sc-accent);color:var(--sc-on-accent);font-size:2.5cqw;font-weight:800;transform:translate(-50%,-50%)}.sc-labeled-notes{display:grid;gap:3%}.sc-labeled-notes>div{display:grid;grid-template-columns:6cqw 1fr;gap:2%;padding:3% 0;border-bottom:1px solid var(--sc-line)}.sc-labeled-notes>div:last-child{border:0}.sc-labeled-notes b{color:var(--sc-accent);font-size:2.6cqw}.sc-labeled-notes span{display:grid;gap:1cqw}.sc-labeled-notes strong{font-size:3.5cqw}.sc-labeled-notes small{font-size:2.6cqw;color:var(--sc-muted)}
  .rd-semantic-priorityStack{display:flex;flex-direction:column}.sc-priorities{display:grid;gap:1%;margin-top:5%;overflow:hidden}.sc-priorities>div{display:grid;grid-template-columns:9% 1fr;gap:2%;padding:2.2% 0;border-top:2px solid var(--sc-line)}.sc-priorities>div.first{border-top:3px solid var(--sc-accent)}.sc-priorities b{color:var(--sc-muted);font-size:3cqw}.sc-priorities .first b{color:var(--sc-accent);font-size:4cqw}.sc-priorities span{display:grid;gap:.5cqw}.sc-priorities small{color:var(--sc-accent);font-size:2cqw;font-weight:800;letter-spacing:.09em}.sc-priorities strong{font-size:3.4cqw}.sc-priorities .first strong{font-size:4.1cqw}.sc-priorities p{color:var(--sc-muted);font-size:2.4cqw}
  .rd-semantic-continuum{display:flex;flex-direction:column}.sc-spectrum-choice{display:grid;justify-items:center;gap:1%;margin:auto 0 5%;color:var(--sc-accent)}.sc-spectrum-choice small{font-size:2cqw;font-weight:800;letter-spacing:.12em}.sc-spectrum-choice strong{font-size:5cqw}.sc-spectrum{position:relative;display:grid;grid-template-columns:repeat(var(--sc-count),minmax(0,1fr));align-items:start}.sc-spectrum:before{content:'';position:absolute;top:1.15cqw;left:calc(50% / var(--sc-count));right:calc(50% / var(--sc-count));height:2px;background:var(--sc-ink)}.sc-spectrum>div{z-index:1;display:flex;flex-direction:column;align-items:center;min-width:0;text-align:center;color:var(--sc-muted);font-size:2.3cqw}.sc-spectrum i{box-sizing:border-box;width:2.4cqw;height:2.4cqw;border-radius:50%;background:var(--sc-ink)}.sc-spectrum .selected i{width:4cqw;height:4cqw;margin-top:-.8cqw;border:1cqw solid var(--sc-accent);background:var(--sc-surface);box-shadow:0 0 0 .8cqw color-mix(in srgb,var(--sc-accent) 12%,var(--sc-surface))}.sc-spectrum span{margin-top:2.6cqw;white-space:nowrap}.sc-spectrum .selected span{color:var(--sc-ink);font-weight:800}.sc-spectrum-ends{display:flex;justify-content:space-between;margin-top:4%;padding-top:3%;border-top:2px solid var(--sc-line);color:var(--sc-muted);font-size:2.2cqw}
  .rd-semantic-barChart,.rd-semantic-lineChart,.rd-semantic-stackedBar,.rd-semantic-scatterPlot,.rd-semantic-histogram{display:flex;flex-direction:column}.sc-bar-rows{display:grid;gap:3%;margin:auto 0 4%}.sc-bar-rows>div{display:grid;grid-template-columns:18% 1fr 12%;gap:2%;align-items:center;font-size:2.7cqw}.sc-bar-rows i{height:3cqw}.sc-bar-rows b{display:block;height:100%;background:var(--sc-accent)}.sc-bar-rows strong{text-align:right;font-size:2.7cqw}
  .sc-line-field{position:relative;height:54%;margin-top:auto;border-bottom:2px solid var(--sc-line);background:linear-gradient(to bottom,transparent calc(50% - 1px),var(--sc-line) 50%,transparent calc(50% + 1px))}.sc-line-field svg{width:100%;height:100%;overflow:visible}.sc-line-field path{fill:none;stroke:var(--sc-accent);stroke-width:5;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}.sc-line-field circle{fill:var(--sc-accent)}.sc-line-field strong{position:absolute;right:0;top:3%;color:var(--sc-accent);font-size:3cqw}.sc-line-labels,.sc-hist-labels{display:flex;justify-content:space-between;color:var(--sc-muted);font-size:2.3cqw;margin-top:2%}
  .sc-stack-rows{display:grid;gap:6%;margin:auto 0 4%}.sc-stack-rows>div{display:grid;grid-template-columns:18% 1fr;gap:2%;align-items:center}.sc-stack-rows strong{font-size:2.7cqw}.sc-stack-rows>div>span{display:flex;height:5cqw}.sc-stack-rows i{height:100%}.sc-stack-rows i:first-child,.sc-stack-legend span:first-child i{background:var(--sc-accent)}.sc-stack-rows i:nth-child(2),.sc-stack-legend span:nth-child(2) i{background:var(--sc-series-2)}.sc-stack-rows i:nth-child(3),.sc-stack-legend span:nth-child(3) i{background:var(--sc-series-3)}.sc-stack-legend{display:flex;flex-wrap:wrap;gap:4%;font-size:2.3cqw}.sc-stack-legend span{display:flex;align-items:center;gap:1cqw}.sc-stack-legend i{width:1.7cqw;height:1.7cqw;border-radius:50%}
  .sc-scatter-wrap{display:grid;grid-template-columns:6% 1fr;gap:1%;height:55%;margin-top:auto}.sc-scatter-y{writing-mode:vertical-rl;transform:rotate(180deg);align-self:center;color:var(--sc-muted);font-size:2.3cqw}.sc-scatter-field{position:relative;border-left:2px solid var(--sc-line);border-bottom:2px solid var(--sc-line);background:linear-gradient(to bottom,transparent calc(50% - 1px),var(--sc-line) 50%,transparent calc(50% + 1px))}.sc-scatter-field i{position:absolute;width:2.2cqw;height:2.2cqw;border-radius:50%;background:var(--sc-accent);transform:translate(-50%,50%)}.sc-scatter-x{text-align:center;color:var(--sc-muted);font-size:2.3cqw;margin-top:2%}
  .sc-hist-field{display:flex;align-items:end;gap:.5%;height:55%;margin-top:auto;border-bottom:2px solid var(--sc-line);background:linear-gradient(to bottom,transparent calc(50% - 1px),var(--sc-line) 50%,transparent calc(50% + 1px))}.sc-hist-field i{flex:1;min-width:0;background:var(--sc-accent)}
  .rd-loop-node{border-color:var(--sc-ink);background:var(--sc-surface)}.rd-loop-node-1{border-color:var(--sc-accent);background:var(--sc-accent);color:var(--sc-on-accent)}.rd-loop-node-1 .rd-loop-step{color:var(--sc-on-accent)}
  .rd-tree-question,.rd-tree-choice,.rd-time-tag,.rd-chat-bubble,.rd-example{border-color:var(--sc-ink);background:var(--sc-surface)}.rd-tree-fork path,.rd-timeline{stroke:var(--sc-ink);border-color:var(--sc-ink)}.rd-tree-branches>div:first-child .rd-tree-choice,.rd-time-row:nth-child(2) .rd-time-tag,.rd-chat-mascot .rd-chat-bubble{border-color:var(--sc-accent);background:var(--sc-accent);color:var(--sc-on-accent)}
  .rd-check-icon,.rd-annotations>div>span{color:var(--sc-on-accent)}.rd-compare-row span{color:var(--sc-ink)}.rd-chat-mascot .rd-chat-bubble{color:var(--sc-on-accent)}.rd-example p strong{background:color-mix(in srgb,var(--sc-accent) 20%,var(--sc-surface))}.rd-score-formula b{color:var(--sc-muted)}.rd-score-takeaway{border-color:var(--sc-line)}
`;
