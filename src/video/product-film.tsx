import { EditorialScene } from './editorial-scene';
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Html5Audio, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, delayRender, continueRender } from 'remotion';
import { type Storyboard, type Scene } from '../lib/product-video/schema';

import { filmTiming, beatPulse, soundtrackVolume } from '../lib/product-video/rhythm';
import type { PreparedMusic } from '../lib/product-video/music-catalog';

export type FilmProps = { storyboard: Storyboard; images: Record<string, string>; clips?: Record<string, { src: string; seconds: number }>; fontUrl?: string; music?: PreparedMusic; audioUrl?: string };
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
function FilmScene({ scene, storyboard, images, index, music, sceneFrames, beatFrames }: FilmProps & { scene: Scene; index: number; sceneFrames: number; beatFrames: number[] }) {
  const frame = useCurrentFrame(); const { fps, width, height } = useVideoConfig();
  const portrait = height > width; const square = height === width;
  const unit = width / 1920; const size = (n: number) => n * unit;
  const scored = !!storyboard.music && music?.track.id === storyboard.music.trackId;
  const hasCredits = scored && index === storyboard.scenes.length - 1;
  const pulse = scored ? beatPulse(frame, beatFrames) : 0;
  const enter = spring({ frame: frame + (scored ? 4 : 0), fps, config: { damping: 22, stiffness: 100, mass: .85 } });
  const seconds = sceneFrames;
  const fade = scored ? 1 : interpolate(frame, [0, 10, seconds - 10, seconds - 1], [0, 1, 1, 0], clamp);
  const dark = storyboard.theme === 'dark'; const fg = dark ? '#faf9ff' : '#19171e'; const muted = dark ? '#bbb6c9' : '#716b7b';
  const image = scene.assetId ? images[scene.assetId] : undefined;
  const title = scene.kind === 'title'; const end = scene.kind === 'cta'; const split = scene.kind === 'split' && !portrait && !square;
  const headlineSize = size(portrait ? 124 : square ? 114 : title || end ? 122 : split ? 100 : 76);
  const imageTop = portrait ? height * .34 : square ? height * .32 : split ? height * .20 : height * .31;
  const imageHeight = (portrait ? height * .42 : square ? height * .49 : split ? height * .58 : height * .57) * (hasCredits ? .82 : 1);
  const zoomStart = scored ? (beatFrames.find(f => f >= 10) ?? 12) : 12;
  const zoomEnd = scored ? (beatFrames.filter(f => f < seconds - 10).at(-1) ?? seconds - 18) : seconds - 18;
  const zoom = scene.kind === 'focus' ? interpolate(frame, [zoomStart, Math.max(zoomStart + 1, zoomEnd)], [1, scene.zoom], clamp) : interpolate(frame, [0, seconds], [1, Math.min(scene.zoom, 1.08)], clamp);
  return <AbsoluteFill style={{ opacity: fade, color: fg }}>
    <div style={{ position: 'absolute', left: size(100), top: height * .065, right: size(100), display: 'flex', justifyContent: 'space-between', fontSize: size(portrait ? 32 : 25), fontWeight: 650, letterSpacing: '-.02em' }}><span>{storyboard.brand}</span><span style={{ color: muted, fontWeight: 400 }}>{String(index + 1).padStart(2, '0')} / {String(storyboard.scenes.length).padStart(2, '0')}</span></div>
    <div style={{ position: 'absolute', left: split ? size(100) : width * .07, width: split ? width * .34 : width * .86, top: end ? height * .35 : title ? height * .20 : split ? height * .27 : height * .15, textAlign: split ? 'left' : 'center', transform: `translateY(${(1 - enter) * size(55)}px)`, zIndex: 3 }}>
      {end && <div style={{ color: storyboard.accent, fontSize: size(26), marginBottom: size(30), letterSpacing: '.16em', textTransform: 'uppercase' }}>Your next move</div>}
      <div style={{ fontSize: headlineSize, fontWeight: 650, lineHeight: 1.06, letterSpacing: '-.065em', textWrap: 'balance', overflowWrap: 'anywhere' }}>{scene.headline}</div>
      <div style={{ margin: `${size(24)}px ${split ? '0' : 'auto'}`, width: size(end ? 160 : 84), height: size(7), borderRadius: 10, background: storyboard.accent, transformOrigin: 'left', transform: `scaleX(${enter * (1 + pulse * .12)})` }} />
      {(split || end || title) && <div style={{ fontSize: size(portrait ? 40 : 29), color: muted, lineHeight: 1.45, marginTop: size(24), overflowWrap: 'anywhere' }}>{scene.caption}</div>}
    </div>
    {image && !end && <div style={{ position: 'absolute', left: split ? width * .44 : width * .085, top: title ? height * .53 : imageTop, width: split ? width * .53 : width * .83, height: title ? height * (hasCredits ? .28 : .46) : imageHeight, borderRadius: size(28), background: dark ? '#242129' : '#fff', boxShadow: `0 ${size(30)}px ${size(100)}px #00000020`, border: `1px solid ${dark ? '#ffffff20' : '#0000000d'}`, overflow: 'hidden', transform: `perspective(2000px) translateY(${(1-enter) * size(95)}px) rotateX(${(1-enter)*5}deg) scale(${.94 + .06 * enter})` }}>
      <div style={{ height: size(36), display: 'flex', alignItems: 'center', gap: size(7), paddingLeft: size(18), background: dark ? '#29262f' : '#f1eff4', position: 'absolute', top: 0, width: '100%', zIndex: 2 }}>{['#ef8f91','#e8c573','#8fc9ae'].map(c => <span key={c} style={{ width: size(8), height: size(8), borderRadius: '50%', background: c }} />)}</div>
      <div style={{ position: 'absolute', inset: `${size(36)}px 0 0`, overflow: 'hidden' }}><Img src={image} style={{ width: '100%', height: '100%', objectFit: 'contain', transformOrigin: `${scene.focusX * 100}% ${scene.focusY * 100}%`, transform: `scale(${zoom + pulse * .003})` }} /></div>
      {scene.kind === 'focus' && <div style={{ position: 'absolute', left: `${scene.focusX * 80 + 10}%`, top: `${scene.focusY * 70 + 15}%`, opacity: interpolate(frame, [20, 35], [0, 1], clamp), transform: `translate(${size(90)*(1-enter)}px, ${size(70)*(1-enter)}px)` }}><svg width={size(44)} height={size(54)} viewBox="0 0 44 54"><path d="M4 2 L4 43 L15 32 L23 50 L32 46 L24 29 L40 29 Z" fill={storyboard.accent} stroke="white" strokeWidth="3" /></svg></div>}
    </div>}
    {!title && !end && !split && <div style={{ position: 'absolute', bottom: height * (hasCredits ? .17 : .07), width: '100%', textAlign: 'center', fontSize: size(portrait ? 38 : 24), color: muted }}>{scene.caption}</div>}
    {scored && index === storyboard.scenes.length - 1 && music && <div style={{ position: 'absolute', bottom: height * .045, left: width * .07, width: width * .86, textAlign: 'center', fontSize: size(portrait ? 30 : 22), lineHeight: 1.5, color: muted }}>
      <div>Music: “{music.track.title}” · {music.track.artist} · incompetech.com</div>
      <div>CC BY 4.0 · creativecommons.org/licenses/by/4.0</div>
      <div>Excerpt, fades and volume adjusted</div>
    </div>}
    <div style={{ position: 'absolute', bottom: 0, left: 0, height: size(5), width: `${100 * frame / seconds}%`, background: storyboard.accent }} />
  </AbsoluteFill>;
}
export function ProductFilm(props: FilmProps) {
  const [fontHandle] = useState(() => delayRender('Loading video typography'));
  useEffect(() => {
    document.fonts.load('650 32px OlaFilm').then(() => continueRender(fontHandle)).catch(() => continueRender(fontHandle));
  }, [fontHandle, props.fontUrl]);
  const dark = props.storyboard.theme === 'dark'; const timing = filmTiming(props.storyboard, props.music);
  const scored = props.storyboard.music && props.music?.track.id === props.storyboard.music.trackId;
  return <AbsoluteFill style={{ background: dark ? '#111014' : '#fcfbfd', fontFamily: 'OlaFilm, Inter, Arial, sans-serif' }}>
    {props.fontUrl && <style>{`@font-face {font-family: OlaFilm; src: url("${props.fontUrl}"); font-weight: 100 900;}`}</style>}
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 85% 10%, ${props.storyboard.accent}18, transparent 55%)` }} />
    {scored && props.audioUrl && <Html5Audio src={props.audioUrl} trimBefore={timing.trimBefore} volume={frame => soundtrackVolume(frame, timing.durationInFrames, props.storyboard.music!.volume)} />}
    {props.storyboard.scenes.map((scene, index) => { const { from, frames } = timing.scenes[index]; return <Sequence key={scene.id} from={from} durationInFrames={frames}>{props.storyboard.treatment === 'editorial' ? <EditorialScene {...props} scene={scene} index={index} sceneFrames={frames} /> : <FilmScene {...props} scene={scene} index={index} sceneFrames={frames} beatFrames={timing.beatFrames.filter(f => f >= from && f < from + frames).map(f => f - from)} />}</Sequence>; })}
  </AbsoluteFill>;
}
