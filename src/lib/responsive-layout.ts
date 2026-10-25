import { layoutRelatedPair } from './related-pair-layout';
import { layoutNativeList, nativeListTextWidth } from './native-list-layout';
import {layoutSemanticDesign} from './semantic-design-layout';
import type { VisualScene, SceneElement } from './content-layout';
import type { ResponsiveLayout } from './composition-design';
import { layoutProcess } from './process-layout';
import { layoutRecipeVisual } from './recipe-visual-layout';
import type { DesignRecipe } from './design-recipes';

export type VisualFormat = 'poster' | 'story' | 'carousel' | 'post' | 'presentation';
export type Box = { x: number; y: number; w: number; h: number };
export type LayoutGroup = {
  id: string; lane: 'full' | 'left' | 'right'; w: number; h: number; x: number; y: number;
  semanticDesign?:{spec:import('./semantic-design').SemanticDesignSpec;profile:'portrait'|'landscape';height:number;textFlow?:'regions'|'grouped';fit?:import('./semantic-design-fit').SemanticFit[];flow?:import('./semantic-text-flow').SemanticFlowEvidence[]};
  stagger?: number; card?: string; rule?: string; offsetX?:number; supportPanel?:string; minH?:number;
  visual?: { mode: 'native-list' | 'related-pair' | 'designed' | 'sequence' | 'grid' | 'comparison' | 'image' | 'component' | 'annotated' | 'triptych' | 'stats' | 'bars' | 'table' | 'timeline'; listKind?:'checklist'|'processSteps'|'hubSpoke'|'fields'; itemGap?:number; labelIds: string[]; details?: Record<string,string>; tagIds?:Record<string,string>;numericIds?:string[];headerIds?:string[];auxIds?:string[];barValues?:number[];valueUnit?:string; columns: number; reflow?:{fromColumns:number;target:string;reason:string}; nodes?:ResponsiveLayout['visual']['nodes']; treatment: string; accent: string; surface: string; ink: string; unit: number; imageHeight: number; balance?:boolean; minHeight?:number; annotations: ResponsiveLayout['visual']['annotations'] };
};
export type ResponsiveSceneLayout = {
  version: 1; frame: Box; config: ResponsiveLayout; gap: number; split: number;
  groups: LayoutGroup[]; order: string[]; placements: Array<{ copyId: string; slot: string }>;
  recipe?:DesignRecipe&{format:VisualFormat;panelFill:string;panelInk:string};
  evidence?: { groups: Array<Box & { id: string }>; actions: ResponsiveLayout['adjustments']; iterations: number; balance?:{requestedAnchor:ResponsiveLayout['anchor'];resolvedAnchor:ResponsiveLayout['anchor'];occupiedFraction:number} };
};

export function formatGeometry(format: VisualFormat) {
  const width = format === 'poster' ? 1240 : format === 'presentation' ? 1280 : 1080;
  const height = format === 'poster' ? 1754 : format === 'story' ? 1920 : format === 'presentation' ? 720 : 1350;
  const pad = format === 'poster' ? 96 : format === 'presentation' ? 64 : 76;
  const top = format === 'story' ? 420 : format === 'poster' ? 260 : format === 'presentation' ? 136 : 216;
  const bottom = format === 'story' ? 1504 : format === 'presentation' ? 656 : height - (format === 'carousel' ? 106 : pad);
  return { width, height, pad, unit: Math.min(width, height) / 1080, frame: { x: pad, y: top, w: width - 2 * pad, h: bottom - top } };
}
export function actionScale(config: ResponsiveLayout, target: string) {
  return config.adjustments.reduce((n, a) => a.action === 'scale' && a.target === target ? n * a.factor : n, 1);
}
const text = (e: SceneElement | undefined): e is Extract<SceneElement, { kind: 'text' }> => e?.kind === 'text';

