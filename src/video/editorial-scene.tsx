import React from 'react';
import { AbsoluteFill, Freeze, Img, OffthreadVideo, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Scene } from '../lib/product-video/schema';
import type { FilmProps } from './product-film';
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
function Words({ text, emphasis, accent, frame, fps }: { text: string; emphasis: string; accent: string; frame: number; fps: number }) {
  let offset = 0;
  return <>{text.split(' ').map((word,index) => {
    const start = offset; offset += word.length + 1; const at = emphasis ? text.toLowerCase().indexOf(emphasis.toLowerCase()) : -1;
    const active = at >= 0 && start < at + emphasis.length && start + word.length > at;
    const enter = spring({ frame: frame - index * 2, fps, config: { damping: 20, stiffness: 180, mass: .7 } });
    return <span key={index} style={{ display:'inline-block',overflow:'hidden',paddingRight:'.22em',verticalAlign:'top' }}><span style={{ display:'inline-block',transform:`translateY(${(1-enter)*110}%)`,color:active?accent:undefined }}>{word}</span></span>;
  })}</>;
}
export function EditorialScene({ scene, storyboard, images, clips, music, index, sceneFrames }: FilmProps & { scene: Scene; index: number; sceneFrames: number }) {
  const frame = useCurrentFrame(), {fps,width,height} = useVideoConfig(); const portrait = height > width; const unit = width/1920;
  const title = scene.kind === 'title', beat = scene.kind === 'intertitle', end = scene.kind === 'cta';
  const split = ['detail','split'].includes(scene.kind) && !portrait; const typeOnly = title || beat || end;
  const dark = beat || storyboard.theme === 'dark'; const fg = dark ? '#fff' : '#17151c'; const muted = dark ? '#b7afc7' : '#756d80';
  const background = dark ? '#17131e' : '#fbfafc'; const accent = dark ? '#c0a9ff' : storyboard.accent;
  const enter = spring({ frame, fps, config:{ damping:22,stiffness:130,mass:.9 } });
  const cameraT = interpolate(frame,[12,Math.max(13,sceneFrames-18)],[0,1],clamp); const eased = cameraT*cameraT*(3-2*cameraT);
  const zoom = scene.camera === 'push' ? 1+(scene.zoom-1)*eased : scene.camera === 'pull' ? scene.zoom-(scene.zoom-1)*eased*.65 : scene.zoom;
  const clip = scene.clipId ? clips?.[scene.clipId] : undefined;
  const sourceEnd = scene.clipEnd ?? clip?.seconds ?? 0;
  const playFrames = Math.max(1, Math.floor((sourceEnd-scene.clipStart)*fps/scene.playbackRate));
  const size = (n:number)=>n*unit;
  const image = scene.assetId ? images[scene.assetId] : undefined;
  const headlineSize = size(portrait ? (typeOnly?150:100) : typeOnly?148:split?112:78);
  const mediaStyle: React.CSSProperties = { width:'100%',height:'100%',objectFit:portrait?'contain':'cover',transformOrigin:`${scene.focusX*100}% ${scene.focusY*100}%`,transform:`scale(${zoom})` };
  return <AbsoluteFill style={{ background,color:fg,overflow:'hidden' }}>
    <div style={{position:'absolute',left:width*.055,top:height*.052,right:width*.055,display:'flex',justifyContent:'space-between',fontSize:size(portrait?34:24),letterSpacing:'-.02em',fontWeight:650}}><span>{storyboard.brand}<span style={{color:accent}}> ●</span></span><span style={{fontSize:size(portrait?28:18),letterSpacing:'.12em',fontWeight:400,color:muted}}>{end?'TRY IT YOURSELF':`${String(index+1).padStart(2,'0')} / ${String(storyboard.scenes.length).padStart(2,'0')}`}</span></div>
    {beat && <div style={{position:'absolute',width:size(500),height:size(500),border:`${size(2)}px solid ${accent}35`,borderRadius:'50%',right:-size(140),bottom:-size(230),transform:`scale(${1+enter*.3})`}}/>}
    <div style={{position:'absolute',left:width*(split?.055:.07),width:width*(split?.32:.86),top:height*(typeOnly?(title?.29:.34):split?.29:.14),textAlign:split?'left':'center',zIndex:4}}>
      {title && <div style={{fontSize:size(portrait?32:22),letterSpacing:'.16em',textTransform:'uppercase',color:muted,marginBottom:size(32)}}>See what you can do</div>}
      <div style={{fontSize:headlineSize,lineHeight:1.05,fontWeight:650,letterSpacing:'-.06em',textWrap:'balance',overflowWrap:'anywhere'}}><Words text={scene.headline} emphasis={scene.emphasis} accent={accent} frame={frame} fps={fps}/></div>
      {(scene.caption && (typeOnly || split)) && <div style={{fontSize:size(portrait?42:29),lineHeight:1.45,color:muted,marginTop:size(30),opacity:interpolate(frame,[12,24],[0,1],clamp)}}>{scene.caption}</div>}
      {(beat || end) && <div style={{width:size(90),height:size(7),background:accent,borderRadius:8,margin:`${size(38)}px auto 0`,transform:`scaleX(${enter})`,transformOrigin:'left'}}/>}
    </div>
    {!typeOnly && (image || clip) && <div style={{position:'absolute',left:width*(split?.41:.045),top:height*(portrait?.30:split?.17:.275),width:width*(split?.55:.91),height:height*(portrait?.53:split?.69:.64),overflow:'hidden',background:'#fff',borderRadius:size(22),border:`${size(1.5)}px solid ${dark?'#ffffff25':'#e9e3ed'}`,boxShadow:`0 ${size(30)}px ${size(65)}px #20102c18`,transform:`translateY(${(1-enter)*size(70)}px) scale(${.975+.025*enter})`}}>
      {clip ? <Freeze frame={playFrames-1} active={frame>=playFrames}><OffthreadVideo src={clip.src} trimBefore={Math.round(scene.clipStart*fps)} durationInFrames={Math.max(1,Math.floor((sourceEnd-scene.clipStart)*fps))} playbackRate={scene.playbackRate} muted pauseWhenBuffering style={mediaStyle}/></Freeze> : image && <Img src={image} style={mediaStyle}/>}
    </div>}
    {title && image && <div style={{position:'absolute',left:width*.24,top:height*.66,width:width*.52,height:height*.4,borderRadius:size(24),overflow:'hidden',background:'#fff',boxShadow:`0 ${size(25)}px ${size(80)}px #38225724`,border:'1px solid #e8e1ef',transform:`translateY(${(1-enter)*size(160)}px) rotate(-4deg)`}}><Img src={image} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${scene.zoom})`,transformOrigin:`${scene.focusX*100}% ${scene.focusY*100}%`}}/></div>}
    {end && storyboard.music && music && <div style={{position:'absolute',left:width*.08,width:width*.84,bottom:height*.055,textAlign:'center',fontSize:size(portrait?30:21),lineHeight:1.55,color:muted}}><div>Music: “{music.track.title}” · {music.track.artist} · incompetech.com</div><div>CC BY 4.0 · creativecommons.org/licenses/by/4.0</div><div>Excerpt, fades and volume adjusted</div></div>}
    <div style={{position:'absolute',left:0,bottom:0,height:size(4),width:`${100*(index+(frame+1)/sceneFrames)/storyboard.scenes.length}%`,background:accent}}/>
  </AbsoluteFill>;
}
