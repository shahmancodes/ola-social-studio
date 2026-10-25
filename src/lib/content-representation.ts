import { z } from 'zod';
import type { SimpleArtifact } from './simple-content';
import type { ContentBrand } from './content-brand';
import {SemanticComponentSchema} from './schemas';
import {suppliedPairs} from './supplied-pairs';
import {supportingCopyBudgetGuide} from './supporting-copy-budget';
import {artifactPages,resolvedComponent,resolvedVisualContent} from './composition';

export const REPRESENTATIONS = ['statement', 'image-story', 'process', 'comparison', 'checklist', 'annotated-example', 'demonstration', 'data-explanation', 'relationship-map', 'prose'] as const;
const PageRepresentation = z.object({
  page: z.number().int().min(1).max(20),
  role: z.enum(['hook', 'context', 'explanation', 'example', 'takeaway', 'close']),
  goal: z.string().min(1).max(350),
  form: z.enum(REPRESENTATIONS),
  reason: z.string().min(1).max(500),
  supportingCopy: z.enum(['none','supplied','generate','structured']).default('generate'),
  contentNeeds: z.array(z.string().min(1).max(300)).min(1).max(6),
  assetIds: z.array(z.string().min(1).max(120)).max(4),
  evidenceRefs: z.array(z.union([z.number().int().min(0),z.literal('brief')])).max(8),
  exactCopyRefs: z.array(z.string().min(1).max(120)).max(20),
}).strict();
/** Describes content and its representation, never layout coordinates or competing publishable copy. */
export const RepresentationPlanSchema = z.object({
  version: z.literal(1),
  message: z.string().min(1).max(400),
  sequenceReason: z.string().min(1).max(600),
  pages: z.array(PageRepresentation).min(1).max(20),
}).strict();
export type RepresentationPlan = z.infer<typeof RepresentationPlanSchema>;
export type RepresentationInput = { creativeDirection?: import("./art-direction").ArtDirection;
  assetContext?:string;
  type: 'poster' | 'story' | 'post' | 'carousel' | 'presentation' | 'article';
  brief: string;
  count?: number | 'auto';
  brand: Pick<ContentBrand, 'name' | 'audience' | 'voice' | 'description' | 'assets' | 'designSystem'>;
  sources: Array<{title: string; url: string; claim: string}>;
};

