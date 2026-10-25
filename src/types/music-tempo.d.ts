declare module 'music-tempo' {
  export default class MusicTempo {
    constructor(samples: Float32Array, options?: Record<string, number>);
    tempo: number | string;
    beats: number[];
    events: number[];
    spectralFlux: number[];
  }
}
