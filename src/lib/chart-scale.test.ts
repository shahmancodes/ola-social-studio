import {it,expect} from 'vitest';
import {barScale} from './chart-scale';
import {semanticComponentHtml} from './semantic-components';
import {SemanticComponentSchema} from './schemas';
it('uses a visible whole-percent scale and preserves relative lengths',()=>{
 const scale=barScale([82,61,43],'%');expect(scale).toEqual({min:0,max:100,ticks:[0,50,100]});
 const html=semanticComponentHtml(SemanticComponentSchema.parse({kind:'barChart',unit:'%',items:[{label:'A',value:82},{label:'B',value:61},{label:'C',value:43}]}));
 expect(html).toContain('sc-bar-axis');for(const t of ['0%','50%','100%','width:82%','width:43%'])expect(html).toContain(t);
});
it('does not clamp negative values or percentage growth to the share domain',()=>{
 expect(barScale([-20,30],'')).toMatchObject({min:-20,max:30});expect(barScale([125,230],'%').max).toBeGreaterThanOrEqual(230);expect(barScale([0,0],'').max).toBeGreaterThan(0);
});
it('omits renderer-added prose while preserving explicitly authored uppercase copy',()=>{
 const component=SemanticComponentSchema.parse({kind:'barChart',prompt:'CATEGORY COMPARISON',unit:'%',items:[{label:'A',value:82},{label:'B',value:43}]});
 const legacy=semanticComponentHtml(component),sourceOnly=semanticComponentHtml(component,'','',true);
 expect(legacy.match(/CATEGORY COMPARISON/g)).toHaveLength(2);expect(sourceOnly.match(/CATEGORY COMPARISON/g)).toHaveLength(1);expect(sourceOnly).toContain('100%');
});
