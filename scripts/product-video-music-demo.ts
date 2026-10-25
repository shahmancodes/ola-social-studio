import fs from 'node:fs/promises';
import path from 'node:path';
import { prepareMusic } from '../src/lib/product-video/music';
import { renderProductVideo } from '../src/lib/product-video/render';
import { StoryboardSchema, storyboardFromCaptures, VideoInputSchema } from '../src/lib/product-video/schema';
import { filmTiming } from '../src/lib/product-video/rhythm';
const source = process.argv[2]; if (!source) throw new Error('Pass a captures.json file and optional track ID (carefree or wallpaper).');
const track = process.argv[3] || 'carefree';
const capture = JSON.parse(await fs.readFile(source, 'utf8'));
const directory = path.resolve('.data/product-video-music-demos', track); await fs.mkdir(directory, { recursive: true });
for (const asset of capture.assets) await fs.copyFile(path.resolve(path.dirname(source), asset.file), path.join(directory, asset.file));
const music = await prepareMusic(track, directory, console.log);
const base = capture.storyboard ?? storyboardFromCaptures(VideoInputSchema.parse(capture.input), capture.assets);
const storyboard = StoryboardSchema.parse({ ...base, music: { trackId: track, volume: .4 } });
const timing = filmTiming(storyboard, music);
await fs.writeFile(path.join(directory, 'music-demo.json'), JSON.stringify({ music, timing, storyboard }, null, 2));
console.log(JSON.stringify({ track, bpm: music.bpm, onsetAgreement: music.onsetAgreement, beats: music.beats.length, timing }, null, 2));
if (!process.argv.includes('--analyse-only')) {
  let last = -1;
  await renderProductVideo(storyboard, capture.assets, directory, (message, progress) => { if (progress % 10 === 0 && progress !== last) { console.log(progress, message); last = progress; } }, music);
  console.log('Rendered soundtrack film:', path.join(directory, 'film.mp4'));
}
