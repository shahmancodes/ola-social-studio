import {z} from 'zod';
export const COMPONENT_FORMATS=['poster','story','carousel','post','presentation','article'] as const;
export type ComponentFormat=typeof COMPONENT_FORMATS[number];
export const componentSource=/^semanticComponent\.(prompt|answer|leftTitle|rightTitle|takeaway|note|unit|items\.\d+\.(label|detail|tag))$/;
const box=z.object({id:z.string().regex(/^[a-z][a-z0-9-]{0,50}$/),x:z.number().min(0).max(.98),y:z.number().min(0).max(.98),w:z.number().min(.08).max(1),h:z.number().min(.05).max(1)}).strict().refine(v=>v.x+v.w<=1.001&&v.y+v.h<=1.001,'Node must stay inside its component.');
const shape=box.safeExtend({kind:z.enum(['rect','rounded-rect','circle']),tone:z.enum(['surface','accent','ink']),purpose:z.string().min(10).max(200)}).strict();
const profile=z.object({shapes:z.array(shape).max(8).optional(),heightRatio:z.number().min(.3).max(1.5),boxes:z.array(box).min(1).max(20)}).strict();
export const SemanticDesignSpecSchema=z.object({version:z.literal(1),name:z.string().min(3).max(100),purpose:z.string().min(10).max(500),relationship:z.enum(['sequence','cause-effect','comparison','hierarchy','association','cycle','statement']),
 textFlow:z.enum(['regions','grouped']).optional(),
 nodes:z.array(z.object({id:z.string().regex(/^[a-z][a-z0-9-]{0,50}$/),source:z.string().regex(componentSource),role:z.enum(['heading','label','detail']),emphasis:z.enum(['normal','strong']).default('normal')} ).strict()).min(1).max(20),
 connectors:z.array(z.object({from:z.string(),to:z.string(),kind:z.enum(['line','arrow','double-arrow']),route:z.enum(['auto','straight','elbow']).optional()}).strict()).max(20),
 enclosures:z.array(z.object({id:z.string().regex(/^[a-z][a-z0-9-]{0,50}$/),nodes:z.array(z.string()).min(1).max(20),kind:z.enum(['rect','rounded-rect','circle']),tone:z.enum(['surface','accent','ink']),padding:z.number().min(.005).max(.05).optional(),purpose:z.string().min(10).max(200)}).strict()).max(8).optional(),
 profiles:z.object({portrait:profile,landscape:profile}).strict(),
}).strict();
export const SemanticDesignSchema=z.object({candidateId:z.string().uuid(),spec:SemanticDesignSpecSchema}).strict();
export type SemanticDesign=z.infer<typeof SemanticDesignSchema>;
export type SemanticDesignSpec=z.infer<typeof SemanticDesignSpecSchema>;
export function semanticDesignIssues(spec:SemanticDesignSpec,requiredSources:string[]){
 const issues:string[]=[],ids=spec.nodes.map(n=>n.id),sources=spec.nodes.map(n=>n.source);
 if(new Set(ids).size!==ids.length)issues.push('Duplicate node IDs.');
 if(new Set(sources).size!==sources.length)issues.push('Copy sources must be drawn once.');
 if(requiredSources.some(s=>!sources.includes(s))||sources.some(s=>!requiredSources.includes(s)))issues.push('Design must cover exactly the existing canonical component text, without new labels or omissions.');
 for(const [name,p]of Object.entries(spec.profiles)){
  if(p.boxes.length!==ids.length||new Set(p.boxes.map(b=>b.id)).size!==ids.length||p.boxes.some(b=>!ids.includes(b.id)))issues.push(`${name}: layout must place every node once.`);
  for(let i=0;i<p.boxes.length;i++)for(const b of p.boxes.slice(i+1)){const a=p.boxes[i];if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.002&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.002)issues.push(`${name}: overlapping text regions ${a.id}/${b.id}.`);}
 }
 for(const c of spec.connectors)if(!ids.includes(c.from)||!ids.includes(c.to)||c.from===c.to)issues.push('Connector has an invalid endpoint.');
 const enclosed=new Set<string>(),enclosureIds=new Set<string>();
 for(const e of spec.enclosures??[]){
  if(enclosureIds.has(e.id))issues.push('Duplicate enclosure IDs.');enclosureIds.add(e.id);
  for(const id of e.nodes){if(!ids.includes(id))issues.push('Enclosure has an invalid node.');if(enclosed.has(id))issues.push('A node may belong to only one enclosure.');enclosed.add(id);}
 }
 for(const p of Object.values(spec.profiles))if(new Set(p.shapes?.map(s=>s.id)).size!==(p.shapes?.length??0))issues.push('Duplicate profile shape IDs.');
 if(['sequence','cause-effect','hierarchy','cycle','association'].includes(spec.relationship)&&spec.nodes.length>1&&!spec.connectors.length)issues.push('This relationship needs explicit connectors.');
 return [...new Set(issues)];
}
export function componentSources(component:unknown){
 const c=component as Record<string,unknown>|undefined;if(!c)return[];
 const sources=['prompt','answer','leftTitle','rightTitle','takeaway','note','unit',...((c.items as unknown[])??[]).flatMap((_,i)=>['label','detail','tag'].map(k=>`items.${i}.${k}`))];
 return sources.filter(source=>{let v:unknown=c;for(const key of source.split('.'))v=v&&typeof v==='object'?(v as Record<string,unknown>)[key]:undefined;return typeof v==='string'&&Boolean(v.trim());}).map(s=>'semanticComponent.'+s);
}
export function componentText(component:unknown,source:string){let value:unknown={semanticComponent:component};for(const key of source.split('.'))value=value&&typeof value==='object'?(value as Record<string,unknown>)[key]:undefined;return typeof value==='string'?value:'';}
