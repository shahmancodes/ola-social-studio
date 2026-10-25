import path from 'node:path';
import { musicTrack } from './music-catalog';
import { filmTiming } from './rhythm';
import { putCredentials, clearCredentials, purgeExpiredCredentials } from './credentials';
import { db, id, now } from '../platform-db';
import { DATA_DIR } from '../data-directory';
import { VideoInputSchema, StoryboardSchema, MusicRequestSchema, validateStoryboardAssets, type VideoInput, type VideoRecord } from './schema';

function database() {
  const connection = db();
  connection.exec(`CREATE TABLE IF NOT EXISTS product_videos (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), status TEXT NOT NULL, revision INTEGER NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL, lease_until TEXT); CREATE INDEX IF NOT EXISTS product_videos_company ON product_videos(company_id,updated_at);`);
  return connection;
}
export function videoDirectory(videoId: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(videoId)) throw new Error('Invalid video ID.');
  return path.join(DATA_DIR, 'product-videos', videoId);
}
export function getVideo(videoId: string): VideoRecord {
  const row = database().prepare('SELECT data_json FROM product_videos WHERE id=?').get(videoId) as { data_json: string } | undefined;
  if (!row) throw new Error('Video not found.');
  return JSON.parse(row.data_json);
}
export function listVideos(companyId: string): VideoRecord[] {
  return (database().prepare('SELECT data_json FROM product_videos WHERE company_id=? ORDER BY updated_at DESC LIMIT 50').all(companyId) as { data_json: string }[]).map(row => JSON.parse(row.data_json));
}
export function createVideo(companyId: string, value: VideoInput) {
  const input = VideoInputSchema.parse(value); const time = now();
  const video: VideoRecord = { id: id(), companyId, input, status: 'queued', revision: 1, progress: 0, message: 'Waiting for the video worker', assets: [], warnings: [], createdAt: time, updatedAt: time };
  const result = database().prepare(`INSERT INTO product_videos(id,company_id,status,revision,data_json,updated_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM product_videos WHERE company_id=? AND status IN ('queued','capturing','render_queued','rendering','music_queued','scoring')) < 3`).run(video.id, companyId, video.status, video.revision, JSON.stringify(video), time, companyId);
  if (!result.changes) throw new Error('Three videos are already in progress. Wait for one to finish.');
  return video;
}
/** Compare and swap: an old editor or worker cannot overwrite a newer revision/status. */
export function changeVideo(videoId: string, revision: number, allowed: VideoRecord['status'][], edit: (video: VideoRecord) => VideoRecord) {
  const current = getVideo(videoId);
  if (current.revision !== revision || !allowed.includes(current.status)) throw new Error('Video changed or is busy. Reload before editing.');
  const next = { ...edit(structuredClone(current)), updatedAt: now() };
  const result = database().prepare('UPDATE product_videos SET status=?,revision=?,data_json=?,updated_at=? WHERE id=? AND revision=? AND status=?').run(next.status, next.revision, JSON.stringify(next), next.updatedAt, videoId, revision, current.status);
  if (!result.changes) throw new Error('Video changed. Reload before editing.');
  return next;
}
export function editStoryboard(videoId: string, revision: number, value: unknown) {
  const storyboard = StoryboardSchema.parse(value);
  return changeVideo(videoId, revision, ['draft', 'ready', 'failed'], video => {
    validateStoryboardAssets(storyboard, video.assets, video.clips);
    if (storyboard.music && storyboard.music.trackId !== video.music?.track.id) throw new Error('Prepare the soundtrack before using it.');
    filmTiming(storyboard, video.music);
    return { ...video, storyboard, revision: video.revision + 1, status: 'draft', error: undefined, message: 'Storyboard saved', progress: 100 };
  });
}
export function queueRender(videoId: string, revision: number) {
  return changeVideo(videoId, revision, ['draft', 'ready', 'failed'], video => {
    if (!video.storyboard) throw new Error('Capture the product first.');
    validateStoryboardAssets(video.storyboard, video.assets, video.clips);
    if (video.storyboard.music && video.storyboard.music.trackId !== video.music?.track.id) throw new Error('Prepare the soundtrack before rendering.');
    filmTiming(video.storyboard, video.music);
    return { ...video, status: 'render_queued', error: undefined, progress: 0, message: 'Waiting to render MP4' };
  });
}
export function queueMusic(videoId: string, revision: number, value: unknown) {
  const selection = value === null ? undefined : MusicRequestSchema.parse(value);
  if (selection && 'trackId' in selection) musicTrack(selection.trackId);
  return changeVideo(videoId, revision, ['draft', 'ready', 'failed'], video => {
    if (!video.storyboard) throw new Error('Capture the product before adding music.');
    if (!selection) return { ...video, music: undefined, musicRequest: undefined, storyboard: { ...video.storyboard, music: undefined }, revision: video.revision + 1, status: 'draft', error: undefined, message: 'Music removed', progress: 100 };
    const active = database().prepare("SELECT COUNT(*) AS count FROM product_videos WHERE company_id=? AND status IN ('queued','capturing','render_queued','rendering','music_queued','scoring')").get(video.companyId) as { count: number };
    if (active.count >= 3) throw new Error('Three videos are already in progress. Wait for one to finish.');
    return { ...video, musicRequest: selection, revision: video.revision + 1, status: 'music_queued', error: undefined, message: 'Waiting to analyse music and sync scenes', progress: 0 };
  });
}
export function retryCapture(videoId: string, revision: number) {
  return changeVideo(videoId, revision, ['failed'], video => {
    if (video.storyboard) throw new Error('Use Render MP4 to retry this export.');
    return { ...video, status: 'queued', error: undefined, progress: 0, message: 'Waiting to retry capture' };
  });
}
export function resumeWithLogin(videoId: string, revision: number, credentials: unknown) {
  const connection = database(); connection.exec('BEGIN IMMEDIATE');
  try {
    const video = getVideo(videoId);
    if (video.status !== 'login_required' || video.revision !== revision || !video.login) throw new Error('Video changed. Reload before submitting login.');
    const active = database().prepare("SELECT COUNT(*) AS count FROM product_videos WHERE company_id=? AND status IN ('queued','capturing','render_queued','rendering','music_queued','scoring')").get(video.companyId) as { count: number };
    if (active.count >= 3) throw new Error('Three videos are already in progress. Wait for one to finish.');
    putCredentials(videoId, video.login.url, credentials);
    try { const next = changeVideo(videoId, revision, ['login_required'], v => ({ ...v, status: 'queued', revision: v.revision + 1, error: undefined, progress: 0, message: 'Waiting to sign in and discover the feature' })); connection.exec('COMMIT'); return next; }
    catch (error) { clearCredentials(videoId); throw error; }
  } catch (error) { if (connection.isTransaction) connection.exec('ROLLBACK'); throw error; }
}
export function claimVideo(): VideoRecord | undefined {
  const connection = database();
  // Expired jobs require explicit retry; do not repeat interactions after a crash.
  const expired = connection.prepare("SELECT id FROM product_videos WHERE status IN ('capturing','rendering','scoring') AND lease_until < ?").all(now()) as { id: string }[];
  for (const { id: videoId } of expired) {
    const video = getVideo(videoId); clearCredentials(videoId);
    changeVideo(videoId, video.revision, [video.status], v => ({ ...v, status: 'failed', error: 'The video worker stopped. Retry capture or export.', message: 'Interrupted' }));
  }
  const row = connection.prepare("SELECT id FROM product_videos WHERE status IN ('queued','render_queued','music_queued') ORDER BY updated_at LIMIT 1").get() as { id: string } | undefined;
  if (!row) return;
  const current = getVideo(row.id); const status = current.status === 'queued' ? 'capturing' : current.status === 'music_queued' ? 'scoring' : 'rendering';
  const next: VideoRecord = { ...current, status, updatedAt: now(), message: status === 'capturing' ? 'Preparing capture' : status === 'scoring' ? 'Preparing soundtrack' : 'Preparing renderer' };
  const result = connection.prepare('UPDATE product_videos SET status=?,data_json=?,updated_at=?,lease_until=? WHERE id=? AND status=?').run(status, JSON.stringify(next), next.updatedAt, new Date(Date.now() + 90000).toISOString(), row.id, current.status);
  return result.changes ? next : undefined;
}
export function renewVideoLease(videoId: string) { database().prepare("UPDATE product_videos SET lease_until=? WHERE id=? AND status IN ('capturing','rendering','scoring')").run(new Date(Date.now() + 90000).toISOString(), videoId); }
export function videoWorkerSeen() {
  purgeExpiredCredentials();
  database().exec('CREATE TABLE IF NOT EXISTS product_video_worker (id INTEGER PRIMARY KEY, seen_at TEXT NOT NULL)');
  database().prepare('INSERT INTO product_video_worker(id,seen_at) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET seen_at=excluded.seen_at').run(now());
}
export function videoWorkerOnline() {
  database().exec('CREATE TABLE IF NOT EXISTS product_video_worker (id INTEGER PRIMARY KEY, seen_at TEXT NOT NULL)');
  const row = database().prepare('SELECT seen_at FROM product_video_worker WHERE id=1').get() as { seen_at: string } | undefined;
  return !!row && Date.now() - Date.parse(row.seen_at) < 30000;
}
