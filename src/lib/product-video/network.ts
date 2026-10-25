import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import ipaddr from 'ipaddr.js';

export function publicAddress(address: string) {
  try { const parsed = ipaddr.process(address); return parsed.range() === 'unicast'; } catch { return false; }
}
export function publicUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && url.port !== '80' && url.port !== '443')) throw new Error('Use a public HTTP(S) URL on port 80 or 443, without credentials.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || (net.isIP(host) && !publicAddress(host))) throw new Error('Private and local network URLs cannot be captured.');
  return url;
}
export async function resolvePublic(host: string) {
  const addresses = await dns.lookup(host.replace(/^\[|\]$/g, ''), { all: true });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Destination resolves to a private or reserved address.');
  return addresses[0];
}
/** DNS is checked and the socket is pinned to that exact IP, including redirects and subresources. */
export async function captureProxy() {
  const sockets = new Set<net.Socket>();
  const server = http.createServer(async (request, response) => {
    try {
      const url = publicUrl(request.url ?? '');
      if (url.protocol !== 'http:') throw new Error('HTTPS requires a tunnel.');
      const target = await resolvePublic(url.hostname);
      const outgoing = http.request({ host: target.address, family: target.family, port: Number(url.port || 80), path: url.pathname + url.search, method: request.method, headers: { ...request.headers, host: url.host }, timeout: 20000 }, incoming => {
        response.writeHead(incoming.statusCode ?? 502, incoming.headers); incoming.pipe(response);
      });
      outgoing.on('timeout', () => outgoing.destroy());
      outgoing.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      request.pipe(outgoing);
    } catch { response.writeHead(403); response.end('Public destinations only.'); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('connect', async (request, client, head) => {
    try {
      const url = publicUrl(`https://${request.url}`);
      const target = await resolvePublic(url.hostname);
      const remote = net.connect({ host: target.address, family: target.family, port: Number(url.port || 443) });
      sockets.add(remote); remote.on('close', () => sockets.delete(remote));
      remote.setTimeout(30000, () => remote.destroy());
      remote.on('connect', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) remote.write(head); client.pipe(remote); remote.pipe(client); });
      remote.on('error', () => client.destroy()); client.on('error', () => remote.destroy()); client.on('close', () => remote.destroy());
    } catch { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = (server.address() as net.AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, close: () => { for (const socket of sockets) socket.destroy(); server.close(); } };
}
