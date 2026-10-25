import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { DATA_DIR } from '../data-directory';
import { publicUrl } from './network';

export const CredentialsSchema = z.object({ username: z.string().trim().min(1).max(320), password: z.string().min(1).max(1000) });
export type LoginCredentials = z.infer<typeof CredentialsSchema> & { origin: string; url: string };
function paths(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid video ID.');
  const directory = path.join(DATA_DIR, 'video-secrets'); fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return { directory, key: path.join(directory, '.key'), file: path.join(directory, `${id}.json`) };
}
function key(filename: string) {
  try { fs.writeFileSync(filename, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  return fs.readFileSync(filename);
}
/** One-use encrypted handoff between the web process and worker. Never part of VideoRecord. */
export function putCredentials(id: string, loginUrl: string, value: unknown) {
  const url = publicUrl(loginUrl); if (url.protocol !== 'https:') throw new Error('Credentials require an HTTPS login page.');
  const credentials = CredentialsSchema.parse(value); const files = paths(id);
  purgeExpiredCredentials();
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key(files.key), iv); cipher.setAAD(Buffer.from(id));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ ...credentials, url: url.href, origin: url.origin, expires: Date.now() + 15 * 60_000 })), cipher.final()]);
  fs.writeFileSync(files.file, JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') }), { mode: 0o600 });
}
export function takeCredentials(id: string): LoginCredentials | undefined {
  const files = paths(id); let raw: string;
  try { raw = fs.readFileSync(files.file, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
  fs.rmSync(files.file, { force: true });
  const envelope = JSON.parse(raw); const decipher = crypto.createDecipheriv('aes-256-gcm', key(files.key), Buffer.from(envelope.iv, 'base64')); decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString());
  if (value.expires < Date.now()) throw new Error('Login credentials expired. Retry and provide them again.');
  return { ...CredentialsSchema.parse(value), url: value.url, origin: value.origin };
}
export function clearCredentials(id: string) { fs.rmSync(paths(id).file, { force: true }); }

export function purgeExpiredCredentials() {
  const directory = paths('cleanup').directory;
  for (const file of fs.readdirSync(directory).filter(f => f.endsWith('.json'))) {
    const target = path.join(directory, file);
    try { if (Date.now() - fs.statSync(target).mtimeMs > 15 * 60_000) fs.rmSync(target, { force: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
