import env from '@next/env';
env.loadEnvConfig(process.cwd());
import fs from 'node:fs/promises';
import path from 'node:path';
import { VideoInputSchema } from '../src/lib/product-video/schema';
import { captureProduct } from '../src/lib/product-video/capture';
import { directProductVideo } from '../src/lib/product-video/director';
import { discoverMusic } from '../src/lib/product-video/music-discovery';
import { renderProductVideo } from '../src/lib/product-video/render';
import { withAiRun } from '../src/lib/ai-execution';
const directory = path.resolve('.data/product-video-directed/excalidraw');
const input = VideoInputSchema.parse({ url: 'https://excalidraw.com', feature: 'Draw two rectangles side by side and connect them with an arrow. Show how an idea becomes a clear diagram.', brand: 'Excalidraw', accent: '#6965db', cta: 'Make your next idea clear.' });
await fs.mkdir(directory, { recursive: true });
const report = (message: string, progress: number) => console.log(progress, message);
await withAiRun({ companyId: process.env.OLA_DEMO_COMPANY_ID, stage: 'product-video-directed-demo' }, async () => {
  const prior = process.argv.includes('--replay') ? JSON.parse(await fs.readFile(path.join(directory,'captures.json'),'utf8')) : undefined;
  const replayInput = prior ? {...input,steps:prior.discovery.recipe} : input;
  const captured = process.argv.includes('--reuse') || process.argv.includes('--render-only') ? JSON.parse(await fs.readFile(path.join(directory,'captures.json'),'utf8')) : await captureProduct(replayInput, directory, report);
  if(prior) captured.discovery = prior.discovery;
  await fs.writeFile(path.join(directory,'captures.json'),JSON.stringify({input,...captured},null,2));
  if (!captured.clips?.length) throw new Error('This demonstration needs real clean action clips: '+captured.warnings.join('; '));
  const directed = process.argv.includes('--render-only') ? JSON.parse(await fs.readFile(path.join(directory,'direction.json'),'utf8')) : await directProductVideo(input,captured.assets,captured.clips,directory,report);
  if(process.argv.includes('--capture-only')) {console.log(JSON.stringify(directed,null,2));return;}
  const music = await fs.readFile(path.join(directory,'music.json'),'utf8').then(JSON.parse).catch(() => discoverMusic({input,storyboard:directed.storyboard,directory,volume:.3,brief:'Modern, bright, creative instrumental with a clear groove',report}));
  await fs.writeFile(path.join(directory,'music.json'),JSON.stringify(music,null,2));
  const board={...directed.storyboard,music:{trackId:music.track.id,volume:.3}};
  await renderProductVideo(board,captured.assets,directory,report,music,captured.clips);
  console.log('Directed film ready:',path.join(directory,'film.mp4'));
});