/** Resolve a measured native-process failure before reducing its reading floor. */
export function reflowReadableProcess(scene:VisualScene,target:string) {
  const layout=scene.responsiveLayout;
  if(!layout?.config.readability)return false;
  const element=scene.elements.find(e=>e.id===target),group=layout.groups.find(g=>g.id===element?.groupId),v=group?.visual;
  if(group&&v?.mode==='native-list'&&v.columns>1){
    const width=nativeListTextWidth(group,1);
    if(width<=(element?.kind==='text'?element.w:0)+.5)return false;
    v.reflow={fromColumns:v.columns,target,reason:'Native list text could not fit its measured columns at the reading minimum.'};v.columns=1;
    for(const id of [...v.labelIds,...Object.values(v.details??{}),...Object.values(v.tagIds??{})]){const e=scene.elements.find(e=>e.groupId===group.id&&e.id===id);if(text(e))e.w=width;}
    return true;
  }
  const process=v?.mode==='sequence'||v?.mode==='timeline'&&v.balance&&!Object.keys(v.tagIds??{}).length;
  if(!group||!v||!process||v.columns<=1)return false;
  const numbered=v.treatment==='numbered',pad=(v.balance?24:v.treatment==='cards'?18:8)*v.unit;
  const node=(v.balance?numbered?44:v.nodes==='dots'?18:0:numbered?32:v.nodes==='none'?0:18)*v.unit,labelGap=(v.balance&&!numbered&&v.nodes!=='dots'?0:14)*v.unit;
  const width=group.w-pad*2-node-labelGap;
  if(width<=(element?.kind==='text'?element.w:0)+.5)return false;
  v.reflow={fromColumns:v.columns,target,reason:'Native process text could not fit its measured region at the minimum readable font size.'};v.columns=1;
  for(const id of [...v.labelIds,...Object.values(v.details??{})]){
    const label=scene.elements.find(e=>e.id===id&&e.groupId===group.id);if(text(label))label.w=width;
  }
  return true;
}
const bottom = (e: SceneElement) => e.kind === 'line' ? Math.max(e.y, e.y2) : e.y + e.h;
function move(e: SceneElement, dx: number, dy: number) { e.x += dx; e.y += dy; if (e.kind === 'line') { e.x2 += dx; e.y2 += dy; } }
function spacing(layout: ResponsiveSceneLayout, target: 'content' | 'copy' | 'visual') {
  const action = layout.config.adjustments.filter(a => a.action === 'spacing' && a.target === target).at(-1);
  return action?.action === 'spacing' ? action.gap * Math.min(layout.frame.w, layout.frame.h) : target === 'visual' ? layout.gap * .7 : layout.gap;
}

