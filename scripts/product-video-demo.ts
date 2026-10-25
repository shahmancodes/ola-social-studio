import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
import fs from 'node:fs/promises';
import path from 'node:path';
import { VideoInputSchema, storyboardFromCaptures } from '../src/lib/product-video/schema';
import { captureProduct } from '../src/lib/product-video/capture';
import { renderProductVideo } from '../src/lib/product-video/render';
import { getVideoMetadata } from '@remotion/renderer';

const examples = [
  { name: 'wikipedia', input: { url: 'https://en.wikipedia.org/wiki/James_Webb_Space_Telescope', feature: 'Follow your curiosity.', brand: 'Wikipedia', accent: '#3366cc', steps: [
    { label: 'Start with a question', selector: '#firstHeading' },
    { label: 'Explore the full picture', selector: '.infobox' },
    { label: 'Go deeper into the details', actions: [{ type: 'scroll', y: 1700 }] },
  ] } },
  { name: 'excalidraw', input: { url: 'https://excalidraw.com', feature: 'Make room for your next idea.', brand: 'Excalidraw', accent: '#6965db' } },
  { name: 'photopea', input: { url: 'https://www.photopea.com', feature: 'Your next edit starts here.', brand: 'Photopea', accent: '#168b75', theme: 'dark' } },
];
const only = process.argv[2]?.startsWith('--') ? undefined : process.argv[2]; const automatic = process.argv.includes('--discover'); const summary: unknown[] = [];
for (const example of examples.filter(e => !only || e.name === only)) {
  const directory = path.resolve(automatic ? '.data/product-video-discovery' : '.data/product-video-demos', example.name); const start = Date.now();
  try {
    const recipePath = path.resolve('examples/product-video', `${example.name}.json`);
    const recipe = await fs.readFile(recipePath, 'utf8').then(JSON.parse).catch(() => example.input);
    const saved = process.argv.includes('--render-only') ? JSON.parse(await fs.readFile(path.join(directory, 'captures.json'), 'utf8')) : null;
    const descriptions: Record<string, string> = { excalidraw: 'Draw two rectangles and connect them with an arrow on the canvas.', wikipedia: 'Search Wikipedia for Saturn, open the article, and show its overview and contents.', photopea: 'Open the editor and create a new project with a custom 1200 by 800 pixel canvas.' };
    const input = VideoInputSchema.parse(saved?.input ?? (automatic ? { ...example.input, feature: descriptions[example.name], steps: [] } : recipe));
    const result = saved ?? await captureProduct(input, directory, (message, progress) => console.log(example.name, progress, message));
    const storyboard = storyboardFromCaptures(input, result.assets);
    await fs.writeFile(path.join(directory, 'captures.json'), JSON.stringify({ input, ...result, storyboard }, null, 2));
    if (process.argv.includes('--capture-only')) { summary.push({ name: example.name, status: 'passed', assets: result.assets.length, discovery: result.discovery, recording: result.recording, directory }); continue; }
    let lastProgress = -1;
    await renderProductVideo(storyboard, result.assets, directory, (message, progress) => { if (progress % 10 === 0 && progress !== lastProgress) { console.log(example.name, progress, message); lastProgress = progress; } });
    const metadata = await getVideoMetadata(path.join(directory, 'film.mp4'));
    summary.push({ name: example.name, status: 'passed', assets: result.assets.length, seconds: Math.round((Date.now() - start) / 1000), warnings: result.warnings, metadata, directory });
    console.log(example.name, 'COMPLETE', metadata);
  } catch (error) { summary.push({ name: example.name, status: 'failed', error: String(error) }); console.error(example.name, error); process.exitCode = 1; }
}
await fs.mkdir(automatic ? '.data/product-video-discovery' : '.data/product-video-demos', { recursive: true });
await fs.writeFile(path.resolve(automatic ? '.data/product-video-discovery' : '.data/product-video-demos', `report${only ? `-${only}` : ''}.json`), JSON.stringify(summary, null, 2));
