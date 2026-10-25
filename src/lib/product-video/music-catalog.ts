/** Reviewed first-party tracks. Public availability alone is not a reuse license. */
export const MUSIC_CATALOG = [
  { id: 'carefree', title: 'Carefree', artist: 'Kevin MacLeod', mood: 'Bright · acoustic · playful', bpmHint: 96, sourceUrl: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037', downloadUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3' },
  { id: 'wallpaper', title: 'Wallpaper', artist: 'Kevin MacLeod', mood: 'Calm · electronic · steady', bpmHint: 92, sourceUrl: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100843', downloadUrl: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wallpaper.mp3' },
].map(track => ({ ...track, license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', licenseVerifiedAt: '2026-10-25', attribution: `“${track.title}” by Kevin MacLeod (incompetech.com). Licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/. Excerpt, fades and volume adjusted.` }));
export type MusicTrack = {
  id: string; title: string; artist: string; mood: string; bpmHint?: number;
  sourceUrl: string; downloadUrl: string; license: string; licenseUrl: string;
  licenseVerifiedAt: string; attribution: string;
  description?: string; instruments?: string; durationSeconds?: number;
  licenseEvidence?: { catalogUrl: string; catalogSha256: string; pageSha256: string; statement: string; checkedAt: string; isrc: string };
};
export type MusicDiscovery = {
  provider: 'Incompetech'; fetchedAt: string; catalogCount: number; eligibleCount: number;
  brief: string; method: 'context-ranking' | 'ai-ranked'; reason: string;
  shortlist: { id: string; title: string; score: number }[];
  rejected: { id: string; reason: string }[];
};
export function musicTrack(id: string) { const track = MUSIC_CATALOG.find(t => t.id === id); if (!track) throw new Error('Choose a track from the licensed music library.'); return track; }
export type PreparedMusic = { track: MusicTrack; file: string; sha256: string; analyzedSeconds: number; bpm: number; beats: number[]; onsetAgreement: number; analyzedAt: string; discovery?: MusicDiscovery };
