import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { VideoInputSchema, storyboardFromCaptures } from './schema';
let store: typeof import('./store'); let connection: ReturnType<typeof import('../platform-db')['db']>;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ola-video-test-')); const previous = process.env.OLA_DATA_DIR;
const input = VideoInputSchema.parse({ url: 'https://example.com', brand: 'Example', feature: 'See it work.' });
const asset = { id: 'capture-1', file: 'capture-1.png', url: input.url, label: 'See it work', title: 'Example', width: 1440, height: 1000, sha256: 'test', capturedAt: new Date().toISOString() };
beforeAll(async () => {
  process.env.OLA_DATA_DIR = directory; vi.resetModules();
  store = await import('./store'); connection = (await import('../platform-db')).db();
  connection.prepare("INSERT INTO companies(id,name,created_at) VALUES('company-a','A',?),('company-b','B',?)").run(new Date().toISOString(), new Date().toISOString());
});
afterAll(() => { connection?.close(); if (previous === undefined) delete process.env.OLA_DATA_DIR; else process.env.OLA_DATA_DIR = previous; fs.rmSync(directory, { recursive: true, force: true }); });
describe('durable video workflow', () => {
  it('isolates company listings and prevents stale edits or edits during a render', () => {
    const video = store.createVideo('company-a', input); expect(store.listVideos('company-b')).toEqual([]);
    const claimed = store.claimVideo()!; expect(claimed.id).toBe(video.id); expect(store.claimVideo()).toBeUndefined();
    const board = storyboardFromCaptures(input, [asset]);
    expect(() => store.editStoryboard(video.id, 1, board)).toThrow('busy');
    store.changeVideo(video.id, 1, ['capturing'], v => ({ ...v, assets: [asset], storyboard: board, status: 'draft' }));
    const edited = store.editStoryboard(video.id, 1, board); expect(edited.revision).toBe(2);
    expect(() => store.queueRender(video.id, 1)).toThrow('changed');
    store.queueRender(video.id, 2); expect(() => store.editStoryboard(video.id, 2, board)).toThrow('busy');
    expect(store.claimVideo()?.status).toBe('rendering');
    store.changeVideo(video.id, 2, ['rendering'], v => ({ ...v, status: 'ready', renderedRevision: 2 }));
    const changed = store.editStoryboard(video.id, 2, board); expect(changed.status).toBe('draft'); expect(changed.revision).not.toBe(changed.renderedRevision);
  });
  it('requires explicit retry after worker failure and enforces the queue limit', () => {
    const video = store.createVideo('company-b', input); store.claimVideo();
    connection.prepare("UPDATE product_videos SET lease_until='2000-01-01' WHERE id=?").run(video.id);
    expect(store.claimVideo()).toBeUndefined(); expect(store.getVideo(video.id).status).toBe('failed');
    store.retryCapture(video.id, 1); expect(store.getVideo(video.id).status).toBe('queued');
    store.createVideo('company-b', input); store.createVideo('company-b', input);
    expect(() => store.createVideo('company-b', input)).toThrow('Three videos');
  });
  it('rejects path traversal and unknown image references', () => {
    expect(() => store.videoDirectory('../other')).toThrow('Invalid');
    const video = store.createVideo('company-a', input);
    store.changeVideo(video.id, 1, ['queued'], v => ({ ...v, status: 'draft', assets: [asset] }));
    const board = storyboardFromCaptures(input, [asset]); board.scenes[1].assetId = 'someone-elses-image';
    expect(() => store.editStoryboard(video.id, 1, board)).toThrow('unavailable');
  });
  it('accepts credentials only for a paused login and never stores plaintext in the video', async () => {
    const video = store.createVideo('company-a', input);
    store.changeVideo(video.id, 1, ['queued'], v => ({ ...v, status: 'login_required', login: { url: 'https://example.com/login', origin: 'https://example.com' } }));
    const credentials = await import('./credentials');
    const resumed = store.resumeWithLogin(video.id, 1, { username: 'demo@example.com', password: 'test-private-password' });
    expect(resumed.status).toBe('queued'); expect(resumed.revision).toBe(2);
    expect(JSON.stringify(store.getVideo(video.id))).not.toContain('test-private-password');
    const raw = fs.readFileSync(path.join(directory, 'video-secrets', `${video.id}.json`), 'utf8'); expect(raw).not.toContain('test-private-password');
    expect(credentials.takeCredentials(video.id)?.password).toBe('test-private-password'); expect(credentials.takeCredentials(video.id)).toBeUndefined();
    expect(() => store.resumeWithLogin(video.id, 2, { username: 'x', password: 'y' })).toThrow('changed');
    credentials.putCredentials('expired-test', 'https://example.com/login', { username: 'x', password: 'y' });
    const expired = path.join(directory, 'video-secrets', 'expired-test.json'); fs.utimesSync(expired, new Date(0), new Date(0)); credentials.purgeExpiredCredentials(); expect(fs.existsSync(expired)).toBe(false);
    expect(() => credentials.putCredentials('http-test', 'http://example.com/login', { username: 'x', password: 'y' })).toThrow('HTTPS');
  });

  it('queues music for an existing draft and invalidates old renders; removing it restores silent editing', () => {
    const video = store.createVideo('company-a', input);
    const board = storyboardFromCaptures(input, [asset]);
    store.changeVideo(video.id, 1, ['queued'], v => ({ ...v, assets: [asset], storyboard: board, status: 'ready', renderedRevision: 1 }));
    expect(() => store.queueMusic(video.id, 1, { trackId: 'unapproved-url' })).toThrow('licensed');
    const queued = store.queueMusic(video.id, 1, { trackId: 'carefree', volume: .3 });
    expect(queued.status).toBe('music_queued'); expect(queued.revision).toBe(2); expect(queued.renderedRevision).toBe(1);
    expect(() => store.editStoryboard(video.id, 2, board)).toThrow('busy');
    store.changeVideo(video.id, 2, ['music_queued'], v => ({ ...v, status: 'failed' }));
    const removed = store.queueMusic(video.id, 2, null); expect(removed.status).toBe('draft'); expect(removed.musicRequest).toBeUndefined(); expect(removed.storyboard?.music).toBeUndefined();
    expect(() => store.editStoryboard(video.id, 3, { ...board, music: { trackId: 'carefree', volume: .3 } })).toThrow('Prepare');
  });

  it('queues automatic discovery with a bounded brief and rejects stale requests', () => {
    const video = store.createVideo('company-a', input);
    store.changeVideo(video.id, 1, ['queued'], v => ({ ...v, storyboard: storyboardFromCaptures(input, [asset]), assets: [asset], status: 'draft' }));
    const queued = store.queueMusic(video.id, 1, { mode: 'auto', brief: 'Modern, gentle electronic', volume: .4 });
    expect(queued.musicRequest).toEqual({ mode: 'auto', brief: 'Modern, gentle electronic', volume: .4 });
    expect(queued.status).toBe('music_queued');
    expect(() => store.queueMusic(video.id, 1, { mode: 'auto' })).toThrow('changed');
    expect(() => store.queueMusic(video.id, 2, { mode: 'auto', brief: 'x'.repeat(301) })).toThrow();
    store.changeVideo(video.id, 2, ['music_queued'], v => ({ ...v, status: 'failed' }));
  });

});
