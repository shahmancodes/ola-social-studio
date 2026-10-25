import { z } from 'zod';
import type { CopyPage, CompositionPlan } from './composition';
import type { VisualFormat } from './responsive-layout';

export const DESIGN_RECIPE_IDS=['penpot-event-card','apple-split-image','apple-image-cover','apple-triptych','tahta-lead','tahta-stats','tahta-compare','tahta-timeline']as const;
export const DesignRecipeSchema=z.object({version:z.literal(1),id:z.enum(DESIGN_RECIPE_IDS)}).strict();
export type DesignRecipe=z.infer<typeof DesignRecipeSchema>;
export function recipeCredit(id:DesignRecipe['id']){const r=DESIGN_RECIPES.find(r=>r.id===id)!;return {id:r.id,name:r.name,author:r.author,source:r.source,license:r.license,licenseUrl:r.license==='CC BY 4.0'?'https://creativecommons.org/licenses/by/4.0/':r.id.startsWith('apple-')?'https://github.com/slidevjs/themes/blob/6bb2889af4c66c1fbab4c1beb2e8d962a3b55648/LICENSE':'https://github.com/zcag/tahta/blob/39e944003cefae8a38437adcfeea7cc457edfdff/LICENSE',modifications:'Native Ola geometry, brand typography, responsive format adaptations, measured fitting and image containment.'};}
/** Native adaptations of reviewed source layouts. Asset packs, sample copy and source fonts are not imported. */
export const DESIGN_RECIPES=[
 {id:'penpot-event-card',name:'Illustration + information card',family:'asymmetric-editorial',needs:'One supplied image; title, support and optional action in a bordered information panel.',source:'https://github.com/penpot/penpot-files/blob/be9b1c33ff7546f2a5246b4c52a96f1183c2fe35/community-covers.penpot',author:'Systxema / Penpot community',license:'CC BY 4.0'},
 {id:'apple-split-image',name:'Image + editorial split',family:'asymmetric-editorial',needs:'One supplied image; adjacent copy and contained image on Poster/Carousel, vertical reading order on Story.',source:'https://github.com/slidevjs/themes/blob/6bb2889af4c66c1fbab4c1beb2e8d962a3b55648/packages/theme-apple-basic/layouts/intro-image-right.vue',author:'Jeremy Meissner / Slidev.js Team',license:'MIT'},
 {id:'apple-image-cover',name:'Image-led title cover',family:'image-led',needs:'One supplied image; large contained image before a compact title/copy group. No text over an image that must remain uncropped.',source:'https://github.com/slidevjs/themes/blob/6bb2889af4c66c1fbab4c1beb2e8d962a3b55648/packages/theme-apple-basic/layouts/intro-image.vue',author:'Jeremy Meissner / Slidev.js Team',license:'MIT'},
 {id:'apple-triptych',name:'Asymmetric image triptych',family:'image-led',needs:'Exactly three distinct supplied image IDs: assetId plus two supportingAssetIds. One large image, two smaller images; no semantic component.',source:'https://github.com/slidevjs/themes/blob/6bb2889af4c66c1fbab4c1beb2e8d962a3b55648/packages/theme-apple-basic/layouts/3-images.vue',author:'Jeremy Meissner / Slidev.js Team',license:'MIT'},
 {id:'tahta-lead',name:'Low-anchor editorial opener',family:'oversized-typography',needs:'A bold left-aligned title anchored low in the safe content frame, compact support/action. Existing diagrams remain present when required.',source:'https://github.com/zcag/tahta/blob/39e944003cefae8a38437adcfeea7cc457edfdff/packages/theme/layouts/lead.vue',author:'Çağdaş Salur',license:'MIT'},
 {id:'tahta-stats',name:'Three-number evidence panel',family:'diagram-led',needs:'Existing barChart or metricSpotlight with 2–4 verified numeric items; native hero numbers with labels, no invented metrics.',source:'https://github.com/zcag/tahta/blob/39e944003cefae8a38437adcfeea7cc457edfdff/packages/theme/layouts/stats.vue',author:'Çağdaş Salur',license:'MIT'},
 {id:'tahta-compare',name:'Before / after evidence table',family:'comparison',needs:'Existing semanticComponent comparison with named left/right columns and paired label/detail rows. Never reinterpret unrelated prose as comparable data.',source:'https://github.com/zcag/tahta/blob/39e944003cefae8a38437adcfeea7cc457edfdff/packages/theme/layouts/compare.vue',author:'Çağdaş Salur',license:'MIT'},
 {id:'tahta-timeline',name:'Milestone / process timeline',family:'diagram-led',needs:'Existing timeline, process visualContent, or exact separator-delimited stages via bodyMode sequence. Show supplied dates only; undated stages have no invented dates.',source:'https://github.com/zcag/tahta/blob/39e944003cefae8a38437adcfeea7cc457edfdff/packages/theme/layouts/timeline.vue',author:'Çağdaş Salur',license:'MIT'},
]as const;
export function recipeIssues(page:CopyPage,plan:CompositionPlan):string[]{
 const id=plan.recipe?.id;if(!id)return [];
 const issues:string[]=[],spec=DESIGN_RECIPES.find(r=>r.id===id)!;
 if(plan.family!==spec.family)issues.push(`${id} requires family ${spec.family}.`);
 if(!plan.responsive)issues.push('Design recipes require a measured responsive layout.');
 if(plan.responsive?.visual.treatment==='annotated')issues.push('These recipes cannot add image annotations; use a custom annotated composition.');
 if(['penpot-event-card','apple-split-image','apple-image-cover','apple-triptych'].includes(id)&&!page.assetId)issues.push(`${id} requires supplied image artwork.`);
 if(id==='apple-triptych'&&(new Set([page.assetId,...page.supportingAssetIds??[]]).size!==3||page.supportingAssetIds?.length!==2||page.semanticComponent||page.visualContent))issues.push('Triptych requires exactly three distinct images and no additional semantic visual.');
 if(id!=='apple-triptych'&&page.supportingAssetIds?.length)issues.push('Multiple image slots require the triptych recipe.');
 if(id==='tahta-stats'&&(!page.semanticComponent||!['barChart','metricSpotlight'].includes(page.semanticComponent.kind)||page.semanticComponent.items.length<2||page.semanticComponent.items.length>4))issues.push('Stats recipe requires 2–4 existing numeric items in barChart or metricSpotlight.');
 if(id==='tahta-compare'&&page.semanticComponent?.kind!=='comparison')issues.push('Comparison table requires the existing paired comparison component.');
 if(id==='tahta-timeline'&&page.semanticComponent?.kind!=='timeline'&&page.visualContent?.kind!=='process'&&plan.bodyMode!=='sequence')issues.push('Timeline recipe requires existing ordered stages.');
 return issues;
}
export function recipeGuide(){return `Approved design recipes (version 1): ${JSON.stringify(DESIGN_RECIPES.map(({id,name,family,needs})=>({id,name,family,needs})))}. Recipes are optional starting points. Select recipe:{version:1,id} only when it fits the frozen content and intended hierarchy; custom compositions are valid on every alternative and page. Do not add a recipe solely to satisfy a quota. Use the recipe's required family. Do not invent copy, dates, assets, comparison groups or data to qualify. When a recipe constrains the intended communication, choose a source-compatible custom composition; preserve distinct alternatives and purposeful carousel rhythm. Explain custom choices in intent.reason. Story variants reflow inside safe areas, not scaled landscape screenshots. A triptych's three assets must already exist in the frozen page. Prefer distinct recipes across carousel roles; preserve the whole sequence. Prefer the timeline recipe for an ordered explanation; low-anchor lead is primarily a statement opener, not a reason to subordinate a required process. Text-only custom pages should alternate full-width and split compositions with substantial supporting-copy surfaces, not the same small text-card stack. Recipe fields store references, never another copy value.`;}

