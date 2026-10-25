import fs from 'node:fs/promises';
import { prepareMusic } from './music';
import { discoverMusic } from './music-discovery';
import { filmTiming } from './rhythm';
import { withAiRun } from '../ai-execution';
import { takeCredentials, clearCredentials } from './credentials';
import { LoginRequired } from './discovery';
import path from 'node:path';
import { captureProduct } from './capture';
import { renderProductVideo } from './render';
import { directProductVideo } from './director';
import { changeVideo, claimVideo, renewVideoLease, videoDirectory, videoWorkerSeen } from './store';

export async function runVideoJob() {
  const job = claimVideo(); if (!job) return false;
  const heartbeat = setInterval(() => { renewVideoLease(job.id); videoWorkerSeen(); }, 10000);
  let lastProgress = -1;
  const report = (message: string, progress: number) => {
    if (progress === lastProgress) return; lastProgress = progress;
    changeVideo(job.id, job.revision, [job.status], video => ({ ...video, message, progress }));
  };
  try {
    const directory = videoDirectory(job.id);
    if (job.status === 'capturing') {
      const result = await withAiRun({ companyId: job.companyId, jobId: job.id, stage: 'product-video-discovery' }, () => captureProduct(job.input, directory, report, { credentials: takeCredentials(job.id) }));
      const { storyboard, direction } = await withAiRun({ companyId: job.companyId, jobId: job.id, stage: 'product-video-direction' }, () => directProductVideo(job.input, result.assets, result.clips, directory, report));
      await fs.writeFile(path.join(directory, 'captures.json'), JSON.stringify(result, null, 2));
      changeVideo(job.id, job.revision, ['capturing'], video => ({ ...video, ...result, storyboard, direction, login: undefined, status: 'draft', message: 'Ready to edit and preview', progress: 100 }));
    } else if (job.status === 'scoring') {
      if (!job.storyboard || !job.musicRequest) throw new Error('Missing soundtrack selection.');
      const request = job.musicRequest;
      const music = 'mode' in request
        ? await withAiRun({ companyId: job.companyId, jobId: job.id, stage: 'product-video-music' }, () => discoverMusic({ input: job.input, storyboard: job.storyboard!, directory, brief: request.brief, excludeId: job.music?.track.id, volume: request.volume, report }))
        : await prepareMusic(request.trackId, directory, report);
      const storyboard = { ...job.storyboard, music: { trackId: music.track.id, volume: request.volume } }; filmTiming(storyboard, music);
      changeVideo(job.id, job.revision, ['scoring'], video => ({ ...video, music, musicRequest: undefined, storyboard, status: 'draft', message: 'Music added · scene cuts follow the beat', progress: 100 }));
    } else {
      if (!job.storyboard) throw new Error('Missing storyboard.');
      await renderProductVideo(job.storyboard, job.assets, directory, report, job.music, job.clips);
      changeVideo(job.id, job.revision, ['rendering'], video => ({ ...video, status: 'ready', message: 'MP4 ready', renderedRevision: video.revision, progress: 100 }));
    }
  } catch (error) {
    if (error instanceof LoginRequired) changeVideo(job.id, job.revision, [job.status], video => ({ ...video, status: 'login_required', login: { url: error.url, origin: new URL(error.url).origin }, message: 'Login needed to continue', error: error.message, progress: 0 }));
    else changeVideo(job.id, job.revision, [job.status], video => ({ ...video, status: 'failed', message: 'Needs attention', error: error instanceof Error ? error.message.slice(0, 700) : 'Video processing failed.' }));
  } finally { clearInterval(heartbeat); clearCredentials(job.id); }
  return true;
}
