import { representationCopyPolicy } from '../lib/content-representation';
import type { SharedInput } from './types';
import type { ToolSpec } from './canva';

type Obj=Record<string,unknown>;
const object=(value:unknown):Obj=>value&&typeof value==='object'?value as Obj:{};
export const expectedCanvas=(input:SharedInput)=>input.format==='carousel'?{count:input.slideCount,width:1080,height:1350}:input.format==='poster'?{count:1,width:1240,height:1754}:{count:1,width:1080,height:1920};

/** Instagram Post generation is single-page. Presentations support ordered pages. */
export function brandedGenerationArgs(spec:ToolSpec,prompt:string,input:SharedInput,uploaded:Array<{id:string;name:string}>) {
  if(input.format!=='carousel')return {query:prompt,design_type:input.format==='poster'?'poster':'your_story',asset_ids:uploaded.map(a=>a.id)};
  const properties=object(spec.inputSchema.properties),types=object(properties.design_type).enum;
  if(!Array.isArray(types)||!types.includes('presentation')||!properties.length)throw new Error('This Canva server cannot generate multi-page presentations; carousel generation is unavailable.');
  const titles=representationCopyPolicy(input.brief).exactCopyRefs.filter(r=>r.id.startsWith('page-')).map(r=>input.brief.slice(r.start,r.end));
  const slidePlan=Array.from({length:input.slideCount},(_,index)=>`Slide ${index+1} — "${titles[index]??`Page ${index+1}`}"\nGoal: Realize page ${index+1} of the authoritative brief in the required order.\nContent and visuals: Use the page-specific supplied copy, directions and assets from the brief. Do not add unrequested headings, facts or numbers.`).join('\n\n');
  return {design_type:'presentation',length:input.slideCount<=5?'short':'balanced',asset_ids:uploaded.map(a=>a.id),query:`Presentation Brief\nCreate EXACTLY ${input.slideCount} pages, one per numbered item below. This is a portrait social carousel, not a landscape talk. No extra cover, agenda, appendix or closing page. The source presentation will be adapted with Canva's native resize to 1080 × 1350. Keep all requested content editable.\nAuthoritative brief, brand context, assets and any assistant plan:\n${prompt}\n\nNarrative Arc\nFollow the supplied page order and finish on page ${input.slideCount}, with no additional pages.\n\nSlide Plan\n${slidePlan}`};
}

/** Validate before mutation; nested deletion and zero-height pseudo-text fail in Canva. */
export function editSafetyIssues(operations:Obj[],transaction:Obj) {
  const text=new Map<string,Obj>();
  for(const item of Array.isArray(transaction.richtexts)?transaction.richtexts:[]) {const value=object(item);if(typeof value.element_id==='string')text.set(value.element_id,value);}
  const issues:string[]=[];
  for(const op of operations){
    const id=typeof op.element_id==='string'?op.element_id:undefined;
    if(op.type==='delete_element'&&id&&id.split('-LB').length>2)issues.push(`Do not delete nested/grouped element ${id}; edit its supported text instead.`);
    if(id&&['replace_text','find_and_replace_text','format_text'].includes(String(op.type))&&text.size){
      const item=text.get(id),container=object(item?.containerElement),dimensions=object(container.dimension);
      if(!item||container.type!=='TEXT'||Number(dimensions.height)<=0||!Array.isArray(item.regions)||!item.regions.length)issues.push(`Text element ${id} is empty or not an editable TEXT box; choose an existing nonempty text element.`);
    }
  }
  return issues;
}
