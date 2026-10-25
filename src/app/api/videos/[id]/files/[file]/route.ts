import fs from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { videoAccess, videoError } from '@/lib/product-video/api';
import { videoDirectory } from '@/lib/product-video/store';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string; file: string }> }) {
  try {
    const { id, file } = await context.params; const video = await videoAccess(id);
    const asset = video.assets.find(a => a.file === file) || video.clips?.find(c => c.file === file);
    const output = ['film.mp4', 'poster.png', 'storyboard.json'].includes(file);
    const soundtrack = !!video.music && [video.music.file, `music-${video.music.track.id}-credits.txt`, `music-${video.music.track.id}-analysis.json`, ...(video.music.discovery ? [`music-${video.music.track.id}-license.json`] : [])].includes(file) && !['scoring', 'music_queued'].includes(video.status);
    const evidence = !!video.storyboard && (file === video.recording?.file || (file === 'discovery.json' && !!video.discovery) || (file === 'direction.json' && !!video.direction));
    if (!asset && !evidence && !soundtrack && !(output && video.status === 'ready' && video.renderedRevision === video.revision)) return new Response('File unavailable', { status: 404 });
    const filename = path.join(videoDirectory(id), file); const { size } = await stat(filename);
    const headers: Record<string, string> = { 'content-type': file.endsWith('.mp3') ? 'audio/mpeg' : file.endsWith('.txt') ? 'text/plain; charset=utf-8' : file.endsWith('.webm') ? 'video/webm' : file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.json') ? 'application/json' : 'image/png', 'cache-control': 'private, no-store', 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff' };
    if (new URL(request.url).searchParams.has('download')) headers['content-disposition'] = `attachment; filename="ola-${file}"`;
    let start = 0; let end = size - 1; let status = 200;
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2])); end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
      status = 206; headers['content-range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['content-length'] = String(end - start + 1);
    return new Response(Readable.toWeb(fs.createReadStream(filename, { start, end })) as ReadableStream, { status, headers });
  } catch (e) { return videoError(e); }
}
