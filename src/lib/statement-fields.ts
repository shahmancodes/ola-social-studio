import type {SimpleArtifact} from './simple-content';
import {artifactPages,withArtifactPages} from './composition';
import {suppliedPairs} from './supplied-pairs';
import {StructuredVisualSchema} from './structured-visual';

/** Realize approved neutral fields before copy freezes, without adding a design stage.
 * A headline projected into a generated hub is not an additional supplied central
 * entity. Preserve genuine maps, custom geometry, styled components and extra data.
 */
export function realizeStatementFields(artifact:SimpleArtifact,brief:string){
 const changes:Array<{page:number;from:'hubSpoke';to:'example';reason:string}>=[];
 if(artifact.type==='article'||!artifact.representationPlan)return{artifact,changes};
 // The brief is authoritative even if its generated representation plan is wrong.
 // Normalize only explicitly neutral fields; conservatively retain requested maps.
 const neutral=/\b(?:complementary|parallel|neutral|independent)\b[^.!?\n]{0,100}\b(?:fields|pairs|information)\b|\b(?:fields|pairs)\b[^.!?\n]{0,100}\b(?:complementary|parallel|neutral|independent)\b/i.test(brief);
 if(!neutral||/\b(?:central(?:[- ]to[- ]peer)?|hub(?:[- ]and[- ]spoke)?|association|relationship[- ]map|connected\s+peer)\b/i.test(brief))return{artifact,changes};
 const pairs=suppliedPairs(brief).map((pair,index)=>({id:index+1,label:brief.slice(pair.label.start,pair.label.end),detail:brief.slice(pair.detail.start,pair.detail.end)}));
 if(!pairs.length)return{artifact,changes};
 const pages=artifactPages(artifact).map((page,index)=>{
  const approved=artifact.representationPlan!.pages[index],component=page.semanticComponent;
  if(approved?.form!=='statement'||approved.supportingCopy!=='structured'||page.composition||page.semanticDesign||page.visualContent||page.assetId||page.supportingAssetIds?.length||page.body.trim())return page;
  if(component?.kind!=='hubSpoke'||component.prompt!==page.title||component.style||component.assetPath)return page;
  if([component.answer,component.leftTitle,component.rightTitle,component.takeaway,component.note,component.unit].some(v=>v?.trim()))return page;
  if(component.items.some(item=>item.tag?.trim()||item.color||[item.value,item.value2,item.value3].some(v=>v!==undefined&&v!==0)||item.group&&item.group!=='source'||item.x!==undefined&&item.x!==50||item.y!==undefined&&item.y!==50||item.radius!==undefined&&item.radius!==14))return page;
  const assigned=pairs.filter(pair=>approved.exactCopyRefs.includes(`pair-${pair.id}-label`)&&approved.exactCopyRefs.includes(`pair-${pair.id}-detail`)).map(({label,detail})=>({label,detail}));
  const items=component.items.map(({label,detail})=>({label,detail}));
  if(!assigned.length||JSON.stringify(items)!==JSON.stringify(assigned))return page;
  const visual=StructuredVisualSchema.safeParse({kind:'example',items});if(!visual.success)return page;
  changes.push({page:index+1,from:'hubSpoke',to:'example',reason:'The approved statement assigns exact complementary fields. Its generated hub repeats the existing headline and supplies no separate central entity, relationship data or custom geometry. Keep the headline and each canonical pair independent for composition.'});
  return {...page,semanticComponent:undefined,visualContent:visual.data};
 });
 return{artifact:changes.length?withArtifactPages(artifact,pages):artifact,changes};
}
