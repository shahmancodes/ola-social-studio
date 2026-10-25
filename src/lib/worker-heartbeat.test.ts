import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { startWorkerHeartbeat } from './worker-heartbeat';
import { defaultModelSettings } from './model-routing';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('worker runtime reporting', () => {
  it('captures safe model settings at startup, maintains a heartbeat, and marks a clean stop', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T05:00:00Z'));
    vi.stubEnv('AI_GATEWAY_API_KEY', 'private-key-never-export'); vi.stubEnv('VERCEL_AI_MODEL', 'runtime/model');
    const db = new DatabaseSync(':memory:');
    const stop = startWorkerHeartbeat(db, 'ola', { concurrency: 1, capabilities: ['content-jobs'] });
    try {
      const row = () => db.prepare('SELECT * FROM worker_heartbeats').get()!;
      expect(row().status).toBe('running'); expect(JSON.parse(String(row().record_json)).models.vercel).toEqual({ configured: true, model: 'runtime/model' });
      expect(String(row().record_json)).not.toContain('private-key-never-export');
      vi.advanceTimersByTime(3000); expect(row().last_seen).toBe('2026-10-25T05:00:03.000Z');
      stop(); expect(row().status).toBe('stopped');
      vi.advanceTimersByTime(6000); expect(row().last_seen).toBe('2026-10-25T05:00:03.000Z');
    } finally { stop(); db.close(); }
  });
  it('uses a distinct vision model when configured, otherwise the text model', () => {
    expect(defaultModelSettings({ OPENROUTER_MODEL: 'text' }).openrouter.visionModel).toBe('text');
    expect(defaultModelSettings({ OPENROUTER_MODEL: 'text', OPENROUTER_VISION_MODEL: 'vision' }).openrouter.visionModel).toBe('vision');
  });
  it('does not crash job processing when a later heartbeat cannot be saved', () => {
    vi.useFakeTimers();
    const warning = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const db = new DatabaseSync(':memory:');
    const stop = startWorkerHeartbeat(db, 'ola', { concurrency: 1, capabilities: [] }); db.close();
    try { expect(() => vi.advanceTimersByTime(3000)).not.toThrow(); expect(() => stop()).not.toThrow(); expect(warning).toHaveBeenCalled(); }
    finally { stop(); warning.mockRestore(); }
  });
});