/** Offsets point into the authoritative brief; plan metadata does not store another editable copy value. */
export function representationCopyPolicy(brief: string) {
  const refs: Array<{id:string;start:number;end:number;page?:number|'last';scope?:'image-pages'}> = [];
  const quote = `(?:"([^"\u201d]+)"|“([^”]+)”|'([^']+)')`;
  for (const [label,id] of [['Headline','title'],['Supporting line','body'],['(?:CTA|closing line)','cta'],['(?:small |image )?credit','credit'],['(?:exact )?(?:small )?label','eyebrow']] as const) {
    const match=brief.match(new RegExp(`\\b${label}(?:\\s*:\\s*|\\s+)${quote}`,'i'));
    if(!match)continue;
    const value=match[1]??match[2]??match[3],start=match.index!+match[0].length-1-value.length;
    const context=brief.slice(Math.max(0,match.index!-100),match.index!+match[0].length);
    const numbered=context.match(/(?:page|slide)\s+(\d+)/i),last=/(?:final|last)\s+(?:page|slide)/i.test(context);
    refs.push({id,start,end:start+value.length,...(id==='cta'&&(last||numbered)?{page:last?'last' as const:Number(numbered![1])}:{}),...(id==='credit'&&/(?:every|each) page (?:where (?:the )?image (?:appears|is used)|that uses it)|wherever (?:(?:it|(?:the )?(?:image|photograph)) (?:appears|is (?:shown|used))|shown)/i.test(brief)?{scope:'image-pages' as const}:{})});
  }
  for(const [i,pair]of suppliedPairs(brief).entries())for(const role of ['label','detail'] as const)refs.push({id:`pair-${i+1}-${role}`,...pair[role]});
  const header=/headlines\s*,?\s+in\s+order(?:\s*,?\s*are)?\s*:/i.exec(brief);
  if(header){
    const list=/\s*(\d+)\.\s*["“]([^"”]+)["”]\s*[;,]?/y;list.lastIndex=header.index+header[0].length;
    for(let match; (match=list.exec(brief));){const start=match.index+match[0].indexOf(match[2]);refs.push({id:`page-${match[1]}-title`,page:Number(match[1]),start,end:start+match[2].length});}
  }
  const sentenceOnly=/\b(?:one|1|a single)\s+(?:(?:concise|short|practical|brief)[,\s]+)*supporting\s+sentence\b/i.test(brief);
  const restricted=sentenceOnly||/(?:no|avoid|without)\s+(?:other visible|extra|additional)\s+(?:visible\s+)?(?:text|copy|prose)|(?:generate|add|write|include) no (?:other|additional|extra) (?:visible )?(?:text|copy|prose)|exact(?:ly)?\s+(?:these\s+)?(?:three|\d+)\s+copy blocks|(?:keep|stick)\s+to\s+(?:the\s+)?(?:supplied|provided|exact)\s+copy/i.test(brief);
  const action=brief.match(/\b(?:on|in)\s+(?:slide|page)\s+(\d+)\s+(?:add|include)\s*["“]([^"”]+)["”]/i),reverse=brief.match(/\b(?:add|include)\s*["“]([^"”]+)["”]\s+(?:to|on)\s+(?:slide|page)\s+(\d+)/i);
  const match=action??reverse,value=action?.[2]??reverse?.[1],start=match&&value?match.index!+match[0].indexOf(value):undefined;
  const cta=refs.find(r=>r.id==='cta'&&r.page);
  const closingAction=start!==undefined&&value?{page:Number(action?.[1]??reverse![2]),start,end:start+value.length}:cta?{page:cta.page!,start:cta.start,end:cta.end}:undefined;
  return {additionalCopy:!restricted,requiredGeneratedCopy:sentenceOnly?'one supporting sentence on EVERY page; use the optional cta field for an explicitly requested closing action':'only the fields explicitly requested by the brief, or flexible copy when additionalCopy is true',sentenceOnly,closingAction,exactCopyRefs:refs};
}

function assignedCopyPage(ref:ReturnType<typeof representationCopyPolicy>['exactCopyRefs'][number],plan:RepresentationPlan){
  return ref.page==='last'?plan.pages.length:ref.page??plan.pages.find(p=>p.exactCopyRefs.includes(ref.id))?.page??1;
}

/** Bind supplied wording from the authoritative brief, independently of generated prose. */
export function bindSuppliedCopy<T extends SimpleArtifact>(artifact:T,plan:RepresentationPlan,brief:string):T {
  const result=structuredClone(artifact),pages=result.type==='article'?result.sections:result.type==='carousel'||result.type==='presentation'?result.slides:[result];
  for(const [index,page]of pages.entries())if(['image-story','annotated-example'].includes(plan.pages[index]?.form)&&plan.pages[index].assetIds.length){
    (page as Record<string,unknown>).assetId=plan.pages[index].assetIds[0];
    if(plan.pages[index].assetIds.length>=3)(page as Record<string,unknown>).supportingAssetIds=plan.pages[index].assetIds.slice(1,3);
  }
  for(const ref of representationCopyPolicy(brief).exactCopyRefs)for(const [index,page]of pages.entries()){
    if(ref.id.startsWith('pair-'))continue; // The writer must retain these as separate canonical item fields.
    if(ref.scope==='image-pages'?!('assetId'in page&&page.assetId):assignedCopyPage(ref,plan)!==index+1)continue;
    const field=ref.id.startsWith('page-')||ref.id==='title'?('headline'in page?'headline':'title'):ref.id==='body'?('subline'in page?'subline':'body'):ref.id;
    (page as Record<string,unknown>)[field]=brief.slice(ref.start,ref.end);
  }
  const policy=representationCopyPolicy(brief);
  for(const ref of policy.exactCopyRefs.filter(r=>r.id==='cta'))for(const [index,page]of pages.entries())if(index+1!==assignedCopyPage(ref,plan)&&'cta'in page&&page.cta===brief.slice(ref.start,ref.end))delete (page as Record<string,unknown>).cta;
  result.representationPlan=plan;
  return result;
}

