import { z } from 'zod';
import type { SimpleArtifact } from './simple-content';
import { artifactPages, CompositionCandidatesSchema, CompositionPlanSchema, pageCompositionCapabilities, planArtifactCompositions } from './composition';
import {ResponsiveLayoutSchema} from './composition-design';
import {DESIGN_RECIPES} from './design-recipes';

export function compositionRepairTarget(message:string){
 const match=message.match(/Candidate (\d+), page (\d+):/i);
 if(match)return {candidate:Number(match[1])-1,page:Number(match[2])-1};
 try{const issues=JSON.parse(message) as Array<{path?:Array<string|number>}>;const path=issues.find(i=>i.path?.[0]==='candidates'&&typeof i.path[1]==='number'&&i.path[2]==='pages'&&typeof i.path[3]==='number')?.path;if(path)return{candidate:Number(path[1]),page:Number(path[3])};}catch{}
 return undefined;
}

/** Repair a rejected page explicitly; never substitute a fallback or redraft valid pages. */
export async function repairCompositionCandidates(artifact:SimpleArtifact,input:unknown,ask:(prompt:string)=>Promise<string>,record?:(data:unknown)=>void,validate?:(candidate:SimpleArtifact)=>string[],policy:{requireRecipes?:boolean}={}){
  const plans=z.object({candidates:z.array(z.object({pages:z.array(z.unknown())}).strict()).min(2).max(3)}).strict().parse(structuredClone(input)),pages=artifactPages(artifact),tries=new Map<string,number>(),rejections=new Map<string,{error:string;response:string}>();
  const checked=()=>{const parsed=CompositionCandidatesSchema.parse({candidates:plans.candidates.map((c,i)=>({pages:c.pages.map((p,j)=>{try{return CompositionPlanSchema.parse(p);}catch(error){throw new Error(`Candidate ${i+1}, page ${j+1}: ${error instanceof Error?error.message:String(error)}`);}})}))});const result=planArtifactCompositions(artifact,parsed,true,policy.requireRecipes??false);for(const[index,c]of result.candidates.entries()){const issue=validate?.(c)[0];if(issue)throw new Error(`Candidate ${index+1}, ${issue.replace(/^Page /,'page ')}`);}return result;};
  for(let pass=0;pass<6;pass++){
    try{return checked();}catch(error){
      const message=error instanceof Error?error.message:String(error),target=compositionRepairTarget(message);
      if(!target)throw error;
      const {candidate,page}=target,key=`${candidate}:${page}`;
      if(!plans.candidates[candidate]||page>=plans.candidates[candidate].pages.length||!pages[page]||(tries.get(key)??0)>=2)throw error;
      tries.set(key,(tries.get(key)??0)+1);
      if(/preserve directionId/.test(message)&&artifact.artDirection?.directions[candidate]){
        const current=CompositionPlanSchema.parse(plans.candidates[candidate].pages[page]);current.directionId=artifact.artDirection.directions[candidate].id;plans.candidates[candidate].pages[page]=current;
        record?.({candidate:candidate+1,page:page+1,pass,error:message,repair:'Restore canonical direction identity; geometry and copy unchanged.'});continue;
      }
      const capabilities=pageCompositionCapabilities(pages[page]),families=capabilities.families;
      if(!families.length)throw error;
      const form=artifact.representationPlan?.pages[page]?.form;
      const modes=(capabilities.bodyModes as readonly string[]).includes('sequence')&&form==='process'?['sequence'] as const:!pages[page].semanticComponent&&!pages[page].visualContent&&capabilities.sequenceFromSuppliedSeparator&&form==='comparison'?['comparison'] as const:capabilities.bodyModes;
      const treatments=capabilities.plainVisualOnly?['plain'] as const:pages[page].visualContent?.kind==='process'||(modes as readonly string[]).includes('sequence')?['plain','cards','numbered'] as const:pages[page].assetId&&!pages[page].visualContent?['plain','cards','annotated'] as const:['plain','cards'] as const;
      const alternatives=families.map(f=>{
        const ids=capabilities.recipes.filter(id=>DESIGN_RECIPES.find(r=>r.id===id)?.family===f);
        const recipe=ids.length?z.object({version:z.literal(1),id:z.enum(ids as [typeof ids[number],...typeof ids])}):z.never();
        return CompositionPlanSchema.extend({family:z.literal(f),bodyMode:z.enum(modes),responsive:ResponsiveLayoutSchema.extend({visual:ResponsiveLayoutSchema.shape.visual.unwrap().extend({treatment:z.enum(treatments).default('plain'),direction:z.enum(capabilities.visualDirections).default('auto'),textFlow:pages[page].semanticDesign?z.enum(['regions','grouped']).optional():z.never().optional()})}),recipe:recipe.optional()});
      });
      const schema=z.discriminatedUnion('family',alternatives as [typeof alternatives[number],...typeof alternatives]);
      const prompt=`Repair ONLY candidate ${candidate+1}, page ${page+1}. Return ONE composition PLAN, not a deck or candidates array. Other pages remain fixed. The original plan was rejected: ${message}.\nAuthoritative frozen page (copy, images and components must not change): ${JSON.stringify(pages[page])}\nApproved representation: ${form??'statement'}. Allowed capabilities: ${JSON.stringify(capabilities)}. bodyMode controls SOURCE COPY SEGMENTATION, not the kind of visual. Existing semanticComponent/visualContent already owns its labels: use bodyMode text and retain that visual, never rebuild it from supporting prose. A bare separator-delimited approved process requires bodyMode sequence; a bare separator-delimited comparison requires bodyMode comparison. ${capabilities.plainVisualOnly?'This page has no image, diagram or ordered stages. Use bodyMode text, responsive.visual treatment plain, direction auto and no annotations. Do not choose an image, diagram, comparison or timeline.':''}\nRetain the candidate’s communication idea. Any source-compatible family is allowed, including one used by another alternative. If the defect is identical alternative plans, change the actual hierarchy or geometry rather than only renaming the direction.\nRejected page plan: ${JSON.stringify(plans.candidates[candidate].pages[page])}\nReturn JSON matching ${JSON.stringify(z.toJSONSchema(schema))}.`;
      const rejected=rejections.get(key),raw=await ask(prompt+(rejected?`\nYour last replacement failed its source-specific schema: ${rejected.error}. Correct that replacement. Family and recipe must belong to the SAME schema branch. Rejected response: ${rejected.response}`:''));
      try{
        const replacement=schema.parse(JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,'')));
        replacement.directionId=artifact.artDirection?.directions[candidate]?.id??(plans.candidates[candidate].pages[page] as {directionId?:string}).directionId;
        plans.candidates[candidate].pages[page]=replacement;rejections.delete(key);
        record?.({candidate:candidate+1,page:page+1,pass,error:message,replacement});
      }catch(rejected){
        const error=rejected instanceof Error?rejected.message:String(rejected);rejections.set(key,{error,response:raw});
        record?.({candidate:candidate+1,page:page+1,pass,rejected:error});
        if((tries.get(key)??0)>=2)throw rejected;
      }
    }
  }
  return checked();
}
