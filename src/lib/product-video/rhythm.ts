import type { Storyboard } from './schema';
import type { PreparedMusic } from './music-catalog';
export type FilmTiming = { scenes: { from: number; frames: number }[]; durationInFrames: number; beatFrames: number[]; trimBefore: number; maxCutErrorMs: number };
/** Both Player and exporter use this exact integer-frame timeline. Original editable durations stay intact. */
export function filmTiming(board: Storyboard, music?: PreparedMusic, fps = 30): FilmTiming {
  const active = board.music && music?.track.id === board.music.trackId ? music : undefined;
  const trimBefore = active ? Math.round(active.beats[0] * fps) : 0;
  const beatFrames = active ? [...new Set(active.beats.map(t => Math.round(t * fps) - trimBefore).filter(f => f >= 0))] : [];
  let from = 0; let maxCutErrorMs = 0;
  const scenes = board.scenes.map((scene, index) => {
    const actionFrames = scene.clipId && scene.clipEnd ? Math.ceil((scene.clipEnd - scene.clipStart) / scene.playbackRate * fps) : 0;
    let frames = Math.max(actionFrames, Math.round(scene.seconds * fps));
    if (active) {
      const min = Math.max(actionFrames, (index === board.scenes.length - 1 ? 4 : 2) * fps);
      const candidates = beatFrames.filter(f => f - from >= min && f - from <= 10 * fps);
      if (!candidates.length) throw new Error('The analysed music is too short for this storyboard. Choose another track or shorten the film.');
      const desired = from + Math.max(min, frames);
      const end = candidates.reduce((best, f) => Math.abs(f - desired) < Math.abs(best - desired) ? f : best);
      frames = end - from;
      const actualSourceTime = (end + trimBefore) / fps;
      maxCutErrorMs = Math.max(maxCutErrorMs, Math.min(...active.beats.map(b => Math.abs(b - actualSourceTime))) * 1000);
    }
    const timing = { from, frames }; from += frames; return timing;
  });
  return { scenes, durationInFrames: from, beatFrames: beatFrames.filter(f => f < from), trimBefore, maxCutErrorMs };
}
/** A small, fast emphasis on the beat; no full-screen flashing. */
export function beatPulse(frame: number, beats: number[]) {
  let previous = -100;
  for (const beat of beats) { if (beat > frame) break; previous = beat; }
  const elapsed = frame - previous; return elapsed >= 0 && elapsed < 7 ? Math.pow(1 - elapsed / 7, 2) : 0;
}
export function soundtrackVolume(frame: number, totalFrames: number, volume: number) { return volume * Math.min(1, (frame + 1) / 8, Math.max(0, (totalFrames - 1 - frame) / 24)); }
