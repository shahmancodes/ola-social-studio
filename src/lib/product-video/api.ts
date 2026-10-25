import { currentUser, roleFor } from '../platform-auth';
import { getVideo } from './store';
export async function videoAccess(id: string) {
  const user = await currentUser(); if (!user) throw new Error('Sign in required.');
  const video = getVideo(id); if (!roleFor(user.id, video.companyId)) throw new Error('Access denied.');
  return video;
}
export function videoError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Video request failed.';
  const status = message === 'Sign in required.' ? 401 : message === 'Access denied.' ? 403 : message === 'Video not found.' ? 404 : message.includes('changed') || message.includes('busy') ? 409 : 400;
  return Response.json({ error: message }, { status });
}
