import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { defaultModelSettings, type ModelSettings } from './model-routing';

export type WorkerSnapshot = {
  id: string; kind: 'ola' | 'comparison'; startedAt: string; models: ModelSettings;
  concurrency: number; capabilities: string[];
};
export function startWorkerHeartbeat(database: DatabaseSync, kind: WorkerSnapshot['kind'], options: { concurrency: number; capabilities: string[] }) {
  database.exec('CREATE TABLE IF NOT EXISTS worker_heartbeats(id TEXT PRIMARY KEY,kind TEXT NOT NULL,last_seen TEXT NOT NULL,status TEXT NOT NULL,record_json TEXT NOT NULL)');
  const snapshot: WorkerSnapshot = { id: crypto.randomUUID(), kind, startedAt: new Date().toISOString(), models: defaultModelSettings(), ...options };
  const write = (status: string) => database.prepare('INSERT INTO worker_heartbeats VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,status=excluded.status').run(snapshot.id, kind, new Date().toISOString(), status, JSON.stringify(snapshot));
  write('running');
  const report = (status: string) => { try { write(status); } catch { process.stderr.write('Worker heartbeat could not be recorded.\n'); } };
  const timer = setInterval(() => report('running'), 3000); timer.unref();
  return () => { clearInterval(timer); report('stopped'); };
}
