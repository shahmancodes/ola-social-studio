import{it,expect}from'vitest';import{unpack}from'./canva';
it('reads Canva rich text while preserving structured response preference',()=>{
 const text='## Page 1\nMake review useful\n\nContext\nName the change and who it helps.';
 expect(unpack({content:[{type:'text',text}]},true)).toEqual({richText:text});
 expect(unpack({content:[{type:'text',text:'{"pages":[1]}'}]},true)).toEqual({pages:[1]});
 expect(unpack({structuredContent:{pages:[1]},content:[{type:'text',text}]},true)).toEqual({pages:[1]});
});
it('keeps ambiguous mutations and error responses closed',()=>{
 expect(()=>unpack({content:[{type:'text',text:'Created a design'}]})).toThrow('no structured result');
 expect(()=>unpack({isError:true,content:[{type:'text',text:'Failure'}]},true)).toThrow('reported an error');
 expect(()=>unpack({content:[]},true)).toThrow('no structured result');
});
