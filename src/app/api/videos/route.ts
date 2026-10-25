import { requireMembership } from '@/lib/platform-auth';
import { createVideo, listVideos, videoWorkerOnline } from '@/lib/product-video/store';
import { videoError } from '@/lib/product-video/api';
import { publicUrl } from '@/lib/product-video/network';
import { VideoInputSchema } from '@/lib/product-video/schema';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { const companyId = new URL(request.url).searchParams.get('company') ?? ''; await requireMembership(companyId); return Response.json({ videos: listVideos(companyId), workerOnline: videoWorkerOnline() }, { headers: { 'cache-control': 'no-store' } }); } catch (e) { return videoError(e); }
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length')) > 40000) throw new Error('Request too large.');
    const body = await request.json(); await requireMembership(String(body.companyId));
    const input = VideoInputSchema.parse(body.input); publicUrl(input.url); for (const step of input.steps) if (step.url) publicUrl(step.url);
    return Response.json({ video: createVideo(body.companyId, input) }, { status: 201 });
  } catch (e) { return videoError(e); }
}
