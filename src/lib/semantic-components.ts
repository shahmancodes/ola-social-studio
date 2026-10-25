import { SemanticComponentSchema, type SlideSpec } from "./schemas";
import { semanticDiagramHtml, SEMANTIC_DIAGRAM_CSS } from "./semantic-diagrams";
import { semanticChartPlot, semanticValue, SEMANTIC_CHART_CSS } from "./semantic-charts";
import {barScale} from './chart-scale';

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
  return escapeHtml([
    `--rd-accent:${style.accent}`, `--sc-accent:${style.accent}`,
    `--sc-ink:${style.foreground}`, `--sc-muted:${style.muted}`,
    `--sc-line:${style.line}`, `--sc-surface:${style.surface}`,
    `--sc-series-2:${style.seriesTwo}`, `--sc-series-3:${style.seriesThree}`,
    `--sc-series-4:${style.seriesFour ?? "#467640"}`, `--sc-series-5:${style.seriesFive ?? "#9B4874"}`,
    `--sc-on-accent:${style.onAccent}`, `--sc-font:${fontFamilies[style.fontFamily]}`,
    `--sc-quote-font:${fontFamilies[style.quoteFontFamily]}`,
    `--sc-heading-font:${fontFamilies[style.headingFontFamily ?? style.fontFamily]}`,
  ].join(";"));
}

const formatValue = semanticValue;

