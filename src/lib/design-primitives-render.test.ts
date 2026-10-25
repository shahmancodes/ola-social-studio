import {describe,it,expect} from 'vitest';
import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import sample from '../../examples/design-primitives.json';
import {SemanticDesignSpecSchema,semanticDesignIssues,componentSources,COMPONENT_FORMATS} from './semantic-design';
import {SemanticComponentSchema} from './schemas';
import {composePage} from './composition';
import {buildVisualScene,scenePng,sceneSvg} from './content-layout';
import {semanticDesignBlock} from './semantic-design-render';
import {sceneIssues} from './scene-renderer';
import {previewSceneObjects,freeformScene} from './freeform-scene';
import {persistedObjects,FreeformCanvasSchema} from './freeform-canvas';
import {addSceneToPptx} from './modern-content';
import type {ContentBrand} from './content-brand';
const spec=SemanticDesignSpecSchema.parse(sample.spec),semanticComponent=SemanticComponentSchema.parse(sample.semanticComponent);
const brand:ContentBrand={companyId:'fixture',name:'Sample',audience:'Readers',voice:'Clear',description:'',typography:'Manrope',imagery:'',formatRules:'',examples:[],assets:[],palette:{background:'#F7F6F2',alternate:'#E9EEF5',accent:'#174A80',ink:'#152A40',dark:'#152A40'}};
const source={title:sample.title,body:'',semanticComponent,semanticDesign:{candidateId:'a1000000-0000-4000-8000-000000000000',spec}};
describe('portable editable shape and connector geometry',()=>{
  it('validates referenced grouping without allowing new copy, unknown nodes or duplicate memberships',()=>{
    expect(semanticDesignIssues(spec,componentSources(semanticComponent))).toEqual([]);
    const enclosure=spec.enclosures![0];
    expect(semanticDesignIssues({...spec,enclosures:[enclosure,{...enclosure,id:'other'}]},componentSources(semanticComponent))).toContain('A node may belong to only one enclosure.');
    expect(semanticDesignIssues({...spec,enclosures:[{...enclosure,nodes:['unknown']}]},componentSources(semanticComponent))).toContain('Enclosure has an invalid node.');
    expect(SemanticDesignSpecSchema.safeParse({...spec,enclosures:[{...enclosure,text:'invented label'}]}).success).toBe(false);
  });
  it('draws mutual relationships inside one enclosure without treating its own surface as an obstacle',async()=>{
    const grouped=SemanticDesignSpecSchema.parse({...spec,connectors:[{from:'observe',to:'respond',kind:'double-arrow'}],enclosures:[{...spec.enclosures![0],nodes:spec.nodes.map(n=>n.id)}]});
    const scene=semanticDesignBlock({...source,semanticDesign:{...source.semanticDesign,spec:grouped}},brand);
    await scenePng(scene);expect(sceneIssues(scene)).toEqual([]);
    expect(scene.elements.some(e=>e.kind==='line'&&e.arrow==='both')).toBe(true);
  });
  it('rejects an enclosure that would imply membership for unrelated text',async()=>{
    const grouped=SemanticDesignSpecSchema.parse({...spec,enclosures:[{...spec.enclosures![0],nodes:['observe','action']}]});
    const scene=semanticDesignBlock({...source,semanticDesign:{...source.semanticDesign,spec:grouped}},brand);
    await expect(scenePng(scene)).rejects.toThrow(/covers unrelated node/);
  });
  for(const format of COMPONENT_FORMATS)it(`imports the same shape specification into ${format} with canonical copy and editable vectors`,async()=>{
    const original=JSON.stringify(source);
    const page=composePage(source,{family:'diagram-led',intent:{goal:spec.purpose,relationship:'sequence',reason:'Two ordered stages with their explanations.'},responsive:{version:1,balance:{version:1},readability:{version:1},arrangement:'stack',focal:'artwork',visualWeight:.6}});
    const scene=format==='article'?semanticDesignBlock(source,brand):await buildVisualScene(format,page,brand);
    expect((await scenePng(scene)).length).toBeGreaterThan(1000);
    expect(sceneIssues(scene)).toEqual([]);
    const shapes=scene.elements.filter(e=>e.id?.startsWith('designed-shape-'));
    expect(shapes).toHaveLength(2);expect(shapes.every(e=>e.kind==='rect')).toBe(true);
    const edges=scene.elements.filter(e=>e.id?.startsWith('designed-edge-'));
    expect(edges.some(e=>e.kind==='line'&&e.arrow==='end')).toBe(true);
    expect(scene.elements.filter(e=>e.kind==='text'&&e.copySource?.startsWith('semanticComponent.')).map(e=>e.kind==='text'?e.text:'').sort()).toEqual(semanticComponent.items.flatMap(i=>[i.label,i.detail!]).sort());
    const imported=persistedObjects(previewSceneObjects(scene,page));
    expect(FreeformCanvasSchema.safeParse({version:1,objects:imported}).success).toBe(true);
    const restored=await freeformScene(scene,{...page,editorAppearance:{freeform:{version:1,objects:imported}}},brand);
    expect(sceneSvg(restored)).toContain('stroke-linecap="round"');
    expect(restored.elements.filter(e=>e.kind==='line'&&e.arrow==='end')).toHaveLength(1);
    expect(JSON.stringify(source)).toBe(original);
    if(format==='presentation'){
      const deck=new pptxgen();deck.defineLayout({name:'CANVAS',width:scene.width/96,height:scene.height/96});deck.layout='CANVAS';addSceneToPptx(deck,scene);
      const zip=await JSZip.loadAsync(await deck.write({outputType:'nodebuffer'}) as Buffer),xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
      expect(xml).toContain('Observe');expect(xml).toContain('roundRect');expect(xml).toContain('prst="line"');expect(xml).not.toContain('<p:pic>');
    }
  },30000);
});
