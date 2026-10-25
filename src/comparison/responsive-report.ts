import fs from 'node:fs';
import path from 'node:path';
import { LAB_DIR } from './config';
export type ResponsiveProofReport={createdAt:string;fingerprint:string;note:string;cases:Array<{caseId:string;company:string;format:string;sourceAttemptId:string;inputHash:string;sourceHash:string;copyHash:string;before:string[];after:string[];checks:unknown[];assessment:string[]}>};
const file=()=>path.join(LAB_DIR,'responsive-proofs','manifest.json');
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function responsiveProofFile(caseId:string,page:number,before:boolean){
  if(!Number.isInteger(page)||page<0)throw new Error('Invalid page.');
  const report=JSON.parse(fs.readFileSync(file(),'utf8')) as ResponsiveProofReport;
  const c=report.cases.find(c=>c.caseId===caseId),selected=c?.[before?'before':'after'][page];
  if(!selected||!path.resolve(selected).startsWith(path.resolve(LAB_DIR)+path.sep)||path.extname(selected)!=='.png')throw new Error('Proof not found.');
  return selected;
}
export function responsiveReport(){
  if(!fs.existsSync(file()))return '<!doctype html><title>Responsive layout tests</title><p>Run the local responsive proof command first.</p>';
  const report=JSON.parse(fs.readFileSync(file(),'utf8')) as ResponsiveProofReport;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ola responsive layout proofs</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f1ed;color:#202126;font:15px/1.5 system-ui}main{max-width:1280px;margin:auto;padding:32px 24px}a{color:#4437a0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}.pair>div{min-width:0}img{display:block;width:100%;height:auto;background:white}figure{margin:12px 0 30px}figcaption{font-size:12px;color:#625b69}section{margin:48px 0}.note{max-width:900px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}nav{display:flex;gap:20px;flex-wrap:wrap}@media(max-width:650px){main{padding:20px 12px}.pair{gap:10px}h3{font-size:14px}}</style></head><body><main><a href="/">← Ola Sentinel</a><h1>Content-responsive compositions</h1><p class="note">${esc(report.note)}</p><nav>${report.cases.map(c=>`<a href="#${esc(c.caseId)}">${esc(c.company)} · ${esc(c.format)}</a>`).join('')}</nav>${report.cases.map(c=>{
    const gallery=(before:boolean)=>(before?c.before:c.after).map((_,i)=>{const url=`/api/responsive-proof/${encodeURIComponent(c.caseId)}?page=${i}${before?'&before=1':''}`;return `<figure><a href="${url}" target="_blank" rel="noopener"><img loading="lazy" src="${url}" alt="${esc(c.company)} ${before?'saved':'responsive'} page ${i+1}"></a><figcaption>Page ${i+1} · click for full size</figcaption></figure>`;}).join('');
    return `<section id="${esc(c.caseId)}"><h2>${esc(c.company)} · ${esc(c.format)}</h2><p><a href="/?case=${esc(c.caseId)}">Original comparison versions</a></p><ul>${c.assessment.map(a=>`<li>${esc(a)}</li>`).join('')}</ul><div class="pair"><div><h3>Saved Ola output</h3>${gallery(true)}</div><div><h3>Shared responsive renderer</h3>${gallery(false)}</div></div><details><summary>Copy, source and geometry checks</summary><pre>${esc(JSON.stringify({sourceAttemptId:c.sourceAttemptId,inputHash:c.inputHash,sourceHash:c.sourceHash,copyHash:c.copyHash,fingerprint:report.fingerprint,checks:c.checks},null,2))}</pre></details></section>`;
  }).join('')}</main></body></html>`;
}