export function semanticComponentHtml(component: Component, mascotIcon = "", illustrationUrl = "", sourceCopyOnly = false) {
  const parsed = SemanticComponentSchema.safeParse(component);
  if (!parsed.success) return `<div class="rd-semantic"><p class="sc-diagram-note" role="alert">${escapeHtml(parsed.error.issues[0]?.message || "Correct the component data to preview.")}</p></div>`;
  component = parsed.data;
  const diagram = semanticDiagramHtml(component);
  if (diagram !== null) return `<div class="rd-semantic rd-semantic-${component.kind} sc-diagram-component" data-kind="${component.kind}" style="${componentStyle(component)}">${diagram}</div>`;
  const items = component.items;
  let content = "";
  switch (component.kind) {
    case "relatedPair":
      content = `${component.prompt ? `<h3 class="sc-pair-heading">${emphasis(component.prompt)}</h3>` : ""}${component.answer ? `<p class="sc-pair-intro">${emphasis(component.answer)}</p>` : ""}<div class="sc-related-pair" role="group" aria-label="Related ideas">${items.map(item => `<div class="sc-pair-item"><span class="sc-pair-anchor" aria-hidden="true"></span><strong>${emphasis(item.label)}</strong>${item.detail ? `<p>${emphasis(item.detail)}</p>` : "<p></p>"}</div>`).join("")}</div>${component.note ? `<p class="sc-pair-note">${emphasis(component.note)}</p>` : ""}`;
      break;
    case "processSteps":
      content = `${component.prompt ? `<span class="sc-kicker">${emphasis(component.prompt)}</span>` : ""}<ol class="sc-process-steps">${items.map((item, index) => `<li><span class="sc-process-number">${String(index + 1).padStart(2, "0")}</span><div><strong>${emphasis(item.label)}</strong>${item.detail ? `<p>${emphasis(item.detail)}</p>` : ""}</div></li>`).join("")}</ol>`;
      break;
    case "metricGrid":
      content = `${component.prompt ? `<span class="sc-kicker">${emphasis(component.prompt)}</span>` : ""}<div class="sc-metric-grid" data-count="${items.length}" style="--sc-count:${items.length}">${items.map(item => `<div><strong>${escapeHtml(formatValue(item.value, component.unit))}</strong><span>${emphasis(item.label)}</span>${item.detail ? `<p>${emphasis(item.detail)}</p>` : ""}</div>`).join("")}</div>`;
      break;
    case "processLoop":
      {
        const arcs = items.length === 2
          ? ["M88 42 Q92 50 88 58", "M12 58 Q8 50 12 42"]
          : items.length === 3
            ? ["M74 13 Q86 20 88 32", "M59 96 Q50 99 41 96", "M12 32 Q14 20 26 13"]
            : ["M74 13 Q86 20 88 32", "M88 68 Q86 80 74 87", "M26 87 Q14 80 12 68", "M12 32 Q14 20 26 13"];
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
      content = `<div class="rd-comparison" role="table"><div class="rd-compare-head" role="row"><h3 role="columnheader">${escapeHtml(component.leftTitle)}</h3><h3 role="columnheader">${escapeHtml(component.rightTitle)}</h3></div>${items.map(item => `<div class="rd-compare-pair" role="row"><p role="cell">${emphasis(item.label)}</p><p role="cell">${emphasis(item.detail)}</p></div>`).join("")}</div>`;
      break;
    case "timeline":
      content = `<div class="rd-timeline${items.some(item => item.tag.length > 3) ? " rd-timeline-long-tags" : ""}">${items.map((item) => `<div class="rd-time-row"><span class="rd-time-tag">${escapeHtml(item.tag || "•")}</span><div><strong>${emphasis(item.label)}</strong>${item.detail ? `<p>${emphasis(item.detail)}</p>` : ""}</div></div>`).join("")}</div>`;
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
      content = `<div class="sc-progress-head"><span>${emphasis(component.prompt)}</span><strong>${String(component.activeIndex + 1).padStart(2, "0")} <small>/ ${String(items.length).padStart(2, "0")}</small></strong></div><div class="sc-progress-title">${emphasis(component.answer || items[component.activeIndex].label)}</div><p class="sc-progress-status" data-generated-label>${component.activeIndex} of ${items.length} steps completed</p><div class="sc-progress-stages" style="--sc-count:${items.length}">${items.map((item, index) => `<div class="${index < component.activeIndex ? "done" : index === component.activeIndex ? "active" : ""}"${index === component.activeIndex ? ' aria-current="step"' : ""}><i></i><span>${emphasis(item.label)}</span></div>`).join("")}</div>`;
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
        const scale=barScale(items.map(item=>item.value),component.unit),pos=(n:number)=>(n-scale.min)/(scale.max-scale.min)*100,zero=pos(0);
        content = `<span class="sc-kicker" data-generated-label>CATEGORY COMPARISON</span><h3>${emphasis(component.prompt)}</h3><p class="sc-chart-unit">${emphasis(component.answer)}</p><div class="sc-bar-axis">${scale.ticks.map(t=>`<span>${formatValue(t,escapeHtml(component.unit))}</span>`).join('')}</div><div class="sc-bar-rows">${items.map((item) => `<div><span>${emphasis(item.label)}</span><i><b style="margin-left:${Math.min(zero,pos(item.value))}%;width:${Math.abs(pos(item.value)-zero)}%"></b></i><strong>${formatValue(item.value, escapeHtml(component.unit))}</strong></div>`).join("")}</div>`;
      }
      break;
    case "lineChart":
    case "scatterPlot":
    case "histogram":
    case "bulletChart":
      content = `<span class="sc-kicker" data-generated-label>${({lineChart: "CHANGE OVER TIME", scatterPlot: "RELATIONSHIP", histogram: "DISTRIBUTION", bulletChart: "ACTUAL VS TARGET"})[component.kind]}</span><h3>${emphasis(component.prompt)}</h3>${component.answer ? `<p class="sc-chart-unit">${emphasis(component.answer)}</p>` : ""}${semanticChartPlot(component)}`;
      break;
    case "stackedBar":
      content = `<span class="sc-kicker" data-generated-label>PARTS OF A WHOLE</span><h3>${emphasis(component.prompt)}</h3><p class="sc-chart-unit">${emphasis(component.answer)}</p><div class="sc-stack-rows">${items.map(item => { const sum = item.value + item.value2 + item.value3; return `<div><strong>${emphasis(item.label)}</strong><span>${[item.value, item.value2, item.value3].map(value => `<i style="width:${sum ? value / sum * 100 : 0}%"></i>`).join("")}</span><small>${[item.value, item.value2, item.value3].map(value => formatValue(value, escapeHtml(component.unit))).join(" · ")}</small></div>`; }).join("")}</div><div class="sc-stack-legend"><span><i></i>${emphasis(component.leftTitle || "Series 1")}</span><span><i></i>${emphasis(component.rightTitle || "Series 2")}</span><span><i></i>${emphasis(component.takeaway || "Series 3")}</span></div>`;
      break;

  }
  if(sourceCopyOnly)content=content.replace(/<(span|p) class="[^"]*" data-generated-label>[^<]*<\/\1>/g, "");
  return `<div class="rd-semantic rd-semantic-${component.kind}" data-kind="${component.kind}" style="${componentStyle(component)}">${content}</div>`;
}

