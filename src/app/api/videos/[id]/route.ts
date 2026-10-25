import { videoAccess, videoError } from '@/lib/product-video/api';
import { editStoryboard, queueRender, retryCapture, resumeWithLogin, queueMusic } from '@/lib/product-video/store';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ video: await videoAccess((await context.params).id) }, { headers: { 'cache-control': 'no-store' } }); } catch (e) { return videoError(e); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; await videoAccess(id);
    const body = await request.json(); if (!Number.isInteger(body.revision)) throw new Error('A revision is required.');
    const video = body.action === 'music' ? queueMusic(id, body.revision, body.music) : body.action === 'login' ? resumeWithLogin(id, body.revision, body.credentials) : body.action === 'render' ? queueRender(id, body.revision) : body.action === 'retry' ? retryCapture(id, body.revision) : body.action === 'save' ? editStoryboard(id, body.revision, body.storyboard) : null;
    if (!video) throw new Error('Unknown video action.');
    return Response.json({ video });
  } catch (e) { return videoError(e); }
}
