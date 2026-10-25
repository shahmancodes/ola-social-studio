import { describe, expect, it } from 'vitest';
import { detectBeats } from './music';
import { audioAlignment } from './pcm';
import { MUSIC_CATALOG, musicTrack, type PreparedMusic } from './music-catalog';
import { filmTiming, beatPulse, soundtrackVolume } from './rhythm';
import { StoryboardSchema } from './schema';
const music: PreparedMusic = { track: musicTrack('carefree'), file: 'music-carefree.mp3', sha256: 'test', analyzedSeconds: 120, bpm: 120, beats: Array.from({ length: 240 }, (_, i) => .123 + i * .5), onsetAgreement: 1, analyzedAt: new Date().toISOString() };
const board = StoryboardSchema.parse({ brand: 'Demo', format: 'landscape', theme: 'light', accent: '#123456', scenes: ['title', 'showcase', 'cta'].map((kind, i) => ({ id: String(i), kind, headline: 'Show the feature', seconds: i === 1 ? 5.2 : 3.1 })) });
describe('soundtrack timing', () => {
  it('detects actual shifted drum beats, including phase, instead of assuming a BPM grid', () => {
    const samples = new Float32Array(44100 * 15);
    const expected = Array.from({ length: 28 }, (_, i) => .27 + i * .5);
    for (const beat of expected) { const offset = Math.round(beat * 44100); for (let i = 0; i < 3500; i++) samples[offset + i] += Math.exp(-i / 550) * (Math.sin(i * 2 * Math.PI * 100 / 44100) + .2 * Math.sin(i * 2 * Math.PI * 2100 / 44100)); }
    const result = detectBeats(samples, 120);
    expect(result.bpm).toBeCloseTo(120, 0); expect(result.onsetAgreement).toBeGreaterThan(.8);
    const errors = result.beats.slice(2, -2).map(beat => Math.min(...expected.map(t => Math.abs(t - beat))));
    expect(Math.max(...errors)).toBeLessThan(.06);
  });
  it('fails clearly on silent audio', () => { expect(() => detectBeats(new Float32Array(44100 * 10))).toThrow('silent'); });
  it('aligns every scene cut to a detected source beat within half a video frame', () => {
    const timing = filmTiming({ ...board, music: { trackId: 'carefree', volume: .3 } }, music);
    expect(timing.trimBefore).toBe(4); expect(timing.maxCutErrorMs).toBeLessThanOrEqual(1000 / 60);
    for (const scene of timing.scenes) { expect(scene.frames).toBeGreaterThanOrEqual(60); expect(scene.frames).toBeLessThanOrEqual(300); expect(timing.beatFrames).toContain(scene.from); }
    expect(timing.scenes.at(-1)!.frames).toBeGreaterThanOrEqual(120);
    expect(timing.scenes[1].from).toBe(timing.scenes[0].frames);
  });
  it('retains original timing when music is removed and recomputes after scene edits', () => {
    expect(filmTiming(board, music).durationInFrames).toBe(342);
    const scored = { ...board, music: { trackId: 'carefree', volume: .3 } };
    const before = filmTiming(scored, music); const changed = structuredClone(scored); changed.scenes[1].seconds = 7;
    const after = filmTiming(changed, music); expect(after.durationInFrames).toBeGreaterThan(before.durationInFrames); expect(after.maxCutErrorMs).toBeLessThan(17);
  });
  it('does not invent beats beyond the analysed audio', () => { expect(() => filmTiming({ ...board, music: { trackId: 'carefree', volume: .3 } }, { ...music, beats: [.123, .623] })).toThrow('too short'); });
  it('places motion accents exactly on beats and fades the audio at the ends', () => {
    expect(beatPulse(15, [0, 15, 30])).toBe(1); expect(beatPulse(14, [0, 15, 30])).toBe(0); expect(beatPulse(18, [0, 15, 30])).toBeGreaterThan(0);
    expect(soundtrackVolume(30, 600, .4)).toBe(.4); expect(soundtrackVolume(0, 600, .4)).toBeLessThan(.1); expect(soundtrackVolume(599, 600, .4)).toBe(0);
  });
  it('detects a timing shift in the encoded audio independently of volume', () => {
    const expected = new Float32Array(8000); const shifted = new Float32Array(8000);
    for (let i = 0; i < expected.length; i++) expected[i] = Math.sin(i * i * .0002) * .8;
    for (let i = 160; i < shifted.length; i++) shifted[i] = expected[i - 160] * .3;
    const result = audioAlignment(expected, shifted, 8000); expect(result.lagMs).toBe(20); expect(result.correlation).toBeGreaterThan(.99);
  });
  it('only accepts reviewed catalog tracks with attribution and a source', () => {
    expect(() => musicTrack('https://localhost/private.mp3')).toThrow('licensed');
    for (const track of MUSIC_CATALOG) { expect(track.license).toBe('CC BY 4.0'); expect(track.attribution).toContain(track.artist); expect(track.sourceUrl).toMatch(/^https:\/\/incompetech.com\//); }
  });
});
