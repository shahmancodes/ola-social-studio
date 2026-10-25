import {missingRenderedCopy} from './rendered-copy';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import type { ContentBrand } from './content-brand';
import type { VisualPage, VisualScene, SceneElement } from './content-layout';
import { copyText, resolvedComponent, type CopyPage } from './composition';
import { readableInk } from './brand-design';
import { renderSemanticComponentPng, semanticFontFaces } from './semantic-component-image';
import { sceneFontCss } from './scene-renderer';
import { formatGeometry, actionScale, resolveResponsiveScene, type VisualFormat, type LayoutGroup } from './responsive-layout';
import { recipeProfile } from './design-recipes';
import { pageMarker } from './page-marker';
import { mobileMinimumFontSize } from './layout-readability';
import { nativeListTextWidth } from './native-list-layout';

/** All visual formats share this builder; format-specific code supplies only dimensions and protected chrome. */
export async function buildResponsiveScene(format: VisualFormat, page: VisualPage & CopyPage, brand: ContentBrand, index: number, total: number): Promise<VisualScene> {
  const c = page.composition!, profile=c.recipe?recipeProfile(c.recipe.id,format):undefined;
  const r = c.responsive!, balanced=Boolean(r.balance);
  const { width, height, pad, unit, frame:originalFrame } = formatGeometry(format);
  const readable=Boolean(r.readability)&&['story','carousel','post'].includes(format);
  const readingMinimum=(id:string)=>readable?mobileMinimumFontSize(id,width)??0:0;
  const craft=r.craft,frame={...originalFrame};
  if(craft){const spare=frame.w*(1-craft.measure);frame.w-=spare;frame.x+=craft.horizontalAnchor==='right'?spare:craft.horizontalAnchor==='center'?spare/2:0;}
  const background = page.visualOverrides?.background ?? brand.palette[craft?.surface??'background'];
  const ink = readableInk(background, brand.palette.ink), accent = readableInk(background, brand.palette.accent);
  const elements: SceneElement[] = [], groups: LayoutGroup[] = [], rules = brand.designSystem;
  for (const name of [rules?.headingFontName, rules?.bodyFontName]) if (name && !brand.fonts?.some(f => f.name === name)) throw new Error(`Requested font is unavailable in this company snapshot: ${name}`);
  const scene: VisualScene = { width, height, background, elements, measured: true, compositionVersion: 1, fonts: brand.fonts, headingFontId: c.tuning.headingFontId ?? rules?.headingFontId ?? brand.fonts?.find(f => f.name === rules?.headingFontName)?.id, bodyFontId: c.tuning.bodyFontId ?? rules?.bodyFontId ?? brand.fonts?.find(f => f.name === rules?.bodyFontName)?.id };
  if(craft?.rule&&craft.rule!=='none'){
    const gutter=20*unit,x=frame.x-gutter,y=frame.y-gutter,right=frame.x+frame.w+gutter,bottom=frame.y+frame.h+gutter;
    const sides=craft.rule==='top'?['top']:craft.ruleSides??['top','left','right','bottom'];
    // Keep the historical edge order and coordinates when no customization is set.
    const edges=[['top',x,y,right,y],['left',x,y,x,bottom],['right',right,y,right,bottom],['bottom',x,bottom,right,bottom]] as const;
    for(const [side,x,y,x2,y2]of edges)if(sides.includes(side))elements.push({kind:'line',id:`craft-rule-${side}`,layoutDecoration:true,x,y,x2,y2,width:1.5*unit,color:ink});
  }
  if(craft?.accentRule)elements.push({kind:'line',id:'craft-accent-rule',layoutDecoration:true,x:frame.x,y:frame.y-36*unit,x2:frame.x+Math.min(180*unit,frame.w*.25),y2:frame.y-36*unit,width:3*unit,color:accent});
  if (scene.headingFontId) scene.headingFontId = brand.assetAliases?.[scene.headingFontId] ?? scene.headingFontId;
  if (scene.bodyFontId) scene.bodyFontId = brand.assetAliases?.[scene.bodyFontId] ?? scene.bodyFontId;
  const gap = Math.min(frame.w, frame.h) * r.gap * (c.tuning.density === 'airy' ? 1.25 : c.tuning.density === 'compact' ? .75 : 1);
  const visualSpacing=r.adjustments.filter(a=>a.action==='spacing'&&a.target==='visual').at(-1);
  const itemGap=visualSpacing?.action==='spacing'?visualSpacing.gap*Math.min(frame.w,frame.h):undefined;
  const hasVisual = Boolean(page.assetId || page.semanticComponent || page.visualContent);
  const structured = balanced && Boolean(page.visualContent || page.semanticComponent || c.bodyMode !== 'text');
  const bodyCopyId=c.placements.find(p=>p.slot==='body')?.copyId;
  const shortCopy = balanced && !hasVisual && c.bodyMode==='text' && Boolean(bodyCopyId) && copyText(page,bodyCopyId!).length < 210;
  const modularClose=shortCopy&&c.family==='modular-grid'&&c.placements.some(p=>p.slot==='cta');
  const lastReflow = r.adjustments.filter(a => a.action === 'reflow').at(-1);
  const arrangement = lastReflow?.action === 'reflow' ? lastReflow.arrangement : r.arrangement;
  const columns = arrangement === 'columns' || arrangement === 'auto' && (profile?profile.columns:['asymmetric-editorial', 'modular-grid'].includes(c.family) || c.family === 'oversized-typography' && hasVisual);
  const left = (frame.w - gap) * c.tuning.split, right = frame.w - gap - left;
  const mirror=profile?profile.mirror!==c.tuning.mirror:c.tuning.mirror;
  const copyLane = mirror ? 'right' : 'left', artLane = mirror ? 'left' : 'right';
  const laneWidth = (lane: LayoutGroup['lane']) => lane === 'left' ? left : lane === 'right' ? right : frame.w;
  const lanes = new Map<string, LayoutGroup['lane']>([['title', columns ? copyLane : 'full'], ['body', columns ? hasVisual ? copyLane : artLane : 'full'], ['artwork', columns ? artLane : 'full'], ['cta', 'full'], ['credit', 'full'], ['eyebrow', 'full']]);
  if(structured&&arrangement==='auto'&&r.visual.treatment!=='annotated')for(const id of ['title','body','artwork'])lanes.set(id,'full');
  if (!structured&&columns && hasVisual && c.family === 'modular-grid') { lanes.set('title','full'); lanes.set('body',copyLane); }
  if (!structured&&columns && hasVisual && c.family === 'oversized-typography') lanes.set('body','full');
  if(c.recipe?.id==='penpot-event-card')for(const id of ['title','body','cta','credit','eyebrow'])lanes.set(id,columns?copyLane:'full');
  if(modularClose){lanes.set('title','full');lanes.set('body',format==='story'?'full':'left');lanes.set('cta',format==='story'?'full':'right');}
  for(let pass=0;pass<6;pass++)for (const a of r.adjustments) if (a.action === 'attach') lanes.set(a.target, lanes.get(a.to)!);
  if(balanced){
    // An attached cluster must not inherit half a frame after its counterpart moved away.
    // Ignore slots without content, including the unused artwork lane on text-only pages.
    const active=[...lanes].filter(([id,lane])=>lane!=='full'&&(id==='artwork'?hasVisual:c.placements.some(p=>p.slot===id)));
    if(active.length&&new Set(active.map(([,lane])=>lane)).size===1)for(const [id]of active)lanes.set(id,'full');
  }
  const addGroup = (id: string) => { const lane = lanes.get(id) ?? 'full'; const g: LayoutGroup = { id, lane, w: laneWidth(lane), h: 0, x: 0, y: 0 };
    if(c.recipe?.id==='penpot-event-card'&&id!=='artwork'){g.w-=40*unit;g.offsetX=lane==='left'?20*unit:lane==='right'?-20*unit:0;}
    if(c.recipe?.id==='tahta-lead'&&!structured&&id!=='artwork'){g.w*=id==='title'?.92:.82;g.offsetX=lane==='full'?-(frame.w-g.w)/2:0;}
    if(balanced&&!craft&&!profile&&!hasVisual&&c.family==='asymmetric-editorial'&&id==='body'&&lane==='full'&&c.typography?.body?.width===undefined){
      g.w*=.84;g.offsetX=(c.tuning.mirror?-1:1)*(frame.w-g.w)/2;
    }
    const style=c.typography?.[id as 'title'|'body'|'cta'|'credit'|'eyebrow'];
    if(style?.width){const previous=g.w;g.w*=style.width;const align=style.align??craft?.horizontalAnchor??'left';g.offsetX=(g.offsetX??0)+(lane==='full'?(align==='left'?-(previous-g.w)/2:align==='right'?(previous-g.w)/2:0):align==='right'?previous-g.w:align==='center'?(previous-g.w)/2:0);}
    if(craft?.stagger&&id==='body'&&columns&&!hasVisual)g.stagger=craft.stagger;
    groups.push(g); return g; };
  const draw = (slot: string, group: LayoutGroup, size: number, heading = false, color = ink, align = c.tuning.align, x = 0, w = group.w) => {
    const p = c.placements.find(p => p.slot === slot); if (!p) return;
    const block = c.blocks.find(b => b.id === p.copyId)!;
    const alignment = r.adjustments.filter(a => a.action === 'align' && a.target === slot).at(-1);
    const role=block.source==='title'?'title':slot.startsWith('semanticComponent.')||slot.startsWith('visualContent.')?slot.endsWith('.detail')?'detail':'label':slot as 'title'|'body'|'cta'|'credit'|'eyebrow';
    const minSize = Math.max(readingMinimum(role==='title'?'title':slot),18, (role === 'title' ? 38 : slot === 'credit' || slot === 'eyebrow' ? 18 : 24) * unit);
    const typography=c.typography?.[role];
    elements.push({ kind: 'text', typography,accentColor:readableInk(background,brand.palette.accent),id: slot, groupId: group.id, copyId: p.copyId, copySource: block.source, x, y: 0, w, h: frame.h * .8, size: Math.max(minSize, size * (typography?.size??1) * c.tuning.scale * actionScale(r, group.id)), minSize, weight: heading ? 'bold' : 'regular', color, align: alignment?.action === 'align' ? alignment.align : typography?.align??align, text: copyText(page, p.copyId), lines: [], fontFamily: heading ? 'OlaHeading' : 'OlaBody' });
  };
  if (format !== 'carousel' && format !== 'presentation' || rules?.logoPlacement !== 'cover-only' || index === 0) {
    const y = format === 'story' ? 296 : format === 'presentation' ? 40 : pad;
    if (brand.logo) {
      const bytes = await sharp(await fs.readFile(brand.logo.diskPath)).png().toBuffer();
      const metadata=craft?await sharp(bytes).metadata():undefined,aspect=metadata?.width&&metadata.height?metadata.width/metadata.height:220/70;
      const logoW=craft?Math.min(220*unit,70*unit*aspect):220*unit,logoH=craft?logoW/aspect:70*unit,logoX=craft?frame.x:pad;
      if (rules?.logoTreatment !== 'original' && background.toUpperCase() !== '#FFFFFF') elements.push({ kind: 'rect',id:'logo-surface',x:logoX-8,y:y-8,w:logoW+16,h:logoH+16,fill:'#FFFFFF',radius:4 });
      elements.push({ kind: 'image', id: 'logo', x: logoX, y, w: logoW, h: logoH, bytes });
    } else elements.push({ kind: 'text', id: 'brand', x: craft?frame.x:pad, y, w: frame.w, h: 46 * unit, size: 28 * unit, minSize: 18, weight: 'bold', color: ink, text: brand.name, lines: [], fontFamily: 'OlaHeading' });
  }
  for (const slot of ['eyebrow', 'title', 'body', 'cta', 'credit']) {
    if (!c.placements.some(p => p.slot === slot) || r.visual.annotations.some(a => c.placements.find(p => p.copyId === a.copyId)?.slot === slot)) continue;
    const g = addGroup(slot);
    if (!balanced&&!profile&&slot === 'body' && c.family === 'asymmetric-editorial' && columns && !hasVisual) { g.stagger = .45; g.rule = accent; }
    // Family and copy length never imply a filled surface. Only the saved plan can request one.
    const titleSize = profile?.title??(c.family === 'oversized-typography' ? 140 : c.family === 'asymmetric-editorial' || c.family === 'modular-grid' ? 88 : 100);
    const size = slot === 'title' ? (structured?Math.min(titleSize,88):shortCopy?Math.min(titleSize,128):titleSize) * (r.focal === 'artwork' ? .9 : 1) : slot === 'body' ? (modularClose?44:shortCopy?(columns?38:50):profile?.body??40) * (rules?.bodyScale ?? 1) : slot === 'cta' ? modularClose?40:profile?30:32 : 22;
    const panel=c.recipe?.id==='penpot-event-card',copyInk=panel?readableInk(brand.palette.alternate,ink):ink;
    draw(slot, g, size * unit, ['title', 'cta', 'eyebrow'].includes(slot), ['cta', 'eyebrow'].includes(slot)?panel?readableInk(brand.palette.alternate,accent):accent:copyInk,c.tuning.align);
    const e = elements.at(-1)!;
    const customBox=e.kind==='text'&&(page.editorAppearance?.text?.[e.copyId??e.id??'']?.box??e.typography?.box)!==undefined;
    if(!customBox&&r.surfaces?.some(s=>s.target===slot)&&e.kind==='text'){
      const inset=28*unit;g.supportPanel=slot==='cta'?accent:brand.palette.alternate;
      e.x=inset;e.w-=inset*2;e.color=readableInk(g.supportPanel,ink);
    }
    if (e.kind === 'text' && g.card) e.color = readableInk(g.card, ink);
    if (e.kind === 'text' && (g.card || g.rule)) { e.x = g.card ? 16 : 20; e.y = g.card ? 16 : 0; e.w -= g.card ? 32 : 20; }
    if (!balanced&&!profile&&e.kind === 'text' && slot === 'body' && c.family === 'oversized-typography' && !columns) e.w *= .8;
  }
  if (hasVisual) {
    const g = addGroup('artwork'), component = resolvedComponent(page);
    if(page.semanticDesign){
      const spec=page.semanticDesign.spec,profile=format==='presentation'?'landscape':'portrait',p=spec.profiles[profile],height=Math.min(frame.h*.68,g.w*p.heightRatio);
      for(const node of spec.nodes){const box=p.boxes.find(b=>b.id===node.id)!;draw(node.source,g,(node.role==='heading'?44:node.role==='label'?36:28)*unit,node.emphasis==='strong',node.emphasis==='strong'?accent:ink,'left',box.x*g.w,box.w*g.w);const e=elements.at(-1)!;if(e.kind==='text'){e.h=box.h*height;e.minSize=Math.max(e.minSize??0,(node.role==='detail'?24:28)*unit);}}
      g.semanticDesign={spec,profile,height,textFlow:r.visual.textFlow??spec.textFlow};g.visual={mode:'designed',labelIds:spec.nodes.map(n=>n.source),columns:1,treatment:'plain',accent,surface:brand.palette.alternate,ink,unit,imageHeight:height,annotations:[]};

    } else if (r.readability&&c.bodyMode==='text'&&!c.recipe&&!page.assetId&&(page.visualContent?.kind==='example'||component?.kind==='checklist'||component?.kind==='processSteps'||component?.kind==='hubSpoke')) {
      const fields=page.visualContent?.kind==='example'?page.visualContent:undefined;
      const items=fields?.items??component!.items,prefix=fields?'visualContent':'semanticComponent';
      const u=unit*actionScale(r,'artwork'),process=!fields&&component!.kind==='processSteps';
      const columns=r.visual.direction==='vertical'||r.visual.direction==='auto'&&(!process&&!(component?.kind==='hubSpoke'&&format==='presentation')||format==='story'||g.w<800*u)?1:items.length;
      const surface=component?.style?.surface??brand.palette.alternate;
      const itemBackground=r.visual.treatment==='cards'?surface:background;
      const listInk=readableInk(itemBackground,component?.style?.foreground??ink),listAccent=readableInk(itemBackground,component?.style?.accent??accent);
      const headerInk=readableInk(background,component?.style?.foreground??ink),detailInk=readableInk(itemBackground,component?.style?.muted??listInk);
      g.visual={mode:'native-list',listKind:fields?'fields':component!.kind as 'checklist'|'processSteps'|'hubSpoke',itemGap,labelIds:[],details:{},tagIds:{},headerIds:[],auxIds:[],columns,treatment:r.visual.treatment,nodes:r.visual.nodes,accent:listAccent,surface,ink:listInk,unit:u,imageHeight:0,annotations:[]};
      const nativeWidth=nativeListTextWidth(g),placed=(slot:string)=>c.placements.some(p=>p.slot===slot);
      for(const field of ['prompt','answer','leftTitle','rightTitle']){
        const slot=`semanticComponent.${field}`;if(!placed(slot))continue;
        const sharedTitle=c.blocks.find(b=>b.id===c.placements.find(p=>p.slot===slot)?.copyId)?.source==='title';
        g.visual.headerIds!.push(slot);draw(slot,g,(sharedTitle?88:field==='prompt'?44:34)*unit,field!=='answer',headerInk,'left');
      }
      items.forEach((_,index)=>{
        const slot=`${prefix}.items.${index}.label`;
        g.visual!.labelIds.push(slot);draw(slot,g,38*unit,true,listInk,'left',0,nativeWidth);
        for(const field of ['detail','tag']){
          const id=`${prefix}.items.${index}.${field}`;if(!placed(id))continue;
          (field==='detail'?g.visual!.details!:g.visual!.tagIds!)[slot]=id;
          draw(id,g,(field==='detail'?34:32)*unit,field==='tag',field==='detail'?detailInk:listInk,'left',0,nativeWidth);
        }
      });
      for(const field of ['takeaway','note','unit']){const slot=`semanticComponent.${field}`;if(placed(slot)){g.visual.auxIds!.push(slot);draw(slot,g,32*unit,false,field==='takeaway'?headerInk:readableInk(background,component?.style?.muted??ink),'left');}}
      if(component?.style){
        scene.additionalFontCss=await semanticFontFaces();
        const families={manrope:'Manrope',poppins:'Poppins',system:'Arial',serif:'Georgia'};
        for(const e of elements.filter(e=>e.groupId===g.id))if(e.kind==='text')e.fontFamily=families[e.weight==='bold'?component?.style.headingFontFamily??component?.style.fontFamily:component?.style.fontFamily];
      }
    } else if (component?.kind === 'relatedPair' && !page.assetId) {
      const columns = g.w < 600 * unit ? 1 : 2;
      const cellWidth = columns === 1 ? g.w - 40 * unit : itemGap===undefined?g.w * .44:(g.w-itemGap)/2;
      const pairAccent = readableInk(background, component.style?.accent ?? accent);
      const pairInk = readableInk(background, component.style?.foreground ?? ink);
      const muted = readableInk(background, component.style?.muted ?? brand.palette.ink);
      const headerIds = ['semanticComponent.prompt', 'semanticComponent.answer'].filter(slot => c.placements.some(p => p.slot === slot));
      // A prompt shared with the page title keeps headline hierarchy and reading order.
      const sharedTitle = headerIds.find(slot => c.blocks.find(b => b.id === c.placements.find(p => p.slot === slot)?.copyId)?.source === 'title');
      if (sharedTitle) {
        draw(sharedTitle, addGroup('title'), 88 * unit, true, pairInk, c.tuning.align);
        headerIds.splice(headerIds.indexOf(sharedTitle), 1);
      }
      headerIds.forEach(slot => draw(slot, g, (slot.endsWith('.prompt') ? 44 : 32) * unit, slot.endsWith('.prompt'), pairInk, 'left'));
      const labelIds = component.items.map((_, i) => `semanticComponent.items.${i}.label`);
      const details: Record<string, string> = {};
      labelIds.forEach(slot => {
        draw(slot, g, 38 * unit, true, pairInk, 'left', 0, cellWidth);
        const detail = slot.replace(/\.label$/, '.detail');
        if (c.placements.some(p => p.slot === detail)) { details[slot] = detail; draw(detail, g, 34 * unit, false, muted, 'left', 0, cellWidth); }
      });
      const auxIds = ['semanticComponent.note'].filter(slot => c.placements.some(p => p.slot === slot));
      auxIds.forEach(slot => draw(slot, g, 24 * unit, false, muted, 'left'));
      if (component.style) {
        scene.additionalFontCss = await semanticFontFaces();
        const families = { manrope: 'Manrope', poppins: 'Poppins', system: 'Arial', serif: 'Georgia' };
        for (const e of elements.filter(e => e.groupId === g.id)) if (e.kind === 'text') e.fontFamily = families[e.weight === 'bold' ? component.style.headingFontFamily ?? component.style.fontFamily : component.style.fontFamily];
      }
      g.visual = { mode: 'related-pair', itemGap, labelIds, details, headerIds, auxIds, columns, treatment: 'plain', accent: pairAccent, surface: background, ink: pairInk, unit, imageHeight: 0, annotations: [] };
    }else{

    const bound = c.placements.filter(p => /^semanticComponent\.items\.\d+\.label$/.test(p.slot));
    const annotated = r.visual.treatment === 'annotated';
    const special=c.recipe?.id==='tahta-stats'?(component?.kind==='barChart'?'bars':'stats'):c.recipe?.id==='tahta-compare'?'table':c.recipe?.id==='tahta-timeline'?'timeline':undefined;
    const native = Boolean(page.visualContent) || Boolean(special) || c.bodyMode !== 'text' && bound.length > 0;
    const visualLabels=c.placements.filter(p=>/^visualContent\.items\.\d+\.label$/.test(p.slot));
    const visualMode=page.visualContent?.kind==='process'?'sequence':page.visualContent?.kind==='comparison'?'comparison':page.visualContent?'grid':c.bodyMode;
    const labels = annotated ? r.visual.annotations.map(a => c.placements.find(p => p.copyId === a.copyId)!) : page.visualContent ? visualLabels : native ? bound : [];
    const direction = r.visual.direction;
    const visualScale = actionScale(r, 'artwork') * (r.focal === 'artwork' ? 1.12 : 1);
    const maxColumns = visualMode === 'sequence' ? 4 : 2;
    const requestedColumns = direction === 'vertical' ? 1 : direction === 'horizontal' ? Math.min(labels.length,maxColumns) : special==='stats' ? format==='story'?1:labels.length : special==='table'?2 : special==='timeline' ? format==='story'||labels.length>4||structured&&labels.length===3 ? 1 : structured&&format!=='presentation'?Math.min(2,labels.length):labels.length : structured&&visualMode==='sequence'&&(format==='story'||labels.length===3)?1:structured&&visualMode==='sequence'&&format!=='presentation'?Math.min(2,labels.length):Math.min(maxColumns,Math.max(1,Math.floor(g.w/(210*unit))));
    const count=craft?Math.min(Math.max(1,labels.length),requestedColumns):requestedColumns;
    const processGutter = visualMode==='sequence'&&labels.length>count&&count>1 ? 52*unit*actionScale(r,'artwork') : 0;
    const cellW = (g.w - processGutter - gap * .7 * (count - 1)) / Math.max(1, count);
    const cards = r.visual.treatment === 'cards';
    const visualUnit = unit * actionScale(r, 'artwork');
    const labelPad = structured&&visualMode==='sequence'?24*visualUnit:cards ? 18 * visualUnit : 8 * visualUnit;
    const processLane = visualMode==='sequence'&&count===1 ? (structured?r.visual.treatment==='numbered'?58:r.visual.nodes==='dots'?32:0:r.visual.treatment==='numbered'?46:r.visual.nodes==='none'?14:32)*visualUnit : 0;
    const labelWidth = special==='bars'?g.w*.29:annotated ? g.w * .34 - 24 * unit : special?cellW-(special==='timeline'?(structured?(48+(count===1?r.visual.treatment==='numbered'?58:r.visual.nodes==='dots'?32:0:0))*visualUnit:count===1?28*unit+gap:0):0):cellW - labelPad * 2 - processLane;
    const surface=component?.style?.surface??brand.palette.alternate;
    const labelInk=readableInk(cards?surface:background,component?.style?.foreground??brand.palette.ink);
    labels.forEach(p => draw(p.slot, g, (special==='bars'?32:special==='table'?31:annotated ? 28 : structured?44:36) * unit * (special||structured?1:(r.focal === 'artwork' ? 1.12 : 1) * (.8 + r.visualWeight)), special!=='table', labelInk, special?'left':visualMode === 'sequence' && !cards ? 'center' : 'left', 0, labelWidth));
    const details:Record<string,string>={},tagIds:Record<string,string>={};
    for(const label of [...visualLabels,...(special?bound:[])]){for(const field of ['detail',...(special==='timeline'?['tag']:[])]){const slot=label.slot.replace(/\.label$/,'.'+field);if(c.placements.some(p=>p.slot===slot)){(field==='tag'?tagIds:details)[label.slot]=slot;draw(slot,g,(field==='tag'?22:special==='table'?31:26)*unit,false,labelInk,'left',0,labelWidth);}}}
    const headerIds:string[]=[],auxIds:string[]=[],numericIds:string[]=[];
    if(special){
      if(special==='table')for(const slot of ['semanticComponent.leftTitle','semanticComponent.rightTitle'])if(c.placements.some(p=>p.slot===slot)){headerIds.push(slot);draw(slot,g,28*unit,true,accent,'left',0,labelWidth);}
      const unitPlacement=c.placements.find(p=>p.slot==='semanticComponent.unit');
      if(special==='stats'||special==='bars')component!.items.forEach((item,i)=>{const id=`metric-value-${i}`;numericIds.push(id);elements.push({kind:'text',id,groupId:g.id,...(i===0&&unitPlacement?{copyId:unitPlacement.copyId}:{}),copySource:`semanticComponent.items.${i}.value`,derivedValue:{valueSource:`semanticComponent.items.${i}.value`,unitSource:"semanticComponent.unit"},x:0,y:0,w:special==='bars'?g.w*.12:labelWidth,h:frame.h*.4,size:Math.max(readingMinimum(id),(special==='bars'?32:112)*unit*actionScale(r,'artwork')),minSize:Math.max(readingMinimum(id),(special==='bars'?24:48)*unit),weight:'bold',fontFamily:'OlaHeading',color:accent,text:String(item.value)+component!.unit,lines:[]});});
      // A shared numeric unit is stored once; repeating it as a value suffix is intentional mathematical formatting.
      const drawn=new Set([...labels.map(p=>p.slot),...Object.values(details),...Object.values(tagIds),...headerIds,...(special==='stats'||special==='bars'?['semanticComponent.unit']:[])]);
      for(const p of c.placements.filter(p=>p.slot.startsWith('semanticComponent.')&&!drawn.has(p.slot))){auxIds.push(p.slot);draw(p.slot,g,24*unit,false,ink,'left',0,g.w);}
    }
    if (component?.style && labels.length) {
      scene.additionalFontCss = await semanticFontFaces();
      for (const e of elements.filter(e => e.groupId === g.id)) e.fontFamily = ({ manrope: 'Manrope', poppins: 'Poppins', system: 'Arial', serif: 'Georgia' } as const)[component.style.headingFontFamily ?? component.style.fontFamily];
    }
    const imageHeight = Math.min(frame.h * r.visualWeight * visualScale, frame.h * .68);
    g.visual = { balance:balanced,minHeight:structured?Math.min(frame.h*.38,440*unit)*actionScale(r,'artwork'):undefined,mode:c.recipe?.id==='apple-triptych'?'triptych':special??(annotated ? 'annotated' : native ? visualMode === 'sequence' ? 'sequence' : visualMode === 'comparison' ? 'comparison' : 'grid' : page.assetId ? 'image' : 'component'), labelIds: labels.map(p => p.slot), ...(special==='bars'?{barValues:component!.items.map(i=>i.value),valueUnit:component!.unit}:{}), details,tagIds,headerIds,auxIds,numericIds, columns: Math.max(1, count), treatment: r.visual.treatment,nodes:r.visual.nodes, accent: component?.style?.accent ?? accent, surface: component?.style?.surface ?? brand.palette.alternate, ink, unit: visualUnit, imageHeight, annotations: r.visual.annotations.map(a=>({...a})) };
    if (page.assetId) {
      const asset = brand.assets.find(a => a.id === page.assetId); if (!asset) throw new Error('Selected artwork is outside this company snapshot.');
      const bytes = await sharp(await fs.readFile(asset.diskPath)).png().toBuffer();
      elements.push({ kind: 'image', id: 'artwork', groupId: g.id, x: 0, y: 0, w: g.w, h: imageHeight, bytes });
      for(const [i,id]of (page.supportingAssetIds??[]).entries()){
        const other=brand.assets.find(a=>a.id===id);if(!other||!other.mediaType.startsWith('image/'))throw new Error('Triptych artwork is outside this company snapshot.');
        elements.push({kind:'image',id:`artwork-secondary-${i+1}`,groupId:g.id,x:0,y:0,w:g.w,h:imageHeight,bytes:await sharp(await fs.readFile(other.diskPath)).png().toBuffer()});
      }
    }
    if (component && !native && !annotated) {
      let embeddedText:import('./semantic-component-image').ComponentTextMetrics|undefined;
      const bytes = await renderSemanticComponentPng(component, accent, brand.companyId, { width: Math.round(g.w), height: Math.round(imageHeight), sourceCopyOnly:true,fontCss: await sceneFontCss(scene),onTextMetrics:metrics=>{embeddedText=metrics;} });
      // A supplied image and diagram are both retained. They share one movable visual group.
      elements.push({ kind: 'image', id: page.assetId ? 'diagram' : 'artwork', groupId: g.id, x: 0, y: page.assetId ? imageHeight + gap : 0, w: g.w, h: imageHeight, bytes,embeddedText });
      if (page.assetId) g.visual.mode = 'component';
    }
    }
  }
  const imageFirst = c.family === 'image-led' && !c.tuning.mirror && !columns;
  scene.responsiveLayout = { version: 1, frame, config:r, gap, split: c.tuning.split, groups, order:structured?['eyebrow','title','body','artwork','cta','credit']:profile?[...profile.order]:imageFirst ? ['eyebrow', 'artwork', 'title', 'body', 'cta', 'credit'] : columns && hasVisual && c.family === 'oversized-typography' ? ['eyebrow', 'title', 'artwork', 'body', 'cta', 'credit'] : ['eyebrow', 'title', 'body', 'artwork', 'cta', 'credit'], placements: c.placements,...(c.recipe?{recipe:{...c.recipe,format,panelFill:brand.palette.alternate,panelInk:ink}}:{}) };
  if(r.pageMarker!==false&&balanced&&total>1){
    elements.push(...pageMarker(index,total,width-pad-154*unit,format==='story'?316:format==='presentation'?60:pad+18,unit,ink,accent));
  } else if (r.pageMarker!==false&&!balanced&&format === 'carousel') {
    elements.push({ kind: 'rect', id: 'progress', x: pad, y: height - 70, w: frame.w, h: 4, fill: brand.palette.alternate });
    elements.push({ kind: 'rect', x: pad + index * frame.w / total, y: height - 70, w: frame.w / total, h: 4, fill: accent });
  }
  // Width/size overrides precede measurement. Position overrides are applied after relational layout.
  for (const e of elements) {
    const o = page.visualOverrides?.[e.id as 'title' | 'body' | 'cta' | 'artwork' | 'eyebrow']; if (!o) continue;
    if (e.kind === 'text') { if (o.width !== undefined) e.w = o.width * width; if (o.fontSize !== undefined) { if(o.fontSize < (e.minSize??18))throw new Error('Requested text size is below the readable minimum for this format.');e.size = o.fontSize; } if (o.color) e.color = o.color; }
    if (o.x !== undefined || o.y !== undefined) e.absoluteOverride = { x: o.x === undefined ? undefined : o.x * width, y: o.y === undefined ? undefined : o.y * height };
    if (e.id === 'artwork' && e.kind === 'image' && (o.width !== undefined || o.height !== undefined)) throw new Error('Use scale/reflow actions to resize a responsive visual group while retaining its labels and connectors.');
  }
  resolveResponsiveScene(scene);
  // Registry coverage alone is insufficient: legacy diagrams can retain source
  // fields in JSON/desc while never drawing them. Fail before candidate selection.
  const embedded=elements.flatMap(e=>e.kind==='image'&&!e.hidden?(e.embeddedText?.text.map(t=>t.content)??[]):[]);
  const missing=c.placements.flatMap(p=>missingRenderedCopy([{source:p.slot,text:copyText(page,p.copyId)}],[...embedded,...elements.flatMap(e=>e.kind==='text'&&!e.hidden&&e.copyId===p.copyId?[e.text]:[])]));
  if(missing.length)throw Error(`Rendered composition omitted canonical copy: ${missing.join(', ')}. Preserve the source and choose a renderer that covers every existing field.`);
  return scene;
}
