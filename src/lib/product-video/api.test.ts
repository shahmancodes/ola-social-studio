import { expect, it, vi, beforeEach } from 'vitest';
vi.mock('../platform-auth', () => ({ currentUser: vi.fn(), roleFor: vi.fn() }));
vi.mock('./store', () => ({ getVideo: vi.fn() }));
import { currentUser, roleFor } from '../platform-auth';
import { getVideo } from './store';
import { videoAccess, videoError } from './api';
beforeEach(() => vi.clearAllMocks());
it('does not read a video without a session', async () => { vi.mocked(currentUser).mockResolvedValue(null); await expect(videoAccess('private')).rejects.toThrow('Sign in'); expect(getVideo).not.toHaveBeenCalled(); });
it('rejects another company and allows the membership owner', async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: 'user', email: 'a@example.com', display_name: '', is_root: 0 });
  vi.mocked(getVideo).mockReturnValue({ companyId: 'other-company' } as ReturnType<typeof getVideo>);
  vi.mocked(roleFor).mockReturnValue(null); await expect(videoAccess('private')).rejects.toThrow('Access denied');
  vi.mocked(roleFor).mockReturnValue('member'); await expect(videoAccess('private')).resolves.toEqual({ companyId: 'other-company' });
  expect(roleFor).toHaveBeenCalledWith('user','other-company');
});
it('uses distinct authentication, authorization and conflict status codes', () => { expect(videoError(new Error('Sign in required.')).status).toBe(401); expect(videoError(new Error('Access denied.')).status).toBe(403); expect(videoError(new Error('Video changed.')).status).toBe(409); });
