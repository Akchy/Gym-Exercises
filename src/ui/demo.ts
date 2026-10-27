/**
 * Exercise demonstration: professional start/end photos that cross-fade (a small
 * looping animation), or side-by-side still images. Falls back to the stick figure for
 * exercises without photos.
 */
import type { Exercise } from '../data/exercises';
import { photoUrls } from '../data/photos';
import { h } from './dom';
import { renderFigure } from './figure';

export interface DemoOptions {
  animate: boolean;
  /** "thumb" = small start photo only (lists), "full" = demo for learning the movement. */
  size?: 'thumb' | 'full';
}

function img(src: string, alt: string, eager = false): HTMLImageElement {
  return h('img', { src, alt, width: 480, height: 320, loading: eager ? 'eager' : 'lazy', decoding: 'async' });
}

export function renderDemo(ex: Exercise, opts: DemoOptions): HTMLElement {
  const size = opts.size ?? 'full';
  const photos = photoUrls(ex.id);
  if (!photos) {
    const animate = size === 'full' && opts.animate;
    return h('div', { class: `demo figure-demo ${size}` }, renderFigure(ex.motion, { animate, prop: ex.prop, label: ex.name }));
  }
  const [start, end] = photos;
  if (size === 'thumb') {
    return h('div', { class: 'demo thumb' }, img(start, `${ex.name}`));
  }
  if (opts.animate) {
    return h(
      'div',
      { class: 'demo photo animated', role: 'img', 'aria-label': `${ex.name}: moving between start and end position (animation)` },
      img(start, '', true),
      img(end, '', true),
    );
  }
  return h(
    'div',
    { class: 'demo photo static', role: 'group', 'aria-label': `${ex.name}: start and end position` },
    h('figure', {}, img(start, `${ex.name}: start position`, true), h('figcaption', {}, '1. Start')),
    h('figure', {}, img(end, `${ex.name}: end position`, true), h('figcaption', {}, '2. End')),
  );
}