// Typography follows the component region; size containment also enables landscape reflow.
export const SEMANTIC_COMPONENT_CSS = `
  ${SEMANTIC_DIAGRAM_CSS}
  ${SEMANTIC_CHART_CSS}
  .rd-semantic{--sc-ink:#07070a;--sc-muted:#53535c;--sc-line:#d7d7dc;--sc-surface:#fff;--sc-accent:var(--rd-accent);--sc-series-2:#9599a6;--sc-series-3:#c9cbd2;--sc-on-accent:#fff;--sc-font:"Manrope Variable",Manrope,Arial,sans-serif;--sc-quote-font:Georgia,serif;position:relative;width:100%;height:100%;min-width:0;padding:1cqw;container-type:size;isolation:isolate;overflow-wrap:anywhere;font-family:var(--sc-font);color:var(--sc-ink);line-height:1.15}
  .rd-semantic,.rd-semantic *{box-sizing:border-box}.rd-semantic p,.rd-semantic h3{margin:0}.rd-semantic p:empty,.sc-kicker:empty{display:none}.rd-semantic strong{font-weight:800}.rd-semantic h3,.sc-progress-title{font-family:var(--sc-heading-font,var(--sc-font))}
  .rd-semantic-processLoop{container-type:size}.rd-loop-diagram{position:absolute;top:50%;left:50%;width:min(86cqw,94cqh);aspect-ratio:1;transform:translate(-50%,-50%)}
  .rd-loop-track{position:absolute;inset:17%;border:3px solid var(--rd-accent);border-radius:50%;opacity:.4}
  .rd-loop-curves{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:1}.rd-loop-curve{fill:none;stroke:var(--rd-accent);stroke-width:.65;stroke-linecap:round}.rd-loop-curves marker path{fill:var(--rd-accent)}
  .rd-loop-node{position:absolute;display:flex;flex-direction:column;justify-content:center;align-items:center;width:29%;aspect-ratio:1;border:1.5px solid #07070a;border-radius:50%;background:#fff;text-align:center;font-size:3.2cqw;font-weight:800;line-height:1.08;padding:2%}
  .rd-loop-step{display:block;color:var(--rd-accent);font-size:2.5cqw;margin-bottom:2%}.rd-loop-label{display:block;max-width:100%;overflow-wrap:anywhere}.rd-loop-node-1{left:35.5%;top:0}.rd-loop-node-2{right:0;top:35.5%}.rd-loop-node-3{left:35.5%;bottom:0}.rd-loop-node-4{left:0;top:35.5%}.rd-loop-node-1{background:var(--rd-accent);border-color:var(--rd-accent);color:#fff}.rd-loop-node-1 .rd-loop-step{color:#fff}.rd-loop-center{position:absolute;left:35%;top:46%;width:30%;text-align:center;color:var(--rd-accent);font-size:3.4cqw;font-weight:800}
  .rd-loop-count-2 .rd-loop-node-2{left:35.5%;right:auto;top:auto;bottom:0}
  .rd-loop-count-3 .rd-loop-node-2{right:5%;top:auto;bottom:7%}.rd-loop-count-3 .rd-loop-node-3{left:5%;bottom:7%}
  .rd-semantic-decisionTree{display:flex;flex-direction:column;justify-content:center}.rd-tree-question{width:82%;margin:0 auto;padding:4%;border:1.5px solid #07070a;border-radius:2cqw;background:#fff;text-align:center;font-size:3.8cqw;font-weight:800}.rd-tree-fork{height:19%;width:100%}.rd-tree-fork svg{width:100%;height:100%}.rd-tree-fork path{fill:none;stroke:#07070a;stroke-width:1.5;vector-effect:non-scaling-stroke}.rd-tree-branches{display:grid;grid-template-columns:1fr 1fr;gap:8%;text-align:center}.rd-tree-branches>div{min-width:0}.rd-tree-choice{display:grid;place-items:center;width:55%;min-height:7cqw;margin:0 auto 5%;padding:2%;border:2px solid #07070a;border-radius:999px;background:#fff;font-size:3cqw;font-weight:800}.rd-tree-branches>div:first-child .rd-tree-choice{background:var(--rd-accent);border-color:var(--rd-accent);color:#fff}.rd-tree-branches strong{display:block;font-size:3.3cqw}.rd-tree-branches p{margin:3% auto 0;max-width:95%;font-size:2.9cqw;font-weight:500}
  .rd-checklist{display:grid;gap:4%;height:100%;align-content:space-evenly}.rd-check-row{display:flex;align-items:flex-start;gap:5%;text-align:left}.rd-check-icon{display:grid;place-items:center;flex:none;width:8cqw;height:8cqw;border-radius:50%;background:var(--rd-accent);color:#fff;font-size:4cqw;font-weight:800}.rd-check-row strong{display:block;font-size:3.8cqw;line-height:1.1}.rd-check-row p{margin-top:1.5%;font-size:2.9cqw;font-weight:400}
  .rd-comparison{display:grid;align-content:center;height:100%;gap:0}.rd-compare-head,.rd-compare-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6%}.rd-comparison .rd-compare-head h3{font-size:4.2cqw;margin:0;padding:0 0 4cqw;border-bottom:2px solid var(--sc-line);letter-spacing:-.025em}.rd-comparison .rd-compare-head h3:last-child{border-color:var(--sc-accent);color:var(--sc-accent)}.rd-compare-pair{border-bottom:1px solid var(--sc-line)}.rd-compare-pair:last-child{border:0}.rd-compare-pair p{padding:2.6cqw 0;font-size:3cqw;line-height:1.35}

  .rd-timeline{height:100%;display:flex;flex-direction:column;justify-content:space-around;border-left:1px solid var(--sc-line);margin-left:4cqw}.rd-time-row{position:relative;display:flex;align-items:start;gap:4%;margin-left:-4cqw}.rd-time-tag{display:grid;place-items:center;flex:none;width:8cqw;height:8cqw;border:1.5px solid #07070a;border-radius:50%;background:#fff;font-size:2.6cqw;font-weight:800}.rd-time-row:nth-child(2) .rd-time-tag{color:#fff;background:var(--rd-accent);border-color:var(--rd-accent)}.rd-time-row strong{display:block;font-size:3.5cqw}.rd-time-row p{margin-top:1%;font-size:2.8cqw;font-weight:400}
  .rd-timeline-long-tags .rd-time-tag{width:20cqw;height:auto;min-height:8cqw;padding:1cqw;border-radius:1.2cqw;font-size:2.4cqw;line-height:1.3}
  .rd-chat{height:100%;display:flex;flex-direction:column;justify-content:space-evenly;gap:2%}.rd-chat-line{width:fit-content;max-width:86%;font-size:3.5cqw;align-self:flex-start}.rd-chat-mascot{align-self:flex-end}.rd-chat-speaker{display:flex;align-items:center;gap:2%;margin-bottom:2%;font-size:2.3cqw;font-weight:800}.rd-chat-mascot .rd-chat-speaker{justify-content:flex-end;color:var(--rd-accent)}.rd-chat-speaker img{width:4cqw;height:4cqw;object-fit:contain}.rd-chat-bubble{padding:3cqw 4cqw;border:1px solid var(--sc-line);border-radius:3cqw 3cqw 3cqw .6cqw;background:#fff;font-weight:500}.rd-chat-mascot .rd-chat-bubble{border-radius:3cqw 3cqw .6cqw 3cqw;background:var(--rd-accent);border-color:var(--rd-accent);color:#fff}
  .rd-semantic-annotatedExample{display:flex;flex-direction:column;justify-content:center}.rd-example{padding:5%;border:1px solid var(--sc-line);border-radius:2cqw;background:#fff}.rd-example-label{display:block;color:var(--rd-accent);font-size:2.3cqw;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.rd-example p{margin-top:4%;font-size:3.5cqw;line-height:1.25}.rd-example p strong{background:#dccbff}.rd-annotations{display:grid;gap:3cqw;margin-top:5%}.rd-annotations>div{display:flex;align-items:baseline;gap:4%;font-size:3cqw}.rd-annotations>div>span{display:grid;place-items:center;flex:none;width:5cqw;height:5cqw;border-radius:50%;background:var(--rd-accent);color:#fff;font-weight:800}.rd-annotations p{font-weight:400;line-height:1.4}.rd-annotations p strong{display:block;margin-bottom:.6cqw}
  .rd-semantic-scoreBreakdown{display:flex;flex-direction:column;justify-content:center}.rd-score-formula{display:flex;justify-content:center;align-items:center;gap:3%;font-size:10cqw;font-weight:800;letter-spacing:-.06em}.rd-score-formula span:nth-of-type(2){color:var(--rd-accent)}.rd-score-formula b{font-size:6cqw;font-weight:400;color:#53535c}.rd-score-labels{display:grid;grid-template-columns:1fr 1fr;gap:12%;margin:3% auto 0;width:78%;text-align:center;font-size:3cqw}.rd-score-labels p{margin-top:2%;font-weight:400}.rd-score-takeaway{margin:10% auto 0;padding-top:7%;width:82%;border-top:2px solid #a8a8aa;text-align:center;font-size:5cqw;font-weight:800}.rd-score-note{text-align:center;margin:7% auto 0;font-size:2.9cqw;font-weight:500}
  .sc-kicker{display:block;color:var(--sc-muted);font-size:2.1cqw;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.rd-semantic h3{margin:3% 0 0;font-size:5.2cqw;line-height:1.08;letter-spacing:-.05em;font-weight:800}.sc-chart-unit{margin-top:1.5%!important;color:var(--sc-muted);font-size:2.7cqw}
  .rd-semantic-progress{display:flex;flex-direction:column}.sc-progress-head{display:flex;justify-content:space-between;align-items:start;font-size:2.7cqw;font-weight:700}.sc-progress-head strong{font-size:4.4cqw}.sc-progress-head small{color:var(--sc-muted);font-size:2.8cqw}.sc-progress-title{max-width:100%;margin-top:auto;font-size:8.3cqw;line-height:1.04;font-weight:800;letter-spacing:-.055em}.sc-progress-status{font-size:2.8cqw;color:var(--sc-muted);margin-top:3%!important}.sc-progress-stages{display:grid;grid-template-columns:repeat(var(--sc-count),minmax(0,1fr));gap:.7%;margin-top:auto}.sc-progress-stages>div{min-width:0;color:var(--sc-muted);font-size:2.1cqw}.sc-progress-stages i{display:block;height:2.5cqw;margin-bottom:2cqw;background:var(--sc-line)}.sc-progress-stages .done i{background:var(--sc-accent)}.sc-progress-stages .active i{background:color-mix(in srgb,var(--sc-accent) 38%,var(--sc-surface))}.sc-progress-stages .active span{color:var(--sc-ink);font-weight:800}
  .rd-semantic-metricSpotlight{display:flex;flex-direction:column}.sc-metric-main{display:flex;align-items:center;gap:5%;flex:1;flex-wrap:wrap;align-content:center}.sc-metric-main strong{color:var(--sc-accent);font-size:17cqw;line-height:.9;letter-spacing:-.065em}.sc-metric-main p{max-width:44%;margin-bottom:1%;font-size:3.3cqw;line-height:1.2;font-weight:600}.sc-metric-context{display:flex;align-items:center;gap:3%;padding-top:3%;border-top:2px solid var(--sc-line);color:var(--sc-muted);font-size:2.6cqw}.sc-metric-context b{color:var(--sc-ink);font-size:3cqw}
  .rd-semantic-pullQuote{display:flex;flex-direction:column}.rd-semantic-pullQuote:before{content:'“';position:absolute;top:-6%;right:1%;font:18cqw/1 var(--sc-quote-font);color:color-mix(in srgb,var(--sc-accent) 10%,var(--sc-surface));pointer-events:none}.rd-semantic-pullQuote blockquote{z-index:1;max-width:93%;margin:auto 0;font:500 6.1cqw/1.2 var(--sc-quote-font);letter-spacing:-.03em}.sc-quote-credit{display:flex;align-items:center;gap:2%;padding-top:3%;border-top:2px solid var(--sc-line)}.sc-quote-credit i{width:.6cqw;height:5cqw;background:var(--sc-accent)}.sc-quote-credit span{display:grid;gap:.5cqw}.sc-quote-credit strong{font-size:2.8cqw}.sc-quote-credit small{color:var(--sc-muted);font-size:2.3cqw}
  .rd-semantic-labeledVisual h3{font-size:5.2cqw}.sc-labeled-layout{display:grid;grid-template-columns:40% minmax(0,1fr);align-items:center;gap:6%;height:78%}.sc-labeled-picture{position:relative;width:100%;height:100%;display:grid;place-items:center}.sc-labeled-bottle,.sc-labeled-image{width:65%;height:95%;object-fit:contain}.sc-labeled-bottle .lid{fill:var(--sc-accent);stroke:var(--sc-ink);stroke-width:2}.sc-labeled-bottle .body{fill:color-mix(in srgb,var(--sc-accent) 10%,var(--sc-surface));stroke:var(--sc-ink);stroke-width:2.5}.sc-labeled-bottle .wall{fill:none;stroke:var(--sc-accent);stroke-width:3}.sc-labeled-bottle .shine{fill:none;stroke:var(--sc-surface);stroke-width:6;stroke-linecap:round}.sc-labeled-bottle .base{fill:none;stroke:var(--sc-ink);stroke-width:4;stroke-linecap:round}.sc-labeled-marker{position:absolute;display:grid;place-items:center;width:5.5cqw;height:5.5cqw;border-radius:50%;background:var(--sc-accent);color:var(--sc-on-accent);font-size:2.5cqw;font-weight:800;transform:translate(-50%,-50%)}.sc-labeled-notes{display:grid;gap:3%}.sc-labeled-notes>div{display:grid;grid-template-columns:6cqw 1fr;gap:2%;padding:3% 0;border-bottom:1px solid var(--sc-line)}.sc-labeled-notes>div:last-child{border:0}.sc-labeled-notes b{color:var(--sc-accent);font-size:2.6cqw}.sc-labeled-notes span{display:grid;gap:1cqw}.sc-labeled-notes strong{font-size:3.5cqw}.sc-labeled-notes small{font-size:2.6cqw;color:var(--sc-muted)}
  .rd-semantic-priorityStack{display:flex;flex-direction:column}.sc-priorities{display:grid;gap:1%;margin:auto 0}.sc-priorities>div{display:grid;grid-template-columns:9% 1fr;gap:2%;padding:2.2% 0;border-top:2px solid var(--sc-line)}.sc-priorities>div.first{border-top:3px solid var(--sc-accent)}.sc-priorities b{color:var(--sc-muted);font-size:3cqw}.sc-priorities .first b{color:var(--sc-accent);font-size:4cqw}.sc-priorities span{display:grid;gap:.5cqw}.sc-priorities small{color:var(--sc-accent);font-size:2cqw;font-weight:800;letter-spacing:.09em}.sc-priorities strong{font-size:3.4cqw}.sc-priorities .first strong{font-size:4.1cqw}.sc-priorities p{color:var(--sc-muted);font-size:2.4cqw}
  .rd-semantic-continuum{display:flex;flex-direction:column}.sc-spectrum-choice{display:grid;justify-items:center;gap:1%;margin:auto 0 5%;color:var(--sc-accent)}.sc-spectrum-choice small{font-size:2cqw;font-weight:800;letter-spacing:.12em}.sc-spectrum-choice strong{font-size:5cqw}.sc-spectrum{position:relative;display:grid;grid-template-columns:repeat(var(--sc-count),minmax(0,1fr));align-items:start}.sc-spectrum:before{content:'';position:absolute;top:1.15cqw;left:calc(50% / var(--sc-count));right:calc(50% / var(--sc-count));height:2px;background:var(--sc-ink)}.sc-spectrum>div{z-index:1;display:flex;flex-direction:column;align-items:center;min-width:0;text-align:center;color:var(--sc-muted);font-size:2.3cqw}.sc-spectrum i{box-sizing:border-box;width:2.4cqw;height:2.4cqw;border-radius:50%;background:var(--sc-ink)}.sc-spectrum .selected i{width:4cqw;height:4cqw;margin-top:-.8cqw;border:1cqw solid var(--sc-accent);background:var(--sc-surface);box-shadow:0 0 0 .8cqw color-mix(in srgb,var(--sc-accent) 12%,var(--sc-surface))}.sc-spectrum span{margin-top:2.6cqw;max-width:100%;padding:0 .5cqw;overflow-wrap:anywhere}.sc-spectrum .selected span{color:var(--sc-ink);font-weight:800}.sc-spectrum-ends{display:flex;justify-content:space-between;margin-top:4%;padding-top:3%;border-top:2px solid var(--sc-line);color:var(--sc-muted);font-size:2.2cqw}
  .rd-semantic-barChart,.rd-semantic-lineChart,.rd-semantic-stackedBar,.rd-semantic-scatterPlot,.rd-semantic-histogram{display:flex;flex-direction:column}.sc-bar-axis{display:flex;justify-content:space-between;margin:auto 14% 3% 20%;padding-top:5%;font-size:2.3cqw;color:var(--sc-muted)}.sc-bar-rows{display:grid;gap:2cqw;margin:0 0 auto}.sc-bar-rows>div{display:grid;grid-template-columns:18% 1fr 12%;gap:2%;align-items:center;font-size:2.7cqw}.sc-bar-rows i{height:4cqw;background:color-mix(in srgb,var(--sc-line) 28%,var(--sc-surface));border-radius:.5cqw}.sc-bar-rows b{display:block;height:100%;border-radius:.5cqw;background:var(--sc-accent)}.sc-bar-rows strong{text-align:right;font-size:2.7cqw}

  .sc-stack-rows{display:grid;gap:4cqw;margin:auto 0}.sc-stack-rows>div{display:grid;grid-template-columns:18% 1fr;gap:2%;align-items:center}.sc-stack-rows strong{font-size:2.7cqw}.sc-stack-rows small{grid-column:2;font-size:2.4cqw;color:var(--sc-muted);margin-top:1.5cqw}.sc-stack-rows>div>span{display:flex;height:5cqw}.sc-stack-rows i{height:100%}.sc-stack-rows i:first-child,.sc-stack-legend span:first-child i{background:var(--sc-accent)}.sc-stack-rows i:nth-child(2),.sc-stack-legend span:nth-child(2) i{background:var(--sc-series-2)}.sc-stack-rows i:nth-child(3),.sc-stack-legend span:nth-child(3) i{background:var(--sc-series-3)}.sc-stack-legend{display:flex;flex-wrap:wrap;gap:4%;font-size:2.3cqw}.sc-stack-legend span{display:flex;align-items:center;gap:1cqw}.sc-stack-legend i{width:1.7cqw;height:1.7cqw;border-radius:50%}

  .rd-loop-node{border-color:var(--sc-ink);background:var(--sc-surface)}.rd-loop-node-1{border-color:var(--sc-accent);background:var(--sc-accent);color:var(--sc-on-accent)}.rd-loop-node-1 .rd-loop-step{color:var(--sc-on-accent)}
  .rd-tree-question,.rd-tree-choice,.rd-time-tag,.rd-chat-bubble,.rd-example{border-color:var(--sc-ink);background:var(--sc-surface)}.rd-tree-fork path,.rd-timeline{stroke:var(--sc-ink);border-color:var(--sc-ink)}.rd-tree-branches>div:first-child .rd-tree-choice,.rd-time-row:nth-child(2) .rd-time-tag,.rd-chat-mascot .rd-chat-bubble{border-color:var(--sc-accent);background:var(--sc-accent);color:var(--sc-on-accent)}
  .rd-check-icon,.rd-annotations>div>span{color:var(--sc-on-accent)}.rd-chat-mascot .rd-chat-bubble{color:var(--sc-on-accent)}.rd-example p strong{background:color-mix(in srgb,var(--sc-accent) 20%,var(--sc-surface))}.rd-score-formula b{color:var(--sc-muted)}.rd-score-takeaway{border-color:var(--sc-line)}
  .rd-semantic-processSteps,.rd-semantic-metricGrid{display:flex;flex-direction:column;gap:5%}
  .sc-process-steps{display:grid;align-content:center;gap:5cqw;flex:1;margin:0;padding:0;list-style:none}
  .sc-process-steps li{position:relative;display:grid;grid-template-columns:9cqw 1fr;gap:4cqw;align-items:start;min-width:0}
  .sc-process-steps li:not(:last-child):before{content:'';position:absolute;left:4.5cqw;top:9cqw;bottom:-4cqw;border-left:1px solid var(--sc-line)}
  .sc-process-steps li:not(:last-child):after{content:'⌄';position:absolute;left:3.4cqw;bottom:-4.4cqw;color:var(--sc-accent);font-size:3cqw}
  .sc-process-number{display:grid;place-items:center;width:9cqw;height:9cqw;border:1px solid var(--sc-line);border-radius:2cqw;color:var(--sc-accent);font-size:3.2cqw;font-weight:800}
  .sc-process-steps li:last-child .sc-process-number{background:var(--sc-accent);border-color:var(--sc-accent);color:var(--sc-on-accent)}
  .sc-process-steps strong{font-size:4.3cqw;line-height:1.2}.sc-process-steps p{margin-top:1.3cqw;font-size:3cqw;line-height:1.4;color:var(--sc-muted)}
  .sc-metric-grid{flex:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:center;gap:3.5cqw 7cqw}
  .sc-metric-grid>div{border-top:2px solid var(--sc-line);padding-top:3cqw;display:flex;flex-direction:column;min-width:0}
  .sc-metric-grid>div:first-child{border-color:var(--sc-accent)}.sc-metric-grid strong{font-size:8cqw;line-height:1.1;letter-spacing:-.05em;color:var(--sc-accent)}
  .sc-metric-grid span{font-size:3cqw;font-weight:800;margin-top:1.5cqw}.sc-metric-grid p{margin-top:1cqw;font-size:2.5cqw;line-height:1.35;color:var(--sc-muted)}
  .rd-semantic-relatedPair{display:flex;flex-direction:column;justify-content:center;gap:3cqw}
  .rd-semantic-relatedPair .sc-pair-heading{margin:0;font-size:5cqw;line-height:1.18;letter-spacing:-.03em}
  .sc-pair-intro,.sc-pair-note{font-size:3cqw;line-height:1.4;color:var(--sc-muted)}
  .sc-related-pair{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:auto auto auto;column-gap:12%;row-gap:2cqw;margin:3cqw 0}
  .sc-related-pair:before{content:'';position:absolute;left:22%;right:22%;top:.65cqw;border-top:1.5px solid var(--sc-accent)}
  .sc-pair-item{display:grid;grid-row:1 / span 3;grid-template-rows:subgrid;min-width:0}
  .sc-pair-anchor{position:relative;display:block;justify-self:center;width:1.5cqw;height:1.5cqw;background:var(--sc-accent);border-radius:50%;margin-bottom:1cqw}
  .sc-pair-item strong{font-family:var(--sc-heading-font,var(--sc-font));font-size:4cqw;line-height:1.2}
  .sc-pair-item p{font-size:3.3cqw;line-height:1.4;color:var(--sc-muted)}
  .sc-pair-note{padding-top:2cqw;border-top:1px solid var(--sc-line);font-size:2.5cqw}
  @container (max-aspect-ratio: 4/5){
    .sc-related-pair{display:flex;flex-direction:column;gap:5cqw}
    .sc-related-pair:before{display:none}
    .sc-pair-item{position:relative;display:grid;grid-template-columns:4cqw 1fr;grid-template-rows:auto auto;gap:2cqw}
    .sc-pair-item:first-child:before{content:'';position:absolute;left:.65cqw;top:2.55cqw;height:calc(100% + 5cqw);border-left:1.5px solid var(--sc-accent)}
    .sc-pair-anchor{grid-row:1 / span 2;justify-self:start;align-self:start;margin-top:1.8cqw}.sc-pair-item p{grid-column:2}
  }
  @container (min-aspect-ratio: 8/5){
    .sc-related-pair{margin:1cqw 0;row-gap:1.5cqw}
    .sc-pair-item strong{font-size:3.5cqw}.sc-pair-item p{font-size:2.8cqw}
    .sc-process-steps{display:flex;align-items:flex-start;gap:3cqw;align-self:stretch;margin:auto 0;flex:0}
    .sc-process-steps li{flex:1;display:flex;flex-direction:column;gap:2cqw}
    .sc-process-steps li:not(:last-child):before{left:9cqw;right:-3cqw;top:4.5cqw;bottom:auto;height:0;border-left:0;border-top:1px solid var(--sc-line)}
    .sc-process-steps li:not(:last-child):after{content:'›';left:auto;right:-2cqw;top:2.4cqw;bottom:auto}
    .sc-process-steps strong{font-size:3.3cqw}.sc-process-steps p{font-size:2.5cqw}
    .sc-metric-grid{grid-template-columns:repeat(var(--sc-count),minmax(0,1fr));gap:3cqw}
    .sc-metric-grid strong{font-size:6cqw}.sc-metric-grid span{font-size:2.8cqw}.sc-metric-grid p{font-size:2.3cqw}
    .rd-compare-pair p{padding:1.8cqw 0;font-size:2.8cqw}
  }
`;
