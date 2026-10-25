import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import crypto from 'node:crypto';
import { decodeMonoWav, audioAlignment } from './pcm';
import type { PreparedMusic } from './music-catalog';
import { filmTiming } from './rhythm';
import type { AddressInfo } from 'node:net';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill, makeCancelSignal, getVideoMetadata, RenderInternals } from '@remotion/renderer';
import { chromium } from 'playwright';
import { ROOT_DIR } from '../data-directory';
import { FPS, validateStoryboardAssets, type CaptureAsset, type ClipAsset, type Storyboard } from './schema';
import type { FilmProps } from '../../video/product-film';

export async function renderProductVideo(storyboard: Storyboard, assets: CaptureAsset[], directory: string, report: (message: string, progress: number) => void = () => {}, music?: PreparedMusic, clips: ClipAsset[] = []) {
  validateStoryboardAssets(storyboard, assets, clips);
  if (storyboard.music && storyboard.music.trackId !== music?.track.id) throw new Error('The selected soundtrack has not been prepared.');
  const timing = filmTiming(storyboard, music);
  report('Bundling motion scenes', 2);
  const bundleDir = path.join(directory, 'bundle');
  const bundlePath = await bundle({ entryPoint: path.join(ROOT_DIR, 'src/video/root.tsx'), outDir: bundleDir, publicDir: null });
  // Use an explicit IPv4 ephemeral port: localhost may resolve to Ola's IPv6 dev server.
  const server = http.createServer(async (request, response) => {
    try {
      const relative = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(bundlePath, relative);
      if (!file.startsWith(bundlePath + path.sep)) { response.writeHead(403).end(); return; }
      const bytes = await fs.readFile(file);
      response.setHeader('content-type', file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.mp3') ? 'audio/mpeg' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      response.end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const serveUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
  const images: Record<string, string> = {};
  for (const asset of assets) images[asset.id] = `data:image/png;base64,${(await fs.readFile(path.join(directory, asset.file))).toString('base64')}`;
  const font = await fs.readFile(path.join(ROOT_DIR, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'));
  let audioUrl: string | undefined;
  if (storyboard.music && music) {
    const bytes = await fs.readFile(path.join(directory, music.file));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== music.sha256) throw new Error('Soundtrack changed after beat analysis. Prepare the music again.');
    await fs.writeFile(path.join(bundleDir, 'soundtrack.mp3'), bytes); audioUrl = serveUrl + '/soundtrack.mp3';
  }
  const clipSources: NonNullable<FilmProps['clips']> = {};
  for (const clip of clips.filter(c => storyboard.scenes.some(s => s.clipId === c.id))) {
    if (!/^take-[a-zA-Z0-9_-]+\.mp4$/.test(clip.file)) throw new Error('Invalid clip filename.');
    const bytes = await fs.readFile(path.join(directory, clip.file));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== clip.sha256) throw new Error('Clean clip changed after capture. Capture it again.');
    await fs.writeFile(path.join(bundleDir, clip.file), bytes); clipSources[clip.id] = { src: serveUrl + '/' + clip.file, seconds: clip.seconds };
  }
  const inputProps: FilmProps = { storyboard, images, clips: clipSources, music, audioUrl, fontUrl: `data:font/woff2;base64,${font.toString('base64')}` };
  const browserExecutable = chromium.executablePath();
  const composition = await selectComposition({ serveUrl, id: 'ProductFilm', inputProps, browserExecutable });
  const { cancel, cancelSignal } = makeCancelSignal(); const deadline = setTimeout(cancel, 15 * 60000);
  try {
    await renderMedia({ composition, serveUrl, codec: 'h264', audioCodec: 'aac', outputLocation: path.join(directory, 'film.tmp.mp4'), inputProps, browserExecutable, concurrency: 2, disableSharedMemoryCapture: true, crf: 19, pixelFormat: 'yuv420p', cancelSignal, onProgress: ({ progress }) => report('Rendering MP4', 10 + Math.floor(progress * 85)) });
    await renderStill({ composition, serveUrl, output: path.join(directory, 'poster.png'), frame: timing.scenes[0].frames + 40, inputProps, browserExecutable });
    // Inspect actual encoded pixels, not only a separately-rendered poster.
    const sample = path.join(directory, 'encoded-check.png');
    const sampleFrame = timing.scenes[0].frames + 40;
    await RenderInternals.callFf({ bin: 'ffmpeg', args: ['-hide_banner', '-loglevel', 'error', '-ss', String(sampleFrame / FPS), '-i', path.join(directory, 'film.tmp.mp4'), '-frames:v', '1', '-y', sample], indent: false, logLevel: 'error', binariesDirectory: null, cancelSignal });
    const thumbnail = (file: string) => sharp(file).resize(480, 480, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const [expected, actual] = await Promise.all([thumbnail(path.join(directory, 'poster.png')), thumbnail(sample)]);
    let delta = 0; for (let i = 0; i < expected.length; i++) delta += Math.abs(expected[i] - actual[i]);
    const meanPixelError = delta / (expected.length * 255);
    const metadata = await getVideoMetadata(path.join(directory, 'film.tmp.mp4'));
    if (meanPixelError > .025 || metadata.width !== composition.width || metadata.height !== composition.height || (metadata.durationInSeconds === null || Math.abs(metadata.durationInSeconds - composition.durationInFrames / FPS) > .1)) throw new Error('Encoded video did not match the preview. Retry with a compatible Chromium renderer.');
    const clipChecks: { sceneId: string; frame: number; meanPixelError: number }[] = [];
    for (const [index, scene] of storyboard.scenes.entries()) {
      if (!scene.clipId) continue;
      const frame = timing.scenes[index].from + Math.floor(Math.min(timing.scenes[index].frames - 1, (((scene.clipEnd ?? clips.find(c => c.id === scene.clipId)!.seconds) - scene.clipStart) / scene.playbackRate) * FPS * .55));
      const expectedFile = path.join(directory, `clip-check-${index}-expected.png`), actualFile = path.join(directory, `clip-check-${index}-encoded.png`);
      await renderStill({ composition, serveUrl, output: expectedFile, frame, inputProps, browserExecutable });
      await RenderInternals.callFf({ bin: 'ffmpeg', args: ['-hide_banner', '-loglevel', 'error', '-ss', String(frame / FPS), '-i', path.join(directory, 'film.tmp.mp4'), '-frames:v', '1', '-y', actualFile], indent: false, logLevel: 'error', binariesDirectory: null, cancelSignal });
      const [wanted, got] = await Promise.all([thumbnail(expectedFile), thumbnail(actualFile)]); let error = 0;
      for (let n = 0; n < wanted.length; n++) error += Math.abs(wanted[n] - got[n]);
      const meanPixelError = error / (wanted.length * 255); clipChecks.push({ sceneId: scene.id, frame, meanPixelError });
      if (meanPixelError > .025) throw new Error('An encoded action clip does not match its preview. Retry with a compatible renderer.');
    }
    let audioRms: number | undefined; let audioSync: { lagMs: number; correlation: number } | undefined;
    if (storyboard.music) {
      if (!metadata.audioCodec) throw new Error('The exported video is missing its soundtrack.');
      const probe = path.join(directory, 'audio-check.wav'); const sourceProbe = path.join(directory, 'audio-source-check.wav');
      try {
        await RenderInternals.callFf({ bin: 'ffmpeg', args: ['-hide_banner', '-loglevel', 'error', '-ss', '2', '-i', path.join(directory, 'film.tmp.mp4'), '-t', '2', '-vn', '-ac', '1', '-ar', '8000', '-c:a', 'pcm_s16le', '-f', 'wav', '-y', probe], indent: false, logLevel: 'error', binariesDirectory: null, cancelSignal });
        const { samples } = decodeMonoWav(await fs.readFile(probe)); let sum = 0; for (const sample of samples) sum += sample * sample; audioRms = Math.sqrt(sum / samples.length);
        if (!Number.isFinite(audioRms) || (storyboard.music.volume > .01 && audioRms < .0001)) throw new Error('The exported soundtrack is unexpectedly silent.');
        if (storyboard.music.volume > .01 && music) {
          await RenderInternals.callFf({ bin: 'ffmpeg', args: ['-hide_banner', '-loglevel', 'error', '-ss', String(2 + timing.trimBefore / FPS), '-i', path.join(directory, music.file), '-t', '2', '-vn', '-ac', '1', '-ar', '8000', '-c:a', 'pcm_s16le', '-f', 'wav', '-y', sourceProbe], indent: false, logLevel: 'error', binariesDirectory: null, cancelSignal });
          audioSync = audioAlignment(decodeMonoWav(await fs.readFile(sourceProbe)).samples, samples, 8000);
          if (Math.abs(audioSync.lagMs) > 40 || audioSync.correlation < .8) throw new Error('The encoded soundtrack is out of sync. Retry the render.');
        }
      } finally { await fs.rm(probe, { force: true }); await fs.rm(sourceProbe, { force: true }); }
    }
    await fs.writeFile(path.join(directory, 'render-quality.json'), JSON.stringify({ meanPixelError, sampleFrame, metadata, clipChecks, audioRms, audioSync, maxCutErrorMs: timing.maxCutErrorMs, sceneFrames: timing.scenes }, null, 2));
    await fs.rename(path.join(directory, 'film.tmp.mp4'), path.join(directory, 'film.mp4'));
    await fs.writeFile(path.join(directory, 'storyboard.json'), JSON.stringify({ storyboard, assets, clips, music: storyboard.music ? music : undefined, timing }, null, 2));
  } finally { clearTimeout(deadline); }
  } finally { server.closeAllConnections(); server.close(); await fs.rm(bundleDir, { recursive: true, force: true }); }
}
