import { describe, expect, it } from 'vitest';
import { VideoInputSchema, StoryboardSchema, storyboardFromCaptures, validateStoryboardAssets, duration, dimensions } from './schema';
import { publicAddress, publicUrl } from './network';
const asset = { id: 'one', file: 'one.png', url: 'https://example.com', label: 'The product', title: 'Example', width: 1440, height: 1000, sha256: 'abc', capturedAt: '2026-10-25T00:00:00Z' };
describe('product video boundaries', () => {
  it.each(['127.0.0.1','10.0.0.2','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','0.0.0.0','224.0.0.1','::1','fe80::1','fc00::1','::ffff:127.0.0.1','192.0.2.1'])('blocks nonpublic address %s', ip => expect(publicAddress(ip)).toBe(false));
  it.each(['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])('accepts public address %s', ip => expect(publicAddress(ip)).toBe(true));
  it.each(['file:///etc/passwd','ftp://example.com','http://localhost','http://127.1','http://2130706433','http://[::1]','https://user:pass@example.com','https://example.com:444','http://x.local'])('blocks unsafe URL %s', url => expect(() => publicUrl(url)).toThrow());
  it('builds a bounded deterministic timeline from captured evidence', () => {
    const input = VideoInputSchema.parse({ url: asset.url, brand: 'Example', feature: 'A better workflow.' });
    const board = storyboardFromCaptures(input, [asset]);
    expect(board.scenes.map(s => s.kind)).toEqual(['title','showcase','cta']);
    expect(duration(board)).toBe(330); expect(dimensions('portrait')).toEqual({ width: 1080, height: 1920 });
    expect(() => validateStoryboardAssets(board, [asset])).not.toThrow();
    expect(() => validateStoryboardAssets(board, [])).toThrow('unavailable');
    expect(() => storyboardFromCaptures(input, [])).toThrow('No usable');
  });
  it('rejects arbitrary capture execution, unbounded scenes, and missing images', () => {
    expect(() => VideoInputSchema.parse({ url: asset.url, feature: 'Demo', brand: 'Demo', steps: [{ label: 'test', actions: [{ type: 'evaluate', script: 'fetch("secret")' }] }] })).toThrow();
    const board = storyboardFromCaptures(VideoInputSchema.parse({ url: asset.url, feature: 'Demo', brand: 'Demo' }), [asset]);
    board.scenes[1].assetId = undefined; expect(() => validateStoryboardAssets(board, [asset])).toThrow('need a capture');
    board.scenes[1].seconds = 600; expect(() => StoryboardSchema.parse(board)).toThrow();
  });
});
