import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { expect,it } from 'vitest';
import { filmCleanTakes } from './clean-take';
import { RenderInternals } from '@remotion/renderer';
import sharp from 'sharp';
it('records a real continuous drawing action and preserves source timing and result evidence',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ola-take-test-'));const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1.5});
  await page.setContent(`<style>body{margin:0;background:white}canvas{display:block}</style><canvas width="1440" height="1000"></canvas><script>let down=false;const c=document.querySelector('canvas'),x=c.getContext('2d');x.lineWidth=12;x.strokeStyle='#6965db';c.onpointerdown=e=>{down=true;x.beginPath();x.moveTo(e.clientX,e.clientY)};c.onpointermove=e=>{if(down){x.lineTo(e.clientX,e.clientY);x.stroke()}};c.onpointerup=()=>down=false;</script>`);
  const result=await filmCleanTakes(page,[{label:'Draw the line',actions:[{type:'drag',from:{x:300,y:400},to:{x:1100,y:600}}]}],directory,async()=>{},()=>{});
  expect(result.clips).toHaveLength(1);const clip=result.clips[0];expect(clip.seconds).toBeGreaterThan(1.2);expect(clip.seconds).toBeLessThan(6);expect(clip.events[0].start).toBeGreaterThanOrEqual(0);expect(clip.events[0].end).toBeLessThanOrEqual(clip.seconds);
  for(const [name,time] of [['early',.1],['late',clip.seconds-.1]] as const){await RenderInternals.callFf({bin:'ffmpeg',args:['-hide_banner','-loglevel','error','-ss',String(time),'-i',path.join(directory,clip.file),'-frames:v','1','-y',path.join(directory,name+'.png')],indent:false,logLevel:'error',binariesDirectory:null,cancelSignal:undefined});}
  const early=await sharp(path.join(directory,'early.png')).resize(144,100).raw().toBuffer();const late=await sharp(path.join(directory,'late.png')).resize(144,100).raw().toBuffer();let delta=0;for(let i=0;i<early.length;i++)delta+=Math.abs(early[i]-late[i]);expect(delta/early.length).toBeGreaterThan(.3);
  expect(result.assets).toHaveLength(2);expect(clip.endAssetId).toBe(result.assets[1].id);
 }finally{await browser.close();await fs.rm(directory,{recursive:true,force:true});}
},30000);
