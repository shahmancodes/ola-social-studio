/** Decode the PCM16 WAV produced by Remotion's bundled FFmpeg (which omits raw PCM muxers). */
export function decodeMonoWav(bytes: Buffer) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid decoded audio container.');
  let rate = 0; let data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), start = offset + 8;
    if (start + length > bytes.length) throw new Error('Truncated decoded audio.');
    if (id === 'fmt ') {
      if (length < 16 || bytes.readUInt16LE(start) !== 1 || bytes.readUInt16LE(start + 2) !== 1 || bytes.readUInt16LE(start + 14) !== 16) throw new Error('Expected mono PCM16 audio.');
      rate = bytes.readUInt32LE(start + 4);
    }
    if (id === 'data') data = bytes.subarray(start, start + length);
    offset = start + length + (length % 2);
  }
  if (!rate || !data || data.length % 2) throw new Error('Missing decoded audio samples.');
  const samples = new Float32Array(data.length / 2); for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
  return { samples, sampleRate: rate };
}
/** Compare source audio with the encoded soundtrack; catch offsets introduced during muxing. */
export function audioAlignment(expected: Float32Array, actual: Float32Array, sampleRate: number) {
  const margin = Math.round(sampleRate * .1), end = Math.min(expected.length, actual.length) - margin;
  if (end <= margin) throw new Error('Audio comparison clip is too short.');
  let best = { lagMs: 0, correlation: -1 };
  for (let lag = -margin; lag <= margin; lag += 4) {
    let dot = 0, a2 = 0, b2 = 0;
    for (let i = margin; i < end; i++) { const a = expected[i], b = actual[i + lag]; dot += a * b; a2 += a * a; b2 += b * b; }
    const correlation = dot / Math.sqrt(a2 * b2 || 1);
    if (correlation > best.correlation) best = { lagMs: lag / sampleRate * 1000, correlation };
  }
  return best;
}