export function suppliedCopyIssues(artifact:SimpleArtifact,brief:string,plan=artifact.representationPlan){
  const pages=artifact.type==='article'?artifact.sections:artifact.type==='carousel'||artifact.type==='presentation'?artifact.slides:[artifact],issues:string[]=[];
  for(const ref of representationCopyPolicy(brief).exactCopyRefs)for(const [index,page]of pages.entries()){
    if(ref.id.startsWith('pair-'))continue;
    const target=ref.page==='last'?pages.length:ref.page??plan?.pages.find(p=>p.exactCopyRefs.includes(ref.id))?.page??1;
    const field=ref.id.startsWith('page-')||ref.id==='title'?('headline'in page?'headline':'title'):ref.id==='body'?('subline'in page?'subline':'body'):ref.id;
    const value=(page as Record<string,unknown>)[field],expected=brief.slice(ref.start,ref.end);
    if(ref.scope==='image-pages'?!('assetId'in page&&page.assetId):target!==index+1){if(ref.id==='cta'&&value===expected)issues.push(`Page ${index+1}: closing CTA is duplicated outside page ${target}.`);continue;}
    if(value!==expected)issues.push(`Page ${index+1}: exact source copy changed: ${ref.id}.`);
  }
  const policy=representationCopyPolicy(brief);
  const pairs=suppliedPairs(brief);
  const items=!pairs.length?[]:artifact.type==='article'?pages.map(page=>page.semanticComponent?.items??[]):artifactPages(artifact).map(page=>[...(resolvedComponent(page)?.items??[]),...(resolvedVisualContent(page)?.items??[])]);
  const required=pairs.map((pair,i)=>{
    const ref=policy.exactCopyRefs.find(r=>r.id===`pair-${i+1}-label`)!,target=plan?assignedCopyPage(ref,plan):1;
    const label=brief.slice(pair.label.start,pair.label.end),detail=brief.slice(pair.detail.start,pair.detail.end);
    return{index:i,label,detail,target};
  });
  const bodies=!pairs.length?[]:artifact.type==='article'?artifact.sections.map(p=>p.body):artifactPages(artifact).map(p=>!p.composition||p.composition.placements.some(v=>v.slot==='body')?p.body:'');
  for(const {index:i,label,detail,target}of required){
    const matches=items.flatMap((row,index)=>row.filter(item=>item.label===label&&item.detail===detail).map(()=>index+1));
    const expected=required.filter(pair=>pair.label===label&&pair.detail===detail).map(pair=>pair.target).sort((a,b)=>a-b);
    if(JSON.stringify(matches.sort((a,b)=>a-b))!==JSON.stringify(expected))issues.push(`Page ${target}: preserve exact pair-${i+1} as one structured item with separate label and detail fields. Do not flatten, join with punctuation, duplicate or exchange the supplied roles.`);
    for(const [page,body]of bodies.entries())if(body.includes(label)&&body.includes(detail)&&matches.includes(page+1))issues.push(`Page ${page+1}: pair-${i+1} is duplicated in supporting prose and structured fields. Keep one visible canonical representation.`);
  }
  return issues;
}

