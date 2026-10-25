import fs from'node:fs';import path from'node:path';import sharp from'sharp';
const dir=path.resolve('.data/comparison/ola-study'),status=JSON.parse(fs.readFileSync(path.join(dir,'status.json'),'utf8')),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));const out=path.join(dir,'contact-sheets');fs.mkdirSync(out,{recursive:true});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function sheet(name,tiles,columns=3){
 const w=440,h=680,pad=16,rows=Math.ceil(tiles.length/columns),composite=[];
 for(const[t,tile]of tiles.entries()){
  const x=(t%columns)*w,y=Math.floor(t/columns)*h;const label=Buffer.from(`<svg width="${w}" height="52"><rect width="${w}" height="52" fill="white"/><text x="12" y="21" font-family="sans-serif" font-size="15">${esc(tile.label.slice(0,53))}</text><text x="12" y="42" font-family="sans-serif" font-size="12">${esc(tile.detail??'')}</text></svg>`);composite.push({input:await sharp(label).png().toBuffer(),left:x,top:y});
  if(tile.file){const img=await sharp(tile.file).resize(w-pad*2,h-70,{fit:'inside'}).png().toBuffer(),meta=await sharp(img).metadata();composite.push({input:img,left:x+Math.round((w-meta.width)/2),top:y+56});}
 }
 const file=path.join(out,name+'.jpg');await sharp({create:{width:columns*w,height:Math.max(1,rows)*h,channels:3,background:'#e8e4df'}}).composite(composite).jpeg({quality:90}).toFile(file);console.log(file);
}
for(const company of manifest.companies){const rows=status.rows.filter(r=>r.company===company),tiles=rows.filter(r=>r.format!=='carousel').map(r=>({label:`${company} · ${r.prompt} · ${r.format}`,detail:r.status,file:r.pages[0]?.file}));await sheet(company.toLowerCase().replaceAll(' ','-')+'-singles',tiles,4);}
for(const r of status.rows.filter(r=>r.format==='carousel'&&r.pages.length))await sheet(`${r.company.toLowerCase().replaceAll(' ','-')}-${r.prompt}-carousel`,r.pages.map((p,i)=>({label:`${r.company} · concept ${r.prompt} · ${i+1}/${r.pages.length}`,detail:r.status,file:p.file})));