export function recipeProfile(id:DesignRecipe['id'],format:VisualFormat){
 const story=format==='story';
 const profiles={
  'penpot-event-card':{columns:!story,mirror:true,anchor:'center',title:76,body:31,weight:.53,order:['eyebrow','artwork','title','body','cta','credit'],panel:true},
  'apple-split-image':{columns:!story,mirror:false,anchor:'center',title:88,body:34,weight:.54,order:['eyebrow','title','body','artwork','cta','credit']},
  'apple-image-cover':{columns:false,mirror:false,anchor:'center',title:88,body:32,weight:.62,order:['eyebrow','artwork','title','body','cta','credit']},
  'apple-triptych':{columns:false,mirror:false,anchor:'center',title:84,body:30,weight:.60,order:['eyebrow','title','artwork','body','cta','credit']},
  'tahta-lead':{columns:false,mirror:false,anchor:'end',title:142,body:34,weight:.32,order:['eyebrow','title','body','artwork','cta','credit']},
  'tahta-stats':{columns:false,mirror:false,anchor:'center',title:84,body:31,weight:.52,order:['eyebrow','title','body','artwork','cta','credit']},
  'tahta-compare':{columns:false,mirror:false,anchor:'start',title:82,body:31,weight:.55,order:['eyebrow','title','body','artwork','cta','credit']},
  'tahta-timeline':{columns:false,mirror:false,anchor:'center',title:94,body:32,weight:.55,order:['eyebrow','title','body','artwork','cta','credit']},
 }as const;
 return profiles[id];
}