export function representationPlanIssues(plan: RepresentationPlan, input: RepresentationInput) {
  const issues: string[]=[];
  const count=plan.pages.length, multi=['carousel','presentation','article'].includes(input.type);
  if(!multi&&count!==1)issues.push('A single-page format requires exactly one representation.');
  if(typeof input.count==='number'&&count!==input.count)issues.push(`Expected ${input.count} planned pages.`);
  if(input.type==='carousel'&&(count<3||count>9)||input.type==='presentation'&&(count<3||count>20))issues.push('Planned page count is outside format limits.');
  const assets=new Map(input.brand.assets.map(a=>[a.id,a]));
  const policy=representationCopyPolicy(input.brief),refs=new Set(policy.exactCopyRefs.map(r=>r.id));
  const used=new Set<string>();
  for(const [i,p]of plan.pages.entries()) {
    if(p.page!==i+1)issues.push('Representation pages must be sequential and ordered.');
    for(const id of p.assetIds)if(!assets.has(id))issues.push(`Page ${p.page}: asset is outside the supplied shortlist: ${id}`);
    for(const index of p.evidenceRefs)if(index!=='brief'&&!input.sources[index])issues.push(`Page ${p.page}: unknown evidence reference ${index}.`);
    for(const id of p.exactCopyRefs){if(!refs.has(id))issues.push(`Page ${p.page}: unknown exact-copy reference ${id}.`);if(used.has(id))issues.push(`Exact-copy reference is assigned twice: ${id}.`);used.add(id);const ref=policy.exactCopyRefs.find(r=>r.id===id)!;if(ref&&(ref.page==='last'?count:ref.page)&&assignedCopyPage(ref,plan)!==p.page)issues.push(`Exact-copy reference ${id} belongs on page ${assignedCopyPage(ref,plan)}.`);}
    if(['image-story','annotated-example'].includes(p.form)&&!p.assetIds.some(id=>assets.get(id)?.mediaType.startsWith('image/')))issues.push(`Page ${p.page}: this representation requires a supplied image.`);
    if(p.form==='data-explanation'&&!p.evidenceRefs.length)issues.push(`Page ${p.page}: a data representation needs verified evidence; use a nonnumeric representation for unsupported data.`);
    if(input.type==='article'&&['image-story','annotated-example'].includes(p.form))issues.push('Article sections currently support prose and semantic components, not bound image fields; choose a supported representation.');
    if(p.exactCopyRefs.includes('body')&&/ → | ⟶ /.test(input.brief.slice(policy.exactCopyRefs.find(r=>r.id==='body')?.start??0,policy.exactCopyRefs.find(r=>r.id==='body')?.end??0))&&p.form!=='process')issues.push(`Page ${p.page}: supplied connected stages require a process representation.`);
    if(p.form==='prose'&&input.type!=='article')issues.push('Prose is an article representation; use a purposeful visual representation for visual formats.');
    if(policy.sentenceOnly&&p.supportingCopy!=='generate')issues.push(`Page ${p.page}: the brief explicitly requires a generated supporting sentence; no-extra-copy does not cancel that requirement.`);
    if(policy.sentenceOnly&&!['statement','image-story'].includes(p.form))issues.push(`Page ${p.page}: the one-sentence brief does not permit extra component labels.`);
  }
  for(const ref of refs)if(!used.has(ref))issues.push(`Missing exact-copy assignment: ${ref}.`);
  for(const [i]of suppliedPairs(input.brief).entries()){
    const label=policy.exactCopyRefs.find(r=>r.id===`pair-${i+1}-label`)!,detail=policy.exactCopyRefs.find(r=>r.id===`pair-${i+1}-detail`)!;
    if(assignedCopyPage(label,plan)!==assignedCopyPage(detail,plan))issues.push(`Exact pair-${i+1} label and detail must be assigned to the same page.`);
  }
  return issues;
}

