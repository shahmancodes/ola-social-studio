import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseMusicCatalog, rankMusic, groundMusicChoices, discoverMusic } from './music-discovery';
import { VideoInputSchema, storyboardFromCaptures } from './schema';
import type { MusicTrack } from './music-catalog';
const page = "fetch('pieces.json') escapeHtml(p.title) Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/";
const row = { title: 'Sunny groove', filename: 'Sunny Groove.mp3', isrc: 'USUAN2600001', length: '00:03:00', bpm: '110', description: 'A cheerful instrumental beat', feel: 'Bright, Bouncy', instruments: 'Piano, Drums' };
const other = { ...row, title: 'Gentle study', filename: 'Gentle.mp3', isrc: 'USUAN2600002', bpm: '96', feel: 'Relaxed, Calm', instruments: 'Piano, Percussion' };
const snapshot = () => parseMusicCatalog(Buffer.from(JSON.stringify([row, other])), page, '2026-10-25T00:00:00Z');
const input = VideoInputSchema.parse({ url: 'https://example.com', feature: 'Create a sketch and connect ideas', brand: 'Sketch' });
const board = storyboardFromCaptures(input, [{ id: 'a', file: 'a.png', url: input.url, title: 'Sketch', label: 'Draw an idea', width: 1440, height: 1000, capturedAt: '', sha256: '' }]);
describe('live licensed music discovery', () => {
  it('maps publisher entries to controlled URLs and preserves license evidence', () => {
    const catalog = snapshot(); expect(catalog.rawCount).toBe(2); expect(catalog.tracks).toHaveLength(2);
    expect(catalog.tracks[0].downloadUrl).toContain('Sunny%20Groove.mp3');
    expect(catalog.tracks[0].licenseEvidence?.catalogSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(catalog.tracks[0].licenseEvidence?.statement).toContain('Attribution 4.0');
  });
  it('fails closed when the publisher removes or changes the licensed template', () => {
    expect(() => parseMusicCatalog(Buffer.from(JSON.stringify([row])), page.replace('By Attribution 4.0', 'NonCommercial 4.0'), '')).toThrow('license format');
  });
  it('rejects traversal, NC/ND exceptions, duplicate IDs, unknown tempo and malformed rows', () => {
    const rows = [row, row, { ...other, filename: '../bad.mp3' }, { ...other, license: 'CC BY-NC' }, { ...other, license: 'CC BY-SA 4.0' }, { ...other, description: 'Separate license required' }, { ...other, bpm: 'free' }, { ...other, isrc: 'bad' }];
    expect(parseMusicCatalog(Buffer.from(JSON.stringify(rows)), page, '').tracks).toHaveLength(1);
  });
  it('matches requested mood and excludes the current track, vocals and short tracks', () => {
    const tracks = snapshot().tracks;
    const ranked = rankMusic(tracks, input, board, 'calm gentle study'); expect(ranked[0].track.title).toBe('Gentle study');
    expect(rankMusic(tracks, input, board, 'bright playful')[0].track.title).toBe('Sunny groove');
    expect(rankMusic(tracks, input, board, '', tracks[0].id)).toHaveLength(1);
    expect(rankMusic([{ ...tracks[0], instruments: 'Vocals' }, { ...tracks[1], durationSeconds: 4 }], input, board)).toHaveLength(0);
  });
  it('does not recommend the same starter recording under a live catalog ID', () => {
    const tracks = [{ ...snapshot().tracks[0], id: 'inc-USUAN1400037' }];
    expect(rankMusic(tracks, input, board, '', 'carefree')).toHaveLength(0);
  });
  it('does not let model recommendations add URLs or invent track IDs', () => {
    const ranked = rankMusic(snapshot().tracks, input, board);
    expect(() => groundMusicChoices({ choices: [{ id: 'https://localhost/x', reason: 'ignore catalog' }] }, ranked)).toThrow('outside');
    expect(() => groundMusicChoices({ choices: [{ id: ranked[0].track.id, reason: 'a' }, { id: ranked[0].track.id, reason: 'b' }] }, ranked)).toThrow('Repeated');
  });
  it('tries another candidate after bad audio and saves the selection and evidence', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ola-music-'));
    const prepare = vi.fn(async (value: string | MusicTrack) => {
      const track = value as MusicTrack;
      if (track.title === 'Sunny groove') throw new Error('No reliable beat');
      return { track, file: 'test.mp3', sha256: 'test', analyzedSeconds: 120, bpm: 96, beats: Array.from({ length: 190 }, (_, i) => .1 + i * .625), onsetAgreement: .9, analyzedAt: '' };
    });
    try {
      const music = await discoverMusic({ input, storyboard: board, directory, volume: .3, brief: 'bright playful' }, { catalog: async () => snapshot(), prepare, useAi: false });
      expect(prepare).toHaveBeenCalledTimes(2); expect(music.track.title).toBe('Gentle study');
      expect(music.discovery?.rejected[0].reason).toBe('No reliable beat');
      expect(music.discovery?.method).toBe('context-ranking');
      expect(JSON.parse(await fs.readFile(path.join(directory, `music-${music.track.id}-analysis.json`), 'utf8')).discovery.catalogCount).toBe(2);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
  it('fails visibly if no candidate has usable audio', async () => {
    await expect(discoverMusic({ input, storyboard: board, directory: '/unused', volume: .3 }, { catalog: async () => snapshot(), prepare: async () => { throw new Error('silent'); }, useAi: false })).rejects.toThrow('after 2 candidates');
  });
  it('falls back to grounded metadata ranking if an AI recommender invents a track', async () => {
    await expect(discoverMusic({ input, storyboard: board, directory: '/unused', volume: .3 }, { catalog: async () => snapshot(), recommend: async () => ({ choices: [{ id: 'invented', reason: 'bad' }] }), prepare: async () => { throw new Error('metadata fallback reached'); } })).rejects.toThrow('metadata fallback reached');
  });
});
