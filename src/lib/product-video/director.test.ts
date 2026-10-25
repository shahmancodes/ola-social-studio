import { describe, expect, it } from 'vitest';
import { evidenceStoryboard, validateDirection } from './director';
import { actionWindow } from './clip-edit';
import { focusBounds } from './clean-take';
import { StoryboardSchema, VideoInputSchema, validateStoryboardAssets, type ClipAsset } from './schema';
import { filmTiming } from './rhythm';
import { musicTrack } from './music-catalog';
const input = VideoInputSchema.parse({url:'https://example.com',feature:'Connect two shapes',brand:'Example'});
const assets = ['a','b','c'].map(id=>({id,file:id+'.png',url:input.url,title:id,label:'Draw shapes',width:1440,height:1000,sha256:'x',capturedAt:'',take:true}));
const clips:ClipAsset[] = [0,1].map(i=>({id:'take-'+(i+1),file:`take-${i+1}.mp4`,label:i?'Connect the shapes':'Draw the shapes',width:1440,height:1000,seconds:5.3,fps:30,sha256:'x',startAssetId:assets[i].id,endAssetId:assets[i+1].id,actionCount:2,focus:{x:.3,y:.3,width:.4,height:.3},events:[{action:'drag',start:.4,end:4.8}]}));
describe('product-film director',()=>{
 it('builds a varied grounded story from actual action footage',()=>{
  const board=evidenceStoryboard(input,assets,clips);validateDirection(board,assets,clips);
  expect(board.treatment).toBe('editorial');expect(board.scenes).toHaveLength(7);
  expect(board.scenes.filter(s=>s.kind==='clip').map(s=>s.clipId)).toEqual(['take-1','take-2']);
  expect(board.scenes.some(s=>s.kind==='intertitle')).toBe(true);
 });
 it('rejects invented clips and trims that erase the result',()=>{
  const board=evidenceStoryboard(input,assets,clips);board.scenes.find(s=>s.clipId)!.clipId='invented';expect(()=>validateDirection(board,assets,clips)).toThrow('unavailable clip');
  const cut=evidenceStoryboard(input,assets,clips);cut.scenes.find(s=>s.clipId)!.clipEnd=2;expect(()=>validateDirection(cut,assets,clips)).toThrow('preserve');
 });
 it('requires valid user trim ranges and bounded playback length',()=>{
  const board=evidenceStoryboard(input,assets,clips);const shot=board.scenes.find(s=>s.clipId)!;
  shot.clipStart=5;shot.clipEnd=4;expect(()=>validateStoryboardAssets(board,assets,clips)).toThrow('trim');
  shot.clipEnd=undefined;expect(()=>validateStoryboardAssets(board,assets,clips)).toThrow('explicit');
  shot.clipStart=0;shot.clipEnd=5.3;shot.playbackRate=.5;expect(()=>validateStoryboardAssets(board,assets,clips)).toThrow('ten seconds');
 });
 it('never cuts the recorded action short when synchronizing to music',()=>{
  const board=evidenceStoryboard(input,assets,clips);board.music={trackId:'carefree',volume:.3};
  const music={track:musicTrack('carefree'),file:'x',sha256:'x',analyzedSeconds:120,bpm:120,beats:Array.from({length:240},(_,i)=>i*.5),onsetAgreement:1,analyzedAt:''};
  const timing=filmTiming(board,music);
  board.scenes.forEach((scene,i)=>{if(scene.clipId)expect(timing.scenes[i].frames).toBeGreaterThanOrEqual(Math.ceil((scene.clipEnd!-scene.clipStart)/scene.playbackRate*30));});
 });
 it('supports old storyboard records and honest still-only direction',()=>{
  const board=evidenceStoryboard(input,assets,[]);validateDirection(board,assets,[]);expect(board.scenes.every(s=>!s.clipId)).toBe(true);
  const classic=StoryboardSchema.parse({...input,scenes:['title','showcase','cta'].map((kind,i)=>({id:String(i),kind,headline:'A feature',seconds:3,assetId:'a'}))});expect(classic.treatment).toBe('classic');
 });
 it('computes framing from actual interaction geometry within the viewport',()=>{
  const bounds=focusBounds([{x:0,y:0,width:400,height:200},{x:1300,y:900,width:140,height:100}]);expect(bounds).toEqual({x:0,y:0,width:1,height:1});
 });
 it('trims setup and housekeeping while keeping the whole primary action and result hold',()=>{
  const clip={...clips[0],events:[{action:'click',start:.2,end:1},{action:'drag',start:1.4,end:3.7},{action:'press',start:4.1,end:5.1}]};
  const window=actionWindow(clip);expect(window.start).toBeCloseTo(1.28);expect(window.end).toBeCloseTo(4.35);
 });

});
