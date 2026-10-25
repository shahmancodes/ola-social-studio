import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import type { SimpleArtifact } from './simple-content';
import type { ContentBrand } from './content-brand';
import type { GenerationCheckpoint } from './generation-checkpoint';
import { renderModernArtifact } from './modern-content';
import { requiredCopyIssues } from './artifact-repair';
import { CRAFT_REVIEW_STANDARD } from './art-direction';
import { craftInspectionImages } from './visual-inspection';
import { layoutRepetitionFindings } from './layout-review';
import { mobileReadabilityFindings } from './layout-readability';
export async function artifactReviewImages(artifact:SimpleArtifact) {
  const files=artifact.type==='story'||artifact.type==='post'||artifact.type==='poster'?[artifact.imagePath]:artifact.type==='carousel'?artifact.imagePaths:artifact.type==='presentation'?artifact.previewPaths:[];
  return Promise.all((files??[]).filter((f):f is string=>Boolean(f)).map(async file=>`data:image/jpeg;base64,${(await sharp(file).resize({width:700}).jpeg({quality:80}).toBuffer()).toString('base64')}`));
}
export async function selectRenderedCandidates(candidates:SimpleArtifact[],brand:ContentBrand,brief:string,dir:string,ask:(prompt:string,images?:string[])=>Promise<string>,checkpoint?:Pick<GenerationCheckpoint,"step">,references:string[]=[]){
  const successful:Array<{index:number;artifact:SimpleArtifact;images:string[]}>=[];const failures:Array<{index:number;error:string}>=[];
  for(const [index,input]of candidates.entries())try{
    const render = async () => {
      const output=path.join(dir,`candidate-${index+1}`);await fs.mkdir(output,{recursive:true});
      await fs.writeFile(path.join(output,'source.json'),JSON.stringify(input,null,2));
      const artifact=structuredClone(input);const issues=requiredCopyIssues(artifact,brief);if(issues.length)throw new Error(issues.join(' '));
      await renderModernArtifact(artifact,brand,output);
      await fs.writeFile(path.join(output,'source.json'),JSON.stringify(artifact,null,2));
      return artifact;
    };
    const artifact = checkpoint ? await checkpoint.step(`render-candidate-${index+1}`, render) : await render();
    successful.push({index,artifact,images:await artifactReviewImages(artifact)});
  }catch(error){const message=error instanceof Error?error.message:String(error);failures.push({index,error:message});await fs.writeFile(path.join(dir,`candidate-${index+1}`,'failure.json'),JSON.stringify({error:message},null,2));}
  if(!successful.length)throw new Error(`No candidate passed rendering: ${failures.map(f=>`Candidate ${f.index+1}: ${f.error}`).join(' | ')}`);
  let selected=successful[0], reason='Only one candidate passed objective rendering checks.',ready=true,issues:string[]=[];
  const craft=Boolean(selected.artifact.artDirection);
  if(successful.length>1||craft){
    const prompt=`Compare the ACTUAL rendered alternatives for this brief. Images are grouped in this order: ${JSON.stringify(successful.map(c=>({index:c.index,pages:c.images.length})))}. Do not reward unnecessary cards or repeated headline-plus-box layouts. Consistent branding is welcome; purposeful variation must survive in the rendered geometry. Select the strongest complete composition for legibility at the requested use size, purposeful hierarchy, brand fit and visual rhythm. A4 posters use print viewing-distance legibility; the 360px social reading floors apply only to Story, carousel and post. The automatically placed primary logo is the approved asset; a different symbol or wordmark lockup in style references does not alone show asset substitution. Respect exact supplied copy; no demand for extra content. Return ONLY JSON {"index":number,"reason":"specific visual reason"}. Brief: ${brief}. Brand: ${JSON.stringify({name:brand.name,typography:brand.typography,palette:brand.palette,designSystem:brand.designSystem})}`;
    const inspection=craft?await Promise.all(successful.map(c=>craftInspectionImages(c.artifact))):[];
    const extra=craft?` ${CRAFT_REVIEW_STANDARD} You may reject ALL candidates: return the index of the best starting point with ready:false and specific issues requiring refinement. ready:true means the best candidate reaches visual craft 4, not merely the least weak option. Return {index,reason,ready,issues:[up to 8 concrete visible defects]}. After the grouped full-page renders come candidate inspection views in candidate order: ${JSON.stringify(inspection.map((v,i)=>({index:successful[i].index,views:v.labels})))}. The final ${references.length} images are reference-only brand examples; use them to calibrate proportions and craft, never demand copied artwork. Directions: ${JSON.stringify(candidates[0]?.artDirection)}.`:'';
    const survivor=successful.length===1?' Only one alternative survived rendering. Assess it against the same professional craft standard; successful rendering is not evidence of readiness. Reject it when material defects remain.':'';
    const rhythm=` Primary reading-structure and measured phone-readability findings from the actual renders: ${JSON.stringify(successful.map(c=>({index:c.index,findings:[...layoutRepetitionFindings(c.artifact),...mobileReadabilityFindings(c.artifact)]})))}. A candidate with unresolved findings requires refinement even if its family names differ. Repeated consistent data encodings can be purposeful; do not mistake a closing CTA or surface change for a distinct primary reading structure.`;
    const decision=z.object({index:z.number().int(),reason:z.string().max(2000),ready:z.boolean().optional(),issues:z.array(z.string().max(500)).max(8).optional()}).parse(JSON.parse((await ask(prompt+extra+survivor+rhythm,[...successful.flatMap(c=>c.images),...inspection.flatMap(v=>v.images),...references])).replace(/^```(?:json)?\s*|\s*```$/g,'')));
    if(craft&&decision.ready===undefined)throw Error('The visual selector must explicitly accept the design or reject all candidates.');
    issues=decision.issues??[];ready=(decision.ready??true)&&(!craft||issues.length===0);
    if(!ready&&!issues.length)issues=[decision.reason];
    const match=successful.find(c=>c.index===decision.index);if(!match)throw new Error('Visual selector returned an unknown candidate.');selected=match;reason=decision.reason;
    if(craft){issues=[...new Set([...issues,...[...layoutRepetitionFindings(selected.artifact),...mobileReadabilityFindings(selected.artifact)].map(f=>`Page ${f.page}: ${f.problem}`)])].slice(0,8);ready=ready&&issues.length===0;}
  }
  if(candidates[0]?.artDirection)selected.artifact.designSelection={ready,reason,issues};
  return {artifact:selected.artifact,evidence:{selected:selected.index,reason,ready,issues,candidates:successful.map(c=>({index:c.index,pages:c.artifact.type==='presentation'?c.artifact.previewPaths:c.artifact.type==='carousel'?c.artifact.imagePaths:(c.artifact.type==='story'||c.artifact.type==='poster'||c.artifact.type==='post')?[c.artifact.imagePath]:[],fonts:c.artifact.renderEvidence})),failures}};
}
