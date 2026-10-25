import type { SceneElement } from './content-layout';

/** Pagination is navigation, not a loading state. One compact, honest page count. */
export function pageMarker(index:number,total:number,x:number,y:number,unit:number,ink:string,accent:string):SceneElement[]{
  if(total<2)return [];
  return [
    {kind:'line',id:'page-marker-rule',x,y:y+15*unit,x2:x+28*unit,y2:y+15*unit,width:3*unit,color:accent},
    {kind:'text',id:'page-marker',x:x+42*unit,y,w:112*unit,h:32*unit,size:22*unit,minSize:18*unit,weight:'bold',color:ink,align:'right',fontFamily:'OlaBody',text:`${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`,lines:[]},
  ];
}
