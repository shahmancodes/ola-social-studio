import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { runVideoJob } = await import('./lib/product-video/worker');
const { videoWorkerSeen } = await import('./lib/product-video/store');
let stopping = false;
process.on('SIGINT', () => { stopping = true; }); process.on('SIGTERM', () => { stopping = true; });
console.log('Product video worker started.');
const heartbeat = setInterval(videoWorkerSeen, 10000);
try { while (!stopping) { videoWorkerSeen(); const ran = await runVideoJob(); if (!ran) await new Promise(resolve => setTimeout(resolve, 1500)); } } finally { clearInterval(heartbeat); }
