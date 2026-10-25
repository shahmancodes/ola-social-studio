import path from 'node:path';
import sharp from 'sharp';
import { attemptDir, event, saveAttempt } from './store';
import { labels, sharedBrief, type Attempt, type SharedInput } from './types';
import { pause } from './canva';
import { contenderInput, contenderId } from './contenders';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export async function runFixture(a:Attempt,input:SharedInput,signal:AbortSignal) {
  input=contenderInput(input,contenderId(a));
  event(a,'shared-input',{inputHash:a.inputHash,brief:sharedBrief(input)});
  event(a,'fixture','Synthetic layout for interface testing. No Canva or AI calls were made.');
  a.stage='Rendering fixture';saveAttempt(a);await pause(650,signal);
  const width=input.format==='poster'?1240:1080,height=input.format==='poster'?1754:input.format==='story'?1920:1350,count=input.format==='carousel'?input.slideCount:1;
  const palette=a.engine==='ola'?['#ede9ff','#4721a3','#b4a1ee']:a.engine==='canva-agent'?['#e9efeb','#123f32','#badfbd']:['#fff4e6','#4f2e23','#ffb975'];
  const words=input.brief.replace(/\s+/g,' ').split(' ');const lines:string[]=[];let line='';
  for(const word of words.slice(0,22)){if((line+' '+word).length>23){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);
  const pages=[];
  for(let i=0;i<count;i++){
    const file=path.join(attemptDir(a),`fixture-${i+1}.png`);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${palette[0]}"/><circle cx="970" cy="${height-180}" r="380" fill="${palette[2]}"/><text x="80" y="125" font-family="Arial" font-size="28" fill="${palette[1]}">${escape(input.companyName.toUpperCase())}</text><text x="80" y="245" font-family="Arial" font-size="24" fill="${palette[1]}">FIXTURE · ${escape(labels[a.engine])} · ${i+1}/${count}</text>${lines.slice(0,6).map((text,n)=>`<text x="80" y="${390+n*85}" font-family="Arial" font-weight="700" font-size="68" fill="${palette[1]}">${escape(text)}</text>`).join('')}<rect x="80" y="${height-220}" width="610" height="88" rx="44" fill="${palette[1]}"/><text x="125" y="${height-165}" font-family="Arial" font-size="27" fill="white">Synthetic preview — no provider call</text></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(file);pages.push({file,width,height});
  }
  a.result={pages,caption:input.format==='carousel'?'Fixture caption. Use a live run to evaluate actual generation quality.':undefined};
  if(a.engine==='canva-agent')a.result.initialPages=pages;
  a.status='complete';a.stage='Fixture complete';saveAttempt(a);
}
