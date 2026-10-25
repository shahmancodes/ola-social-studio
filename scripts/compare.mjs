import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadEnvConfig } = require('@next/env'); loadEnvConfig(root);
const lab = path.resolve(process.env.COMPARISON_DATA_DIR || path.join(root, '.data/comparison'));
const env = { ...process.env, OLA_ROOT_DIR: root, COMPARISON_DATA_DIR: lab, COMPARISON_SOURCE_DATA_DIR: path.resolve(process.env.COMPARISON_SOURCE_DATA_DIR || process.env.OLA_DATA_DIR || path.join(root,'.data')), OLA_DATA_DIR: path.join(lab, 'ola'), OLA_DISABLE_MESSAGING: '1' };
for (const key of Object.keys(env)) if (key.startsWith('WHATSAPP_')) delete env[key];
const children = [
  spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', 'apps/comparison', '--webpack', '-H', '127.0.0.1', '-p', '3100'], { cwd: root, env, stdio: 'inherit', detached: process.platform !== 'win32' }),
  // Pin a worker to the code it started with. File-watch restarts can interrupt active generation.
  // Restart the lab between attempts after changing pipeline code.
  spawn(process.execPath, [...(env.COMPARISON_WORKER_WATCH === '1' ? ['--watch', '--watch-preserve-output'] : []), '--import', 'tsx', 'src/comparison/worker.ts'], { cwd: root, env, stdio: 'inherit', detached: process.platform !== 'win32' }),
];
let stopping=false;
function kill(child,signal){if(child.exitCode!==null)return;try{if(process.platform!=='win32')process.kill(-child.pid,signal);else child.kill(signal);}catch(error){if(error.code!=='ESRCH')throw error;}}
function stop(signal='SIGTERM') { if(stopping)return; stopping=true; for(const child of children)kill(child,signal); setTimeout(()=>{for(const child of children)kill(child,'SIGKILL');},4000).unref(); }
process.on('SIGINT',()=>stop('SIGINT')); process.on('SIGTERM',()=>stop());
for(const child of children){ child.on('error', e=>{console.error(e);process.exitCode=1;stop();}); child.on('exit',(code)=>{if(!stopping){process.exitCode=code||1;stop();}}); }