/** Rebuild relationships from measured text, rather than scaling a screenshot or reserving empty boxes. */
function visualGroup(scene: VisualScene, group: LayoutGroup, layout: ResponsiveSceneLayout) {
  const v = group.visual!;
  scene.elements = scene.elements.filter(e => !(e.groupId === group.id && e.layoutDecoration));
  const labels = v.labelIds.map(id => scene.elements.find(e => e.id === id)).filter(text);
  const gap = spacing(layout, 'visual'), unit = v.unit;
  const add = (e: SceneElement) => scene.elements.push({ ...e, groupId: group.id, layoutDecoration: true });
  if(layoutRelatedPair(scene,group,add))return;
  if(layoutSemanticDesign(scene,group,add))return;
  if(layoutNativeList(scene,group,add))return;
  if(layoutRecipeVisual(scene,group,layout,gap,add))return;
  const images = scene.elements.filter(e => e.groupId === group.id && e.kind === 'image');
  const image = images[0];
  let imageBottom = 0;
  for (const item of images) if (item.kind === 'image') {
    const aspect = item.bytes.readUInt32BE(16) / item.bytes.readUInt32BE(20);
    const availableWidth = v.mode === 'annotated' ? group.w * .59 : group.w;
    item.h = Math.min(v.imageHeight, availableWidth / aspect); item.w = item.h * aspect;
    item.x = (availableWidth - item.w) / 2; item.y = imageBottom;
    imageBottom += item.h + gap;
    if (v.treatment === 'cards') add({ kind: 'rect', id: `${item.id}-frame`, x: item.x, y: item.y, w: item.w, h: item.h, fill: v.surface, radius: 12 * unit });
  }
  imageBottom = Math.max(0, imageBottom - gap);
  const prefix = images.length && labels.length && v.mode !== 'annotated' ? imageBottom + gap : 0;
  if (v.mode === 'annotated') {
    let y = 0; const x = group.w * .66;
    labels.forEach((label, i) => {
      label.x = x + 12 * unit; label.y = y + 14 * unit;
      const height = label.h + 28 * unit;
      add({ kind: 'rect', id: `callout-${i}`, x, y, w: group.w - x, h: height, fill: v.surface, radius: 8 * unit });
      const a = v.annotations.find(a => layout.placements.find(p => p.copyId === a.copyId)?.slot === label.id)!;
      if (image?.kind === 'image' && a) {
        const px = image.x + image.w * a.x, py = image.y + image.h * a.y, elbow = x - 12 * unit, cy = label.y + label.h / 2;
        add({ kind: 'line', id: `callout-leader-${i}-a`, x: px, y: py, x2: elbow, y2: py, color: v.accent, width: 2 * unit });
        add({ kind: 'line', id: `callout-leader-${i}-b`, x: elbow, y: py, x2: elbow, y2: cy, color: v.accent, width: 2 * unit });
        add({ kind: 'line', id: `callout-leader-${i}-c`, x: elbow, y: cy, x2: x - 2, y2: cy, color: v.accent, width: 2 * unit });
        add({ kind: 'rect', id: `callout-pin-${i}`, x: px - 5 * unit, y: py - 5 * unit, w: 10 * unit, h: 10 * unit, fill: v.accent, radius: 5 * unit });
      }
      y += height + gap;
    });
    group.h = Math.max(image && image.kind === 'image' ? image.h : 0, y - gap);
    return;
  }
  if (!labels.length) { group.h = imageBottom; return; }
  if(v.mode==='sequence'){
    layoutProcess(group,labels,label=>{const detail=scene.elements.find(e=>e.id===v.details?.[label.id!]);return text(detail)?detail:undefined;},prefix,gap,add);
    return;
  }
  const columns = v.columns, cellW = (group.w - gap * (columns - 1)) / columns;
  let y = prefix;
  for (let start = 0; start < labels.length; start += columns) {
    const row = labels.slice(start, start + columns);
    const detailFor=(label:typeof labels[number])=>scene.elements.find(e=>e.id===v.details?.[label.id!]);
    const labelH = Math.max(...row.map(e => e.h + (detailFor(e)?.kind==='text' ? (detailFor(e) as typeof e).h + 8*unit : 0)));
    const cards = v.treatment === 'cards';
    const padding = cards ? 18 * unit : 6 * unit;
    const rowH = labelH + padding * 2;
    row.forEach((label, col) => {
      const x = col * (cellW + gap);
      label.x = x + padding; label.y = y + padding;
      const detail=detailFor(label);if(detail?.kind==='text'){detail.x=label.x;detail.y=label.y+label.h+8*unit;}
      if (cards) add({ kind: 'rect', id: `visual-card-${start + col}`, x, y, w: cellW, h: rowH, fill: v.surface, radius: 10 * unit });
    });
    y += rowH + gap;
  }
  group.h = y - gap;
}

