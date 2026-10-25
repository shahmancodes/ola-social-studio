import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import MusicTempo from 'music-tempo';
import { decodeMonoWav } from './pcm';
import { RenderInternals, makeCancelSignal } from '@remotion/renderer';
import { fetchMusicSource } from './music-source';
import { musicTrack, type MusicTrack, type PreparedMusic } from './music-catalog';

export function detectBeats(samples: Float32Array, bpmHint?: number) {
  if (samples.length < 44100 * 8 || samples.length > 44100 * 125) throw new Error('Beat analysis needs 8–125 seconds of audio.');
  let energy = 0; for (const sample of samples) energy += sample * sample;
  if (!Number.isFinite(energy) || Math.sqrt(energy / samples.length) < .001) throw new Error('The soundtrack is silent or too quiet to detect beats.');
  let result: MusicTempo;
  try { result = new MusicTempo(samples, { minBeatInterval: 60 / (bpmHint ? bpmHint * 1.3 : 180), maxBeatInterval: 60 / (bpmHint ? bpmHint * .7 : 60) }); }
  catch { throw new Error('Could not detect a reliable beat. Choose another track.'); }
  const beats = result.beats.filter(t => Number.isFinite(t) && t >= 0 && t < samples.length / 44100);
  const onsetAgreement = beats.filter(beat => result.events.some(onset => Math.abs(onset - beat) <= .08)).length / beats.length;
  if (beats.length < 12 || !Number.isFinite(Number(result.tempo)) || onsetAgreement < .45) throw new Error('The soundtrack has no sufficiently clear beat. Choose another track.');
  return { beats, bpm: Number(result.tempo), onsetAgreement };
}
export async function prepareMusic(trackId: string | MusicTrack, directory: string, report: (message: string, progress: number) => void = () => {}): Promise<PreparedMusic> {
  const track = typeof trackId === 'string' ? musicTrack(trackId) : trackId;
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(track.id)) throw new Error('Invalid music identifier.'); await fs.mkdir(directory, { recursive: true });
  report(`Downloading ${track.title}`, 10);
  const bytes = await fetchMusicSource(track.downloadUrl);
  const file = `music-${track.id}.mp3`, temporary = path.join(directory, `music-${crypto.randomUUID()}`);
  const { cancel, cancelSignal } = makeCancelSignal(); const timer = setTimeout(cancel, 60000);
  try {
    await fs.writeFile(temporary + '.mp3', bytes); report('Listening for beats and checking timing', 45);
    await RenderInternals.callFf({ bin: 'ffmpeg', args: ['-hide_banner', '-loglevel', 'error', '-i', temporary + '.mp3', '-t', '120', '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', '-f', 'wav', '-y', temporary + '.wav'], indent: false, logLevel: 'error', binariesDirectory: null, cancelSignal });
    const { samples } = decodeMonoWav(await fs.readFile(temporary + '.wav'));
    const analysis = detectBeats(samples, track.bpmHint);
    const prepared = { track, file, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), analyzedSeconds: samples.length / 44100, ...analysis, analyzedAt: new Date().toISOString() };
    await fs.rename(temporary + '.mp3', path.join(directory, file));
    await fs.writeFile(path.join(directory, `music-${track.id}-credits.txt`), `${track.attribution}\nSource: ${track.sourceUrl}\nDownloaded: ${prepared.analyzedAt}\nSHA-256: ${prepared.sha256}\n`);
    await fs.writeFile(path.join(directory, `music-${track.id}-analysis.json`), JSON.stringify(prepared, null, 2)); report('Soundtrack ready · scenes aligned to beats', 95); return prepared;
  } finally { clearTimeout(timer); await fs.rm(temporary + '.wav', { force: true }); await fs.rm(temporary + '.mp3', { force: true }); }
}