export async function planContentRepresentation(input:RepresentationInput, ask:(prompt:string)=>Promise<string>, onRejected?:(error:string,pass:number)=>void) {
  const policy=representationCopyPolicy(input.brief);
  const images=input.brand.assets.filter(a=>a.mediaType.startsWith('image/')),ids=images.map(a=>a.id);
  const forms=REPRESENTATIONS.filter(f=>(input.type==='article'?f!=='image-story'&&f!=='annotated-example':f!=='prose')&&(images.length||f!=='image-story'&&f!=='annotated-example'));
  const schema=RepresentationPlanSchema.extend({pages:z.array(PageRepresentation.extend({form:z.enum(forms as [typeof forms[number],...typeof forms]),assetIds:z.array(ids.length?z.enum(ids as [string,...string[]]):z.never()).max(4)})).min(1).max(20)});
  const prompt=`Act as Ola's visual editor BEFORE copy drafting. Plan what the content should communicate and how to REPRESENT it. Do not choose a composition family, geometry, fonts or final publishable wording. Choose a representation because it makes the message understandable, not merely to decorate it. Plan a complete ordered narrative for multi-page content. Use statement for a single message; image-story for a prominent existing image; process for ordered stages; comparison for two actual alternatives; checklist for actions; annotated-example for labeled supplied imagery; demonstration for an allowed worked example; data-explanation only for supplied verified evidence; relationship-map for explicit connections; prose for an article section. Do not invent statistics, product behavior, screenshots, assets, claims or extra copy forbidden by the brief. Exact-copy references must each be assigned ONCE, in their required page order. Respect the page hints, including last-page CTAs; image-page credit references authorize repeating the same credit wherever the image appears. A literal arrow-separated supporting line is an ordered process, not a relationship map. Under restricted-copy briefs, represent existing words without adding labels or examples; process may redistribute an exact arrow-separated source line. One-sentence-per-slide briefs explicitly AUTHORIZE and REQUIRE generating one practical supporting sentence on EVERY slide. additionalCopy=false forbids unrequested content, NOT this requested sentence or an explicitly requested closing action. supportingCopy must be generate for these briefs. Never invent a conflict, ask for approval, or remove requested supporting sentences. Use supplied when the supporting line is exact quoted copy, structured for generated component content, none only when supporting content is neither requested nor useful. One-sentence briefs should normally use statements, with visual hierarchy decided later. For flexible briefs, specify concrete contentNeeds for meaningful structured components rather than drafting generic paragraphs. Explicit quoted label/detail pairs are canonical structured fields: assign both pair-N-label and pair-N-detail to the same page. Complementary fields do not imply an ordered process or mutually exclusive alternatives. Each contentNeed is an instruction for the writer, NOT final visible copy. For articles, pages means ordered sections, and demonstration may be a worked prose example. Return ONLY JSON matching ${JSON.stringify(z.toJSONSchema(schema))}.\nFormat: ${input.type}; requested count: ${input.count??'auto within format limits'}.\nAuthoritative brief: ${JSON.stringify(input.brief)}\n${supportingCopyBudgetGuide(input.brief)}\nCreative direction (guide the communication idea; exact supplied copy and required representations take priority): ${JSON.stringify(input.creativeDirection??null)}\nCopy policy and source ranges: ${JSON.stringify(policy)}\nCreative directions: ${JSON.stringify(input.creativeDirection??null)}\nBrand: ${JSON.stringify({name:input.brand.name,audience:input.brand.audience,voice:input.brand.voice,description:input.brand.description,designSystem:input.brand.designSystem})}\nAvailable image assets: ${JSON.stringify(input.brand.assets.map(a=>({id:a.id,name:a.name,mediaType:a.mediaType})))}\nVerified evidence (zero-based references; use "brief" for data explicitly supplied by the user): ${JSON.stringify(input.sources)}`;
  const constrainedPrompt=prompt+`\nActual asset availability: ${input.assetContext??'Use supplied artwork only.'}\nOnly the artwork IDs in the schema may be selected. Brand logo and font IDs are not artwork. If assetIds has no allowed values, use an empty array. Visual formats cannot use prose as a substitute for a supported representation. Use an approved commissioned asset prominently when it fulfills the requested communication goal; do not request an image and then silently ignore it. Asset acquisition is complete: failed requests require an existing-asset or native geometry fallback. Never invent an unavailable image or replace a required supplied image.`;
  let error='';let rejected:unknown;
  for(let pass=0;pass<2;pass++)try{
    const raw=await ask(constrainedPrompt+(error?`\nPrevious plan rejected: ${error}. Correct only the rejected choices without weakening the brief. Rejected plan: ${JSON.stringify(rejected)}`:''));
    rejected=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));const plan=schema.parse(rejected);
    const issues=representationPlanIssues(plan,input);if(issues.length)throw new Error(issues.join(' '));return plan;
  }catch(e){error=e instanceof Error?e.message:String(e);onRejected?.(error,pass);}
  throw new Error(`Representation planning failed: ${error}`);
}

