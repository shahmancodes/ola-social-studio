import {it,expect} from 'vitest';
import {artifactRepairSchema,applyArtifactPatches,requiredCopyIssues} from './artifact-repair';
import {composePage,artifactPages,resolvedComponent} from './composition';
import {SimpleArtifactSchema} from './simple-content';
import {SemanticComponentSchema} from './schemas';
const title='A useful answer shows its limits',cta='Leave room for a better answer.';
const items=[{label:'Observation',detail:'Say what the source actually shows.'},{label:'Uncertainty',detail:'Name what remains unconfirmed.'},{label:'Next check',detail:'Choose the evidence that would help.'}];
const plan={family:'asymmetric-editorial',intent:{goal:'Show the exact complementary fields',relationship:'statement',reason:'Equal peers without marks or implied order.'},responsive:{version:1,balance:{version:1},readability:{version:1},visual:{nodes:'none'}}};
const page=composePage({title,body:'',cta,semanticComponent:SemanticComponentSchema.parse({kind:'hubSpoke',prompt:title,items})},plan);
const artifact=SimpleArtifactSchema.parse({type:'poster',headline:title,subline:'',cta,semanticComponent:page.semanticComponent,composition:page.composition});
const brief=`Headline: "${title}". Label/detail pairs: ${items.map(i=>`"${i.label}" / "${i.detail}"`).join('; ')}. Closing line: "${cta}".`;
it('offers only canonical-preserving text mode for a repair with an empty paragraph',()=>{
 const schema=artifactRepairSchema(artifact),patch={reason:'Change the layout',patches:[{target:'page-1',compositionPlan:{...plan,bodyMode:'grid'}}]};
 expect(schema.safeParse(patch).success).toBe(false);
 expect(schema.safeParse({...patch,patches:[{...patch.patches[0],compositionPlan:{...plan,bodyMode:'text'}}]}).success).toBe(true);
});
it('replaces a bound hub with neutral measured peers through the normal exact-copy repair path',()=>{
 const before=structuredClone(artifact),repair={reason:'The selected statement needs equal fields rather than a relationship diagram.',patches:[{target:'page-1',semanticComponent:SemanticComponentSchema.parse({kind:'checklist',items}),compositionPlan:{...plan,bodyMode:'text'}}]};
 const changed=applyArtifactPatches(artifact,artifactRepairSchema(artifact).parse(repair),brief),p=artifactPages(changed)[0];
 expect(requiredCopyIssues(changed,brief)).toEqual([]);expect(p.composition?.placements.some(p=>p.slot==='title')).toBe(true);
 expect(resolvedComponent(p)?.items.map(({label,detail})=>({label,detail}))).toEqual(items);
 expect(p.composition?.blocks.filter(b=>b.source==='title')).toHaveLength(1);expect(artifact).toEqual(before);
});
it('still offers genuine literal paragraph segmentation on a prose page',()=>{
 const p=composePage({title:'Two steps',body:'Find evidence → Check the source'},plan),a=SimpleArtifactSchema.parse({type:'poster',headline:p.title,subline:p.body,composition:p.composition});
 const repair={reason:'Show the explicit order',patches:[{target:'page-1',compositionPlan:{...plan,bodyMode:'sequence',separator:' → '}}]};
 expect(artifactRepairSchema(a).safeParse(repair).success).toBe(true);expect(resolvedComponent(artifactPages(applyArtifactPatches(a,repair,''))[0])?.items.map(i=>i.label)).toEqual(['Find evidence','Check the source']);
});