/** Returns overflow, allowing the caller to remeasure with a bounded smaller type/visual scale. */
export function resolveResponsiveScene(scene: VisualScene, iteration = 0) {
  const layout = scene.responsiveLayout; if (!layout) return 0;
  const { frame, groups } = layout;
  scene.elements=scene.elements.filter(e=>!e.id?.startsWith('recipe-decoration-'));
  // Restore each group to local coordinates before deriving new bounds. This is idempotent.
  for (const g of groups) {
    for (const e of scene.elements.filter(e => e.groupId === g.id)) move(e, -g.x, -g.y);
    g.x = 0; g.y = 0;
    if (g.visual) visualGroup(scene, g, layout);
    else {
      scene.elements = scene.elements.filter(e => !(e.groupId === g.id && e.layoutDecoration));
      const items = scene.elements.filter(e => e.groupId === g.id);
      g.h = Math.max(0, ...items.map(bottom));
      if(g.supportPanel){
        const label=items.find(text)!;
        const padding=28*Math.min(scene.width,scene.height)/1080;
        g.h=Math.max(label.h+padding*2,g.minH??0);
        label.y=(g.h-label.h)/2;
        scene.elements.push({kind:'rect',id:`${g.id}-support-panel`,groupId:g.id,layoutDecoration:true,x:0,y:0,w:g.w,h:g.h,fill:g.supportPanel,radius:0});
      }
      if (g.card) {
        const padding = 16;
        scene.elements.push({kind:'rect',id:`${g.id}-card`,groupId:g.id,layoutDecoration:true,x:0,y:0,w:g.w,h:g.h+padding,fill:g.card,radius:10});
        g.h += padding;
      }
      if (g.rule) scene.elements.push({kind:'line',id:`${g.id}-rule`,groupId:g.id,layoutDecoration:true,x:0,y:0,x2:0,y2:g.h,width:3,color:g.rule});
    }
  }
  const panels=groups.filter(g=>g.supportPanel&&g.lane!=='full');
  if(panels.length===2&&panels[0].lane!==panels[1].lane){
    const h=Math.max(...panels.map(g=>g.h));
    for(const g of panels){g.h=h;for(const e of scene.elements.filter(e=>e.groupId===g.id)){if(e.kind==='text')e.y=(h-e.h)/2;else if(e.kind==='rect'&&e.layoutDecoration)e.h=h;}}
  }
  const baseOrder = layout.order.map(id => groups.find(g => g.id === id)).filter((g): g is LayoutGroup => Boolean(g));
  const attaches = new Map<string, { to: string; gap: number }>();
  for (const a of layout.config.adjustments) if (a.action === 'attach') {
    if (!groups.some(g => g.id === a.target) || !groups.some(g => g.id === a.to)) throw new Error('Attachment target is unavailable in this scene.');
    attaches.set(a.target, { to: a.to, gap: a.gap * Math.min(frame.w, frame.h) });
  }
  const ordered: LayoutGroup[] = [];
  const visit = (g: LayoutGroup) => { ordered.push(g); for (const child of baseOrder.filter(child => attaches.get(child.id)?.to === g.id)) visit(child); };
  for (const g of baseOrder.filter(g => !attaches.has(g.id))) visit(g);
  const cursors = { full: 0, left: 0, right: 0 };
  for (const g of ordered) {
    const attachment = attaches.get(g.id);
    const gap = g.id === 'body' ? spacing(layout, 'copy') : spacing(layout, 'content');
    const laneY = g.lane === 'full' ? Math.max(cursors.full, cursors.left, cursors.right) : Math.max(cursors.full, cursors[g.lane]);
    const anchor = attachment && groups.find(v => v.id === attachment.to);
    g.y = anchor ? Math.max(anchor.y + anchor.h + attachment!.gap, laneY + (laneY > anchor.y + anchor.h ? gap : 0)) : laneY + (laneY > 0 ? gap : 0);
    if (g.stagger && !attachment) { const title = groups.find(v=>v.id==='title'); if(title)g.y += Math.min(title.h*g.stagger, frame.h*.16); }
    g.x = g.lane === 'right' ? frame.w - g.w : 0;
    if (g.lane === 'full' && g.w < frame.w) g.x = (frame.w - g.w) / 2;
    g.x+=g.offsetX??0;
    cursors[g.lane] = g.y + g.h;
    if (g.lane === 'full') cursors.left = cursors.right = cursors.full;
  }
  let used = Math.max(0, ...groups.map(g => g.y + g.h));
  if(layout.config.craft?.distribution==='spread'&&!attaches.size&&ordered.length>1&&ordered.every(g=>g.lane==='full')){
    const extra=Math.max(0,Math.min((frame.h-used)/(ordered.length-1),frame.h*.12));
    ordered.forEach((g,i)=>{g.y+=extra*i;});used=Math.max(0,...groups.map(g=>g.y+g.h));
  }
  const anchor=layout.config.anchor;
  const offset = anchor === 'center' ? Math.max(0, (frame.h - used) / 2) : anchor === 'end' ? Math.max(0, frame.h - used) : 0;
  for (const g of groups) {
    let dx = 0, dy = 0;
    for (const a of layout.config.adjustments) if (a.action === 'move' && (a.target === 'content' || a.target === g.id || a.target === 'copy' && ['title', 'body', 'eyebrow', 'cta', 'credit'].includes(g.id))) { dx += a.dx * frame.w; dy += a.dy * frame.h; }
    g.x += frame.x + dx; g.y += frame.y + offset + dy;
    for (const e of scene.elements.filter(e => e.groupId === g.id)) move(e, g.x, g.y);
  }
  layout.evidence = { groups: groups.map(g => ({ id: g.id, x: g.x, y: g.y, w: g.w, h: g.h })), actions: layout.config.adjustments, iterations: iteration + 1,...(layout.config.balance?{balance:{requestedAnchor:layout.config.anchor,resolvedAnchor:anchor,occupiedFraction:used/frame.h}}:{}) };
  finalizeResponsiveScene(scene, false);
  if(layout.recipe?.id==='penpot-event-card'){
    const copy=groups.filter(g=>['title','body','cta','credit','eyebrow'].includes(g.id));
    if(copy.length){const x=Math.max(frame.x,Math.min(...copy.map(g=>g.x))-20),y=Math.max(frame.y,Math.min(...copy.map(g=>g.y))-20),right=Math.min(frame.x+frame.w,Math.max(...copy.map(g=>g.x+g.w))+20),end=Math.min(frame.y+frame.h,Math.max(...copy.map(g=>g.y+g.h))+20);
      scene.elements.push({kind:'rect',id:'recipe-decoration-panel-border',layoutDecoration:true,x,y,w:right-x,h:end-y,fill:layout.recipe.panelInk,radius:0},{kind:'rect',id:'recipe-decoration-panel',layoutDecoration:true,x:x+2,y:y+2,w:right-x-4,h:end-y-4,fill:layout.recipe.panelFill,radius:0});
    }
  }
  return Math.max(0, used - frame.h);
}