export function representationDraftGuide(plan:RepresentationPlan,brief:string) {
  return `Approved content representation plan (before final copy): ${JSON.stringify(plan)}. Copy policy: ${JSON.stringify(representationCopyPolicy(brief))}. ${supportingCopyBudgetGuide(brief)} Produce EXACTLY ${plan.pages.length} ${plan.pages.length===1?'page':'pages/sections'} in this order. Write the final copy to realize each goal and contentNeed. Preserve supplied exact copy. Explicit pair-N-label and pair-N-detail references must become separate label and detail fields on the same native item, preserving their roles, exact text and order. Never flatten a supplied pair into body prose or a single label joined by a dash. Leave body/subline empty when it would duplicate the pairs. Each form has a concrete render contract: process requires visualContent.kind=process, semanticComponent.kind=processSteps/timeline/processLoop, or exact separator-delimited supporting copy; comparison requires visualContent.kind=comparison or semanticComponent.kind=comparison; checklist requires visualContent.kind=checklist or semanticComponent.kind=checklist; relationship-map requires semanticComponent.kind=relatedPair, hubSpoke, decisionTree, venn, swimlane, proportionalFlow, processLoop or marketSizing (a paragraph, checklist, timeline or generic grid does not satisfy a relationship map); data-explanation requires an actual supported chart component with supplied values, not a paragraph. Use barChart when the brief asks for bars on a shared scale. Image-story requires an approved assetId. For a statement with neutral complementary label/detail fields, visualContent.kind=example preserves up to four pairs without task marks, numbered steps or implied exclusive choices. Approved statement pairs whose generated hub merely repeats the headline are realized as these independent fields before copy freezes, provided every exact role is preserved and there is no separate central entity, custom geometry or data. Do not infer a relationship-map merely because structured copy has several fields. For hubSpoke, prompt must name an authorized central idea (which may be the supplied headline); a blank prompt is invalid. If no authorized central idea fits, choose a representation whose actual relationship is supported by the brief instead of inventing a hub, set overlap, cycle or visible copy. A representation name is an instruction to populate the corresponding structured field, never merely a description of body copy. For flexible copy, use existing visualContent {kind:process|comparison|checklist|example,items:[{label,detail}]} (1–4 items, comparison exactly 2), or supported semanticComponent, when the plan calls for structured content; leave body/subline empty when it would repeat those labels. For articles, use section prose or the existing semanticComponent. Keep image assets bound to the selected supplied IDs. When the approved page has three supplied images, set assetId to the first and supportingAssetIds to the other two for a native triptych; never duplicate images to fill slots. A process may instead use an exact literal separator in body/subline so composition can bind each stage once. Do not manufacture separators by splitting a normal sentence. A demonstration must contain a concrete worked example, not advice to create one. additionalCopy=false forbids unrequested labels/examples; it NEVER prohibits a supporting sentence or closing action explicitly requested by the brief. When sentenceOnly=true, body MUST contain one concise practical supporting sentence on EVERY page, including the cover and close; the final requested CTA is additional authorized copy: put it in the optional cta field, not in body, so it follows the supporting sentence. This requirement takes precedence over any contrary contentNeed in the plan. Do not output composition metadata yet: geometry follows copy approval.`;
}

