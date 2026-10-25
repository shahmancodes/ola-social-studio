import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { ProductFilm, type FilmProps } from './product-film';
import { dimensions, FPS, StoryboardSchema } from '../lib/product-video/schema';
import { filmTiming } from '../lib/product-video/rhythm';
const defaults: FilmProps = { images: {}, storyboard: StoryboardSchema.parse({ brand: 'Ola', format: 'landscape', theme: 'light', accent: '#8b5cf6', scenes: ['Your product.', 'In motion.', 'Made with Ola.'].map((headline, i) => ({ id: String(i), kind: 'title', headline, seconds: 3 })) }) };
registerRoot(() => <Composition id="ProductFilm" component={ProductFilm} fps={FPS} width={1920} height={1080} durationInFrames={270} defaultProps={defaults} calculateMetadata={({ props }) => ({ ...dimensions(props.storyboard.format), durationInFrames: filmTiming(props.storyboard, props.music).durationInFrames })} />);
