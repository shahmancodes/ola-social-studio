import https from 'node:https';
import { resolvePublic } from './network';
export async function fetchMusicSource(url: string, maxBytes = 25 * 1024 * 1024, redirects = 0): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['incompetech.com', 'www.incompetech.com'].includes(parsed.hostname) || parsed.username || parsed.password || (parsed.port && parsed.port !== '443') || redirects > 3) throw new Error('Music download redirected outside its approved source.');
  const address = await resolvePublic(parsed.hostname);
  return new Promise((resolve, reject) => {
    const request = https.get(parsed, { family: address.family, lookup: (_host, _options, callback) => callback(null, address.address, address.family), headers: { 'user-agent': 'Ola product-video soundtrack download' } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) { response.resume(); fetchMusicSource(new URL(response.headers.location, url).href, maxBytes, redirects + 1).then(resolve, reject); return; }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`Music source returned HTTP ${response.statusCode}. Try again or choose another track.`)); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) { request.destroy(new Error('Music source exceeds the size limit.')); return; } chunks.push(chunk); });
      response.on('end', () => resolve(Buffer.concat(chunks))); response.on('error', reject);
    });
    const deadline = setTimeout(() => request.destroy(new Error('Music download timed out.')), 60000);
    request.on('close', () => clearTimeout(deadline)); request.on('error', reject);
  });
}
