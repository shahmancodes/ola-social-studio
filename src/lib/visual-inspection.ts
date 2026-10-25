import sharp from 'sharp';
import type { SimpleArtifact } from './simple-content';

export function artifactImageFiles(artifact:SimpleArtifact) {
  return ((artifact.type==='carousel'?artifact.imagePaths:artifact.type==='presentation'?artifact.previewPaths:artifact.type==='article'?[]:[artifact.imagePath])??[]).filter((f):f is string=>Boolean(f));
}
const data=(bytes:Buffer)=>'data:image/jpeg;base64,'+bytes.toString('base64');

/** Overview at phone reading size, plus native-scale component details. No dimensions inferred by vision. */
export async function craftInspectionImages(artifact:SimpleArtifact) {
  const files=artifactImageFiles(artifact);if(!files.length)return {images:[] as string[],labels:[] as string[]};
  const cells=await Promise.all(files.map(async file=>sharp(file).resize({width:360}).jpeg({quality:85}).toBuffer()));
  const heights=await Promise.all(cells.map(async b=>(await sharp(b).metadata()).height!));
  const cols=Math.min(3,files.length),cellH=Math.max(...heights)+24;
  const board=await sharp({create:{width:cols*376,height:Math.ceil(cells.length/cols)*cellH,channels:3,background:'#e7e7e7'}}).composite(cells.map((input,i)=>({input,left:(i%cols)*376+8,top:Math.floor(i/cols)*cellH+12}))).jpeg({quality:85}).toBuffer();
  const images=[data(board)],labels=['Phone-size sequence overview: pages left to right, then next row.'];
  for(const evidence of (artifact.renderEvidence??[])){
    if(images.length>=4)break;
    const layout=evidence.layout as {groups?:Array<{id:string;x:number;y:number;w:number;h:number}>}|undefined;
    const group=layout?.groups?.find(g=>g.id==='artwork'),file=files[evidence.page-1];
    if(!group||!file)continue;
    const meta=await sharp(file).metadata(),left=Math.max(0,Math.floor(group.x)),top=Math.max(0,Math.floor(group.y));
    const width=Math.floor(Math.min(group.w,meta.width!-left)),height=Math.floor(Math.min(group.h,meta.height!-top));
    if(width<40||height<40)continue;
    images.push(data(await sharp(file).extract({left,top,width,height}).resize({width:1000,withoutEnlargement:true}).jpeg({quality:90}).toBuffer()));
    labels.push(`Page ${evidence.page}: actual visual group detail. Judge internal labels and relationships here, then its prominence in the overview.`);
  }
  return {images,labels};
}
