import type { VisualScene } from './content-layout';
import type { SimpleArtifact } from './simple-content';

type ReadingRole = 'title' | 'body' | 'label' | 'cta';
export type MobileTextEvidence = { version: 1; viewingWidth: 360; text: Array<{ id: string; role: ReadingRole; pixels: number; minimum: number; content?:string }> };
// Product acceptance floors at a phone reading width, independent of preview resizing.
const minimum: Record<ReadingRole, number> = { title: 14, body: 11, label: 11, cta: 10 };

export function primaryReadingRole(id: string): ReadingRole | undefined {
  return id==='title'?'title':id==='body'||/^(?:visualContent|semanticComponent)\.items\.\d+\.detail$/.test(id)?'body':/^(?:visualContent|semanticComponent)\.items\.\d+\.(?:label|tag)$/.test(id)||/^semanticComponent\.(?:prompt|answer|leftTitle|rightTitle|takeaway)$/.test(id)||/^metric-value-\d+$/.test(id)?'label':id==='cta'?'cta':undefined;
}

export function mobileMinimumFontSize(id: string, width: number) {
  const role=primaryReadingRole(id);
  return role?minimum[role]*width/360:undefined;
}

export function mobileTextEvidence(scene: VisualScene): MobileTextEvidence {
  const text: MobileTextEvidence['text'] = [];
  for(const element of scene.elements){
    if(element.kind==='image'&&!element.hidden&&element.id&&element.embeddedText){
      const scale=element.w/element.embeddedText.width;
      for(const item of element.embeddedText.text)text.push({id:element.id,role:'label',pixels:item.size*scale*360/scene.width,minimum:minimum.label,content:item.content});
      continue;
    }
    if(element.kind!=='text'||element.hidden||element.layoutDecoration||!element.id||!element.text.trim())continue;
    const role=primaryReadingRole(element.copySource==='title'?'title':element.id);
    if(role)text.push({id:element.id,role,pixels:element.size*360/scene.width,minimum:minimum[role]});
  }
  return {version:1,viewingWidth:360,text};
}

export function mobileReadabilityFindings(artifact: SimpleArtifact) {
  if(!['story','post','carousel'].includes(artifact.type))return [];
  return (artifact.renderEvidence??[]).flatMap(evidence=>{
    const reading=(evidence.layout as {readability?:MobileTextEvidence}|undefined)?.readability;
    if(!reading)return [];
    const small=reading.text.filter(t=>t.pixels+.05<t.minimum).sort((a,b)=>a.pixels-b.pixels);
    if(!small.length)return [];
    const worst=small[0];
    return [{page:evidence.page,targets:[...new Set(small.map(t=>t.id))].slice(0,6),problem:`Primary ${worst.role} text measures ${worst.pixels.toFixed(1)}px at a 360px phone viewing width, below its ${worst.minimum}px reading minimum. ${small.length} text element${small.length===1?' is':'s are'} too small.${worst.content?` Smallest component text: ${JSON.stringify(worst.content)}.`:''}`,successCriterion:'Increase the affected typography or visual-group scale until all primary text meets its measured phone reading minimum. Reflow existing groups when needed; preserve copy, labels and connectors. This includes internal text in rendered diagram images. Do not use a close-up or a larger preview as evidence of readability.'}];
  });
}