export function representationRealizationIssues(artifact:SimpleArtifact,plan:RepresentationPlan,phase:'draft'|'composed'='draft',brief='') {
  const pages=artifact.type==='article'?artifact.sections:artifact.type==='carousel'||artifact.type==='presentation'?artifact.slides:[artifact];
  const issues:string[]=suppliedCopyIssues(artifact,brief,plan);
  if(pages.length!==plan.pages.length)return ['Draft changed the approved representation page count.'];
  for(const [i,page]of pages.entries()) {
    const p=plan.pages[i],body='body'in page?page.body:'subline'in page?page.subline:'';
    const policy=representationCopyPolicy(brief);
    if(policy.closingAction&&(policy.closingAction.page==='last'?pages.length:policy.closingAction.page)===i+1){const action=brief.slice(policy.closingAction.start,policy.closingAction.end),cta='cta'in page?page.cta:undefined;
      if(![body,cta??''].some(t=>t.includes(action)))issues.push(`Page ${i+1}: the requested closing action is missing or changed.`);
      if(phase==='draft'&&policy.sentenceOnly&&['carousel','presentation'].includes(artifact.type)&&cta!==action)issues.push(`Page ${i+1}: put the exact requested closing action in cta, separately from the supporting sentence.`);
    }
    if(policy.sentenceOnly){const suppliedQuotes=[...brief.matchAll(/["“]([^"”]+)["”]/g)].map(m=>m[1]);const withoutAction=suppliedQuotes.reduce((text,quote)=>text.split(quote).join(''),body).replace(/[\s.!?,;:]+/g,'');if(!withoutAction)issues.push(`Page ${i+1}: the brief requires one generated supporting sentence; the headline or closing action is not a substitute.`);}
    const component=page.semanticComponent,visual='visualContent'in page?page.visualContent:undefined;
    const assetId='assetId'in page?page.assetId:undefined;
    const imageIds=[assetId,...('supportingAssetIds'in page?page.supportingAssetIds??[]:[])].filter(Boolean);
    if(imageIds.some(id=>!p.assetIds.includes(id!)))issues.push(`Page ${i+1}: draft changed the approved image set.`);
    if(p.assetIds.length>=3&&p.assetIds.some(id=>!imageIds.includes(id)))issues.push(`Page ${i+1}: draft omitted an approved image from the multi-image representation.`);
    if(!policy.additionalCopy){
      if('eyebrow'in page&&page.eyebrow&&!policy.exactCopyRefs.some(r=>r.id==='eyebrow'))issues.push(`Page ${i+1}: restricted copy cannot acquire an extra eyebrow.`);
      const allowed=policy.exactCopyRefs.flatMap(r=>{const value=brief.slice(r.start,r.end);return [value,...value.split(/ → | ⟶ |\n| \| |; /).map(v=>v.trim())];});
      const labels=[...(visual?.items.flatMap(item=>[item.label,item.detail])??[]),...(component?[component.prompt,component.answer,component.leftTitle,component.rightTitle,component.note,component.takeaway,...component.items.flatMap(item=>[item.label,item.detail,item.tag])]:[])].filter((v):v is string=>Boolean(v));
      for(const label of labels)if(!allowed.includes(label)&&!(phase==='composed'&&label.startsWith('@copy:')))issues.push(`Page ${i+1}: restricted copy acquired an unauthorized component label.`);
    }

    if(['image-story','annotated-example'].includes(p.form)&&(!assetId||!p.assetIds.includes(assetId)))issues.push(`Page ${i+1}: planned supplied image was not used.`);
    if(p.assetIds.length&&assetId&&!p.assetIds.includes(assetId))issues.push(`Page ${i+1}: draft changed the approved image.`);
    if('semanticDesign' in page&&page.semanticDesign){const rel=(page.semanticDesign as import('./semantic-design').SemanticDesign).spec.relationship;if(p.form==='process'&&!['sequence','cycle'].includes(rel))issues.push(`Page ${i+1}: designed process must remain sequential.`);if(p.form==='comparison'&&rel!=='comparison')issues.push(`Page ${i+1}: designed comparison must retain two actual alternatives.`);}
    const separated=/ → | ⟶ |\n| \| |; /.test(body);
    if(artifact.type!=='article'&&phase==='draft'&&p.form==='process'&&!component&&!visual&&separated){
      const separator=[' → ',' ⟶ ','\n',' | ','; '].find(s=>body.includes(s))!,parts=body.split(separator).map(label=>label.trim());
      if(parts.length>8||!SemanticComponentSchema.safeParse({kind:'timeline',items:parts.map(label=>({label}))}).success)issues.push(`Page ${i+1}: a bare process line contains unsupported stage copy. Keep the short stage labels separate from the supporting paragraph: use visualContent kind process with label/detail items, or a timeline component, and put the explanation in body. Preserve supplied exact words; never truncate a required stage.`);
    }
    const matches=p.form==='process'?(visual?.kind==='process'||component?.kind==='processSteps'||component?.kind==='timeline'||component?.kind==='processLoop'||phase==='draft'&&separated):p.form==='comparison'?(visual?.kind==='comparison'||component?.kind==='comparison'||phase==='draft'&&separated):p.form==='checklist'?(visual?.kind==='checklist'||component?.kind==='checklist'):p.form==='relationship-map'?Boolean(component&&['relatedPair','hubSpoke','decisionTree','venn','swimlane','proportionalFlow','processLoop','marketSizing'].includes(component.kind)):p.form==='data-explanation'?Boolean(component&&['metricGrid','bulletChart','barChart','lineChart','stackedBar','scatterPlot','histogram','pieChart','conversionFunnel','waterfall','calendarHeatmap','metricSpotlight','scoreBreakdown','marketSizing','proportionalFlow'].includes(component.kind)):p.form==='annotated-example'?(component?.kind==='annotatedExample'||component?.kind==='labeledVisual'||'composition'in page&&page.composition?.responsive?.visual.treatment==='annotated'):true;
    if(!matches)issues.push(`Page ${i+1}: ${p.form} was reduced to unsupported prose or an unrelated component.`);
  }
  return issues;
}
