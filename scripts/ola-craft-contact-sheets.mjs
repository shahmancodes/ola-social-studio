import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { DatabaseSync } from 'node:sqlite';
const study=process.argv.includes('--textbox')?'textbox-study':process.argv.includes('--assets')?'asset-study':'craft-study';
const dir=path.join(process.cwd(),'.data/comparison',study),manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8')),db=new DatabaseSync(path.join(dir,'runtime/comparisons.sqlite'),{readOnly:true});
await fs.mkdir(path.join(dir,'contact-sheets'),{recursive:true});
const xml=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const row of manifest.cases){
  const attempt=JSON.parse(db.prepare('SELECT record_json FROM attempts WHERE id=?').get(row.attemptId).record_json),after=attempt.result?.pages;if(!after?.length)continue;
  const width=row.format==='carousel'?270:460,height=Math.ceil(width*(row.format==='story'?1920/1080:row.format==='poster'?1754/1240:1350/1080)),cols=row.format==='carousel'?4:2,cellW=width+20,cellH=height+46;
  const tiles=[];
  for(let i=0;i<Math.max(after.length,row.before.length);i++)for(const [j,pages]of [row.before,after].entries()){
    const page=pages[i];if(!page)continue;const index=i*2+j,left=index%cols*cellW+10,top=Math.floor(index/cols)*cellH;
    tiles.push({input:Buffer.from(`<svg width="${cellW}" height="35"><text x="10" y="24" font-family="Arial" font-size="16" fill="#222">${xml(row.company)} · ${j?'After':'Before'}${after.length>1?' · '+(i+1):''}</text></svg>`),left:left-10,top});
    tiles.push({input:await sharp(page.file).resize({width,height,fit:'inside'}).png().toBuffer(),left,top:top+36});
  }
  const file=path.join(dir,'contact-sheets',row.company.toLowerCase()+'-'+row.format+'.jpg');
  await sharp({create:{width:cellW*cols,height:cellH*Math.ceil(after.length*2/cols),channels:3,background:'#e8e7e4'}}).composite(tiles).jpeg({quality:92}).toFile(file);console.log(file);
}
db.close();
