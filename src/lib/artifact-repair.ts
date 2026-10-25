import {pageMarkersAllowed} from './page-marker';
import {StructuredVisualSchema} from './structured-visual';
import { mergeTextboxStyle } from './textbox-style';
import {supportingCopyBudgetIssues} from "./supporting-copy-budget";
import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import type { SimpleArtifact } from './simple-content';
import { CraftPatchSchema, LayoutActionSchema, ResponsiveLayoutSchema, ResponsivePatchSchema } from './composition-design';
import { DesignTypographyPatchSchema, TextTypographySchema, resolveTypographyPatch, typographyWordMap } from './design-typography';
import { VISUAL_LAYOUTS } from './visual-layout-types';
import { SemanticComponentSchema, type SlideSpec } from './schemas';
import {representationCopyPolicy,suppliedCopyIssues} from './content-representation';
import {suppliedPairs} from './supplied-pairs';
import { CompositionPlanSchema, composePage, artifactPages, withArtifactPages, artifactCompositionIssues, resolvedComponent, resolvedVisualContent, editPageComponent, compositionIssues, pageCompositionCapabilities } from './composition';
const override=z.object({x:z.number().min(0).max(1).optional(),y:z.number().min(0).max(1).optional(),width:z.number().min(.05).max(1).optional(),height:z.number().min(.03).max(1).optional(),fontSize:z.number().min(24).max(150).optional(),color:z.string().regex(/^#[\da-f]{6}$/i).optional()}).strict();
export const RepairSchema=z.object({patches:z.array(z.object({target:z.string(),reason:z.string().max(800).optional(),typography:DesignTypographyPatchSchema.optional(),craft:CraftPatchSchema.optional(),responsive:ResponsivePatchSchema.optional(),resetLayoutActions:z.literal(true).optional(),layoutActions:z.array(LayoutActionSchema).min(1).max(8).optional(),compositionPlan:CompositionPlanSchema.optional(),semanticComponent:SemanticComponentSchema.nullable().optional(),visualContent:StructuredVisualSchema.optional(),layout:z.enum(VISUAL_LAYOUTS).optional(),title:z.string().max(90).optional(),body:z.string().max(300).optional(),cta:z.string().max(60).optional(),visualOverrides:z.object({background:z.string().regex(/^#[\da-f]{6}$/i).optional(),title:override.optional(),body:override.optional(),cta:override.optional(),artwork:override.optional()}).strict().optional()}).strict()).max(12),reason:z.string().max(800)}).strict();

/** Offer only real page targets and preserve selected direction identity during AI craft repairs. */
export function artifactRepairSchema(artifact:SimpleArtifact){
 if(artifact.type==='article')return RepairSchema;
 const pages=artifactPages(artifact),targets=artifact.type==='carousel'||artifact.type==='presentation'?artifact.slides.map(s=>s.id):['page-1'];
 const directions=[...new Set(pages.map(page=>page.composition?.directionId).filter((id):id is string=>Boolean(id&&artifact.artDirection?.directions.some(d=>d.id===id))))];
 const plan=directions.length?CompositionPlanSchema.extend({directionId:z.enum(directions as [string,...string[]]).optional()}):CompositionPlanSchema;
 const textFlow=pages.some(page=>page.semanticDesign)?z.enum(['regions','grouped']).optional():z.never().optional();
 const visual=ResponsiveLayoutSchema.shape.visual.unwrap().extend({textFlow}).default({treatment:'plain',direction:'auto',annotations:[]});
 const responsive=ResponsivePatchSchema.extend({visual:ResponsivePatchSchema.shape.visual.unwrap().extend({textFlow}).optional()});
 const patches=pages.map((page,index)=>{
  const modes=pageCompositionCapabilities(page).bodyModes;
  const compositionPlan=plan.extend({bodyMode:z.enum(modes).default('text'),responsive:ResponsiveLayoutSchema.extend({visual}).optional()});
  return RepairSchema.shape.patches.element.extend({target:z.literal(targets[index]),compositionPlan:compositionPlan.optional(),responsive:responsive.optional()});
 });
 const patch=patches.length===1?patches[0]:z.union(patches);
 return RepairSchema.extend({patches:z.array(patch).max(12)});
}

/** Zero-based word evidence for numeric controls; exact-phrase patches avoid index arithmetic. */
export function artifactTypographySources(artifact:SimpleArtifact){
 const targets=artifact.type==='carousel'||artifact.type==='presentation'?artifact.slides.map(s=>s.id):['page-1'];
 return artifactPages(artifact).map((page,index)=>({target:targets[index],fields:Object.fromEntries(['title','body','cta','eyebrow','credit'].flatMap(role=>{const text=page[role as 'title'|'body'|'cta'|'eyebrow'|'credit'];return text?[ [role,typographyWordMap(text)] ]:[];}))}));
}

export function applyArtifactPatches(artifact:SimpleArtifact, input:unknown, brief:string):SimpleArtifact {
  const {patches}=RepairSchema.parse(input);const next=structuredClone(artifact);
  // Quoted required copy is authoritative. A visual repair may not rewrite it.
  const required=[...brief.matchAll(/["“]([^"”]+)["”]/g)].map(m=>m[1]);
  const locked=(old:string,value:string|undefined,moved:ReadonlySet<string>=new Set())=>{if(value!==undefined&&value!==old&&required.some(q=>old.includes(q)&&!value.includes(q)&&!moved.has(q)))throw new Error('Repair attempted to change required copy.');};
  const migratedPairs=(patch:typeof patches[number],body:string)=>{
    const moved=new Set<string>();
    if(patch.body!==''||!patch.semanticComponent||!patch.compositionPlan||patch.compositionPlan.bodyMode!=='text')return moved;
    const pairs=suppliedPairs(brief).map(pair=>({label:brief.slice(pair.label.start,pair.label.end),detail:brief.slice(pair.detail.start,pair.detail.end)}));
    if(!pairs.some(pair=>body.includes(pair.label)&&body.includes(pair.detail)))return moved;
    const component=patch.semanticComponent;
    if([component.prompt,component.answer,component.leftTitle,component.rightTitle,component.takeaway,component.note,component.unit].some(v=>v?.trim())||component.items.some(item=>item.tag?.trim()||!pairs.some(pair=>pair.label===item.label&&pair.detail===item.detail)))throw Error('Repair attempted to change required copy: canonical pair transfer permits only the exact supplied label/detail fields.');
    // A separately supplied whole paragraph stays locked; headline and CTA have their own field locks.
    const protectedValues=representationCopyPolicy(brief).exactCopyRefs.filter(r=>r.id==='body').map(r=>brief.slice(r.start,r.end));
    let remaining=body;
    for(const {label,detail}of pairs){
      if(patch.semanticComponent.items.some(item=>item.label===label&&item.detail===detail))for(const value of [label,detail]){remaining=remaining.replace(value,'');if(!protectedValues.includes(value))moved.add(value);}
    }
    if(remaining.replace(/[\s:;,/.–—|"'“”•-]+/g,''))throw Error('Repair attempted to change required copy: canonical pair transfer must preserve every paragraph word.');
    return moved;
  };
  const seen=new Set<string>();
  for(const p of patches){if(p.semanticComponent&&p.visualContent)throw new Error('Choose one structured visual per patch.');if(seen.has(p.target))throw new Error('Duplicate repair target.');seen.add(p.target);
    if(next.type==='story'||next.type==='post'||next.type==='poster'){
      if(p.target!=='page-1')throw new Error('Unknown repair target.');locked(next.headline,p.title);locked(next.subline,p.body,migratedPairs(p,next.subline));if(next.type==='story'||next.type==='poster')locked(next.cta,p.cta);
      if(p.title!==undefined)next.headline=p.title;if(p.body!==undefined)next.subline=p.body;if(p.cta!==undefined&&(next.type==='story'||next.type==='poster'))next.cta=p.cta;
      if(p.semanticComponent!==undefined){locked(JSON.stringify(next.semanticComponent??{}),JSON.stringify(p.semanticComponent));if(p.semanticComponent?.assetPath&&p.semanticComponent.assetPath!==next.semanticComponent?.assetPath)throw new Error('Repair selected artwork outside the current component.');next.semanticComponent=p.semanticComponent??undefined;if(p.semanticComponent)delete next.visualContent;}
      if(p.visualContent){next.visualContent=p.visualContent;delete next.semanticComponent;}
      if(p.layout)next.layout=p.layout;if(p.visualOverrides)next.visualOverrides={...next.visualOverrides,...p.visualOverrides};
    }else if(next.type==='carousel'||next.type==='presentation'){
      const slide=next.slides.find(s=>s.id===p.target);if(!slide)throw new Error('Unknown repair target.');locked(slide.title,p.title);locked(slide.body,p.body,migratedPairs(p,slide.body));locked(slide.cta??'',p.cta);if(p.cta!==undefined)slide.cta=p.cta;
      if(p.semanticComponent!==undefined){locked(JSON.stringify(slide.semanticComponent??{}),JSON.stringify(p.semanticComponent));if(p.semanticComponent?.assetPath&&p.semanticComponent.assetPath!==slide.semanticComponent?.assetPath)throw new Error('Repair selected artwork outside the current component.');slide.semanticComponent=p.semanticComponent??undefined;if(p.semanticComponent)delete slide.visualContent;}
      if(p.title!==undefined)slide.title=p.title;if(p.body!==undefined)slide.body=p.body;if(p.visualContent){slide.visualContent=p.visualContent;delete slide.semanticComponent;}if(p.layout)slide.layout=p.layout;if(p.visualOverrides)slide.visualOverrides={...slide.visualOverrides,...p.visualOverrides};
    }else throw new Error('This patch interface only supports visual pages.');
  }
  let pages=artifactPages(next);
  for (const patch of patches) {
    const i = next.type==='carousel'||next.type==='presentation' ? next.slides.findIndex(s=>s.id===patch.target) : 0;
    const prior=artifactPages(artifact)[i], page=pages[i];
    if (!prior?.composition && !patch.compositionPlan) { if(patch.layoutActions||patch.typography||patch.craft||patch.responsive||patch.resetLayoutActions)throw new Error('Relational layout actions require a composition plan.'); continue; }
    if (patch.layout && !patch.compositionPlan) throw new Error('A composed page needs compositionPlan to change its layout.');
    if (patch.semanticComponent!==undefined && !patch.compositionPlan) {
      if (!patch.semanticComponent) throw new Error('Removing a bound diagram requires a new composition plan.');
      pages[i]=editPageComponent({...page,semanticComponent:prior.semanticComponent},patch.semanticComponent);
    }
    if (patch.visualContent) throw new Error('Composed pages use semantic components with copy references.');
    if (patch.compositionPlan) {
      patch.compositionPlan.directionId ??= prior?.composition?.directionId;
      if (patch.compositionPlan.directionId && artifact.artDirection && !artifact.artDirection.directions.some(direction => direction.id === patch.compositionPlan!.directionId)) throw new Error('Composition repair must reference an existing art direction.');
      if(prior?.composition?.bodyMode===patch.compositionPlan.bodyMode&&prior.composition.separator&&patch.compositionPlan.separator&&patch.compositionPlan.separator!==prior.composition.separator)throw new Error('Preserve the exact existing copy separator, including its arrow character and spaces; connector styling does not change the source delimiter.');
      // Resolve the old binding before replanning; composePage deduplicates it against its canonical source.
      // Omitting responsive controls must not downgrade a measured page to legacy geometry.
      patch.compositionPlan.responsive ??= prior?.composition?.responsive?structuredClone(prior.composition.responsive):undefined;
      if(prior?.composition?.responsive?.balance&&patch.compositionPlan.responsive)patch.compositionPlan.responsive.balance=prior.composition.responsive.balance;
      if(prior?.composition?.responsive?.readability&&patch.compositionPlan.responsive)patch.compositionPlan.responsive.readability=prior.composition.responsive.readability;
      // An explicit canonical replacement must not be overwritten by the old paragraph projections.
      const canonical=patch.semanticComponent!==undefined?{...page,composition:undefined}: {...page,semanticComponent:resolvedComponent(page)};
      pages[i]=composePage(canonical,patch.compositionPlan);
    }
    if ((patch.responsive||patch.resetLayoutActions)&&(patch.title!==undefined||patch.body!==undefined||patch.cta!==undefined||patch.semanticComponent!==undefined||patch.visualContent))throw new Error('Structural layout patches must preserve approved copy; submit copy repairs separately.');
    if (patch.responsive) {
      const composed=pages[i].composition!;
      if(!composed.responsive)throw new Error('Structural controls require a responsive composition.');
      const current=composed.responsive;
      const responsive=ResponsiveLayoutSchema.parse({...current,...patch.responsive,visual:{...current.visual,...patch.responsive.visual}});
      // A direct arrangement choice supersedes the earlier reflow action for that same setting.
      if(patch.responsive.arrangement!==undefined)responsive.adjustments=responsive.adjustments.filter(action=>action.action!=='reflow');
      pages[i]={...pages[i],composition:{...composed,responsive}};
    }
    if(patch.resetLayoutActions){
      const composed=pages[i].composition!;
      if(!composed.responsive)throw new Error('Resetting layout actions requires a responsive composition.');
      pages[i]={...pages[i],composition:{...composed,responsive:{...composed.responsive,adjustments:[]}}};
    }
    if (patch.layoutActions) {
      if(patch.title!==undefined||patch.body!==undefined||patch.cta!==undefined||patch.semanticComponent!==undefined||patch.visualContent)throw new Error('Geometry actions must preserve approved copy; submit copy repairs separately.');
      const composed = pages[i].composition!;
      const responsive = ResponsiveLayoutSchema.parse(composed.responsive ?? {version:1});
      for (const action of patch.layoutActions) {
        // Replace settings, accumulate bounded transformations, and keep the full repair history in workflow events.
        responsive.adjustments = responsive.adjustments.filter(old => !(old.action === action.action && (action.action === 'reflow' || 'target' in action && 'target' in old && old.target === action.target && !['move','scale'].includes(action.action))));
        responsive.adjustments.push(action);
      }
      pages[i] = {...pages[i],composition:{...composed,responsive:ResponsiveLayoutSchema.parse(responsive)}};
    }
    if(patch.typography){const current=pages[i].composition!;const typography={...current.typography};for(const role of Object.keys(patch.typography) as Array<keyof typeof typography>){const raw=patch.typography[role];if(!raw)continue;const update=['title','body','cta','eyebrow','credit'].includes(role)?resolveTypographyPatch(String(pages[i][role as 'title'|'body'|'cta'|'eyebrow'|'credit']??''),raw):TextTypographySchema.parse(raw);typography[role]={...typography[role],...update,...(update.box!==undefined?{box:mergeTextboxStyle(typography[role]?.box,update.box)}:{})};}pages[i].composition={...current,typography};}
    if(patch.craft){const c=pages[i].composition!;if(!c.responsive)throw Error('Craft controls require a responsive composition.');const craft=ResponsiveLayoutSchema.shape.craft.unwrap().parse({version:1,...c.responsive.craft,...patch.craft});pages[i].composition={...c,responsive:{...c.responsive,craft}};}
    const issues=compositionIssues(pages[i]);if(issues.length)throw new Error(issues.join(' '));
  }
  const result=withArtifactPages(next,pages);
  const issues=requiredCopyIssues(result,brief);if(issues.length)throw new Error(issues.join(' '));
  if (isDeepStrictEqual(repairDesignState(artifact), repairDesignState(result))) throw new Error('Repair makes no design change. Change the actual typography, craft, geometry or approved content needed to resolve the reported defect; changing only intent or direction labels is insufficient.');
  return result;
}

/** Planning prose is not a visual repair. Exclude it when checking whether a patch does work. */
function repairDesignState(artifact: SimpleArtifact) {
  // composePage may add optional undefined fields; they do not change the saved or rendered design.
  return JSON.parse(JSON.stringify(artifactPages(artifact).map(page => {
    if (!page.composition) return page;
    const { intent: _intent, directionId: _direction, ...composition } = page.composition;
    return { ...page, composition };
  })));
}
const componentEvidence=(component:SlideSpec['semanticComponent'])=>component?{kind:component.kind,prompt:component.prompt,answer:component.answer,leftTitle:component.leftTitle,rightTitle:component.rightTitle,takeaway:component.takeaway,note:component.note,unit:component.unit,items:component.items.map(({label,detail,tag,value,value2,value3,group})=>({label,detail,tag,value,value2,value3,group}))}:undefined;
const placementEvidence=(page:{composition?:import('./composition').Composition})=>page.composition?.bodyMode==='sequence'?{sourceField:'Supporting line',separator:page.composition.separator,representation:'Ordered labels connected by native directional arrows; no duplicate standalone sentence.'}:undefined;
export function contentForEvidence(input:SimpleArtifact){
  // Review the visible placements, not both a source paragraph and the labels projected from it.
  const artifact=withArtifactPages(input,artifactPages(input).map(p=>{
    if(!p.composition)return p;
    const visible=(slot:string)=>p.composition!.placements.some(item=>item.slot===slot);
    return {...p,title:visible('title')?p.title:'',body:visible('body')?p.body:'',cta:visible('cta')?p.cta:undefined,credit:visible('credit')?p.credit:undefined,eyebrow:visible('eyebrow')?p.eyebrow:undefined,visualContent:resolvedVisualContent(p),semanticComponent:resolvedComponent(p)};
  }));
  if(artifact.type==='story'||artifact.type==='poster')return {headline:artifact.headline,subline:artifact.subline,cta:artifact.cta,credit:artifact.credit,eyebrow:artifact.eyebrow,visualContent:artifact.visualContent,semanticComponent:componentEvidence(artifact.semanticComponent),copyPlacement:placementEvidence(artifact)};
  if(artifact.type==='post')return {headline:artifact.headline,subline:artifact.subline,caption:artifact.caption,credit:artifact.credit,eyebrow:artifact.eyebrow,semanticComponent:componentEvidence(artifact.semanticComponent)};
  if(artifact.type==='article')return {title:artifact.title,sections:artifact.sections.map(({title,body,semanticComponent})=>({title,body,semanticComponent:componentEvidence(semanticComponent)}))};
  return {title:artifact.title,slides:artifact.slides.map(({title,body,cta,credit,eyebrow,visualContent,semanticComponent,composition})=>({title,body,cta,credit,eyebrow,visualContent,semanticComponent:componentEvidence(semanticComponent),copyPlacement:placementEvidence({composition})}))};
}
export function requiredCopyIssues(artifact:SimpleArtifact,brief:string){
  const issues:string[]=[...artifactCompositionIssues(artifact),...suppliedCopyIssues(artifact,brief),...supportingCopyBudgetIssues(artifact,brief)];
  if(/\b(?:no|do not add|without)\b[^.!?\n]{0,180}\bdates\b/i.test(brief)){
    const visible=JSON.stringify(contentForEvidence(artifact));
    if(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|June|July|August|September|October|November|December)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?/i.test(visible))issues.push('The brief forbids dates; remove calendar dates, weekdays and specific times from the visible copy.');
  }
  if (representationCopyPolicy(brief).sentenceOnly || /avoid extra text|no extra (?:text|copy)/i.test(brief)) {
    for (const page of artifactPages(artifact)) if (page.composition?.blocks.some(b=>b.source.startsWith('semanticComponent.'))) issues.push('An exact-copy brief cannot introduce new component labels; bind only approved page copy.');
  }
  return issues;
}


/** Exact-copy briefs cannot acquire extra diagram labels during generation or repair. */
export function enforceBriefScope(artifact:SimpleArtifact,brief:string):SimpleArtifact {
  let clean=structuredClone(artifact);
  if((clean.type==='carousel'||clean.type==='presentation')&&!pageMarkersAllowed(brief)){
    clean=withArtifactPages(clean,artifactPages(clean).map(page=>page.composition?.responsive?{...page,composition:{...page.composition,responsive:{...page.composition.responsive,pageMarker:false}}}:page));
  }
  if(representationCopyPolicy(brief).sentenceOnly || /avoid extra text|no extra (?:text|copy)/i.test(brief)) {
    if(clean.type==='story'||clean.type==='post'||clean.type==='poster'){if(!clean.composition){delete clean.visualContent;delete clean.semanticComponent;delete clean.eyebrow;}}
    if(clean.type==='carousel')for(const slide of clean.slides){if(!slide.composition){delete slide.visualContent;delete slide.semanticComponent;delete slide.eyebrow;}}
  }
  return clean;
}

/** A verified pass always outranks a failed repair, even when subjective scores fluctuate. */
export function repairOutcomeMerit(report: {pass:boolean;scores:Record<string,number>;issues:string[]}) {
  return (report.pass ? 100 : 0) + Object.values(report.scores).reduce((n,v)=>n+v,0) - report.issues.length*2;
}