/** Keep manual coordinates and inspector bounds on the same whole groups as relational repairs. */
export function finalizeResponsiveScene(scene: VisualScene, applyOverrides = true) {
  const layout=scene.responsiveLayout;if(!layout)return;
  for(const e of scene.elements.filter(e=>applyOverrides && e.absoluteOverride)) {
    const g=layout.groups.find(g=>g.id===e.groupId);if(!g)continue;
    const dx=e.absoluteOverride!.x===undefined?0:e.absoluteOverride!.x-e.x,dy=e.absoluteOverride!.y===undefined?0:e.absoluteOverride!.y-e.y;
    for(const child of scene.elements.filter(child=>child.groupId===g.id))move(child,dx,dy);
    g.x+=dx;g.y+=dy;
  }
  const bounds=layout.groups.map(g=>{
    const items=scene.elements.filter(e=>e.groupId===g.id);
    const x=Math.min(...items.map(e=>e.kind==='line'?Math.min(e.x,e.x2):e.x)),y=Math.min(...items.map(e=>e.kind==='line'?Math.min(e.y,e.y2):e.y));
    const right=Math.max(...items.map(e=>e.kind==='line'?Math.max(e.x,e.x2):e.x+e.w)),end=Math.max(...items.map(bottom));
    return {id:g.id,x,y,w:right-x,h:end-y};
  });
  layout.evidence={groups:bounds,actions:layout.config.adjustments,iterations:layout.evidence?.iterations??1,...(layout.evidence?.balance?{balance:layout.evidence.balance}:{})};
}
