import { EXERCISES, type Exercise } from '../../data/exercises';
import { renderDemo } from '../demo';
import { h, svg } from '../dom';
import { prefersReducedMotion } from '../figure';

/**
 * A just-for-fun spinner on the home page. It draws a random handful of exercises from the
 * library but is not tied to the plan or the workout log.
 */
export const WHEEL_SIZE = 8;
const MAX_LABEL_LENGTH = 14;

export const SPIN_MS = 5000;
const MIN_TURNS = 5;

/**
 * Random number in [0, 1) that mixes crypto randomness with the wall clock and the
 * high-resolution timer, so no two spins share a seed and no pattern repeats.
 */
let spinCounter = 0;
export function timeMixedRandom(now = Date.now(), perf = globalThis.performance?.now() ?? 0): number {
  const buf = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(buf);
  let x = buf[0] ^ Math.imul(now >>> 0, 0x9e3779b1) ^ Math.imul(Math.floor(now / 2 ** 32), 0x7feb352d) ^ Math.imul(Math.floor(perf * 1000) >>> 0, 0x85ebca6b) ^ Math.imul(++spinCounter, 0xc2b2ae35);
  // murmur3 finaliser: spreads every input bit across the whole output.
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 2 ** 32;
}

/**
 * Picks a winning segment and the absolute rotation (degrees, clockwise) that lands it under
 * the pointer at 12 o'clock. Always spins forward from `current` by at least MIN_TURNS turns,
 * with a random number of extra turns and a random spot inside the segment.
 */
export function planSpin(current: number, count: number, rand: () => number = timeMixedRandom): { index: number; rotation: number } {
  const seg = 360 / count;
  const index = Math.floor(rand() * count) % count;
  const within = 0.15 + rand() * 0.7; // keep clear of the borders so the answer is never ambiguous
  const target = (index + within) * seg; // wheel angle that must end up at the top
  const turns = MIN_TURNS + Math.floor(rand() * 3);
  const base = current - (((current % 360) + 360) % 360);
  return { index, rotation: base + turns * 360 + (360 - target) };
}

/**
 * A random set of `size` distinct exercises, preferring ones not in `current` so each new
 * set looks fresh. Falls back to repeats only when the library is too small.
 */
export function pickWheelSet(current: readonly Exercise[] = [], size = WHEEL_SIZE, rand: () => number = timeMixedRandom, library: readonly Exercise[] = EXERCISES): Exercise[] {
  const shown = new Set(current.map((x) => x.id));
  const shuffle = (list: Exercise[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const fresh = shuffle(library.filter((x) => !shown.has(x.id)));
  const repeats = shuffle(library.filter((x) => shown.has(x.id)));
  return [...fresh, ...repeats].slice(0, Math.min(size, library.length));
}

/** Index of the segment under the pointer for a given wheel rotation. */
export function segmentAt(rotation: number, count: number): number {
  const angle = (((-rotation % 360) + 360) % 360);
  return Math.floor(angle / (360 / count)) % count;
}

function point(r: number, deg: number): string {
  const rad = (deg * Math.PI) / 180;
  return `${(100 + r * Math.sin(rad)).toFixed(2)} ${(100 - r * Math.cos(rad)).toFixed(2)}`;
}

function shortLabel(name: string): string {
  return name.length > MAX_LABEL_LENGTH ? `${name.slice(0, MAX_LABEL_LENGTH - 1)}…` : name;
}

function wheelDisc(set: readonly Exercise[]): SVGSVGElement {
  const seg = 360 / set.length;
  const disc = svg('svg', { viewBox: '0 0 200 200', class: 'wheel-disc', 'aria-hidden': 'true' });
  set.forEach((ex, i) => {
    const start = i * seg;
    const mid = start + seg / 2;
    const slice = svg('path', { d: `M100 100 L${point(96, start)} A96 96 0 0 1 ${point(96, start + seg)} Z`, class: `wheel-slice ${i % 2 ? 'alt' : ''}` });
    const text = svg('text', { x: 156, y: 100, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: `wheel-label ${i % 2 ? 'alt' : ''}`, transform: `rotate(${mid - 90} 100 100)` });
    text.textContent = shortLabel(ex.name);
    disc.append(slice, text);
  });
  disc.append(svg('circle', { cx: 100, cy: 100, r: 96, class: 'wheel-rim' }), svg('circle', { cx: 100, cy: 100, r: 12, class: 'wheel-hub' }));
  return disc;
}

export interface SpinWheelOptions {
  /**
   * Landing page: visitors can't open exercise pages, so the pick becomes a button that
   * shows the exercise's demo animation at the bottom of the card instead of a link.
   */
  inlineDemo?: boolean;
}

export function renderSpinWheel(opts: SpinWheelOptions = {}): HTMLElement {
  let set = pickWheelSet();
  let disc = wheelDisc(set);
  const result = h('p', { class: 'wheel-result', 'aria-live': 'polite' }, 'Feeling lucky? Spin for a random exercise.');
  const button = h('button', { type: 'button', class: 'primary' }, 'Spin the wheel');
  const newSet = h('button', { type: 'button', class: 'link' }, 'New set of exercises');
  const demoBox = h('div', { class: 'wheel-demo', id: 'wheel-demo', 'aria-live': 'polite' });
  let rotation = 0;

  const pickControl = (picked: Exercise): HTMLElement => {
    if (!opts.inlineDemo) return h('a', { href: `#/exercises/${picked.id}?from=home` }, h('strong', {}, picked.name));
    const show = h('button', { type: 'button', class: 'link', 'aria-controls': 'wheel-demo', 'aria-expanded': 'false' }, h('strong', {}, picked.name));
    show.addEventListener('click', () => {
      const open = show.getAttribute('aria-expanded') !== 'true';
      show.setAttribute('aria-expanded', String(open));
      demoBox.replaceChildren(...(open ? [h('h3', {}, picked.name), renderDemo(picked, { animate: !prefersReducedMotion() }), h('p', { class: 'muted small' }, picked.tip)] : []));
    });
    return show;
  };

  button.addEventListener('click', () => {
    const reduced = prefersReducedMotion();
    const spin = planSpin(rotation, set.length);
    const picked = set[spin.index];
    rotation = spin.rotation;
    button.disabled = newSet.disabled = true;
    button.textContent = 'Spinning…';
    result.textContent = 'Spinning…';
    result.classList.remove('revealed');
    demoBox.replaceChildren();
    disc.style.transitionDuration = reduced ? '0ms' : `${SPIN_MS}ms`;
    disc.style.transform = `rotate(${rotation}deg)`;
    setTimeout(() => {
      result.textContent = '';
      result.append('Your pick: ', pickControl(picked));
      if (opts.inlineDemo) result.append(h('br'), h('small', { class: 'muted' }, 'Tap it to see how it’s done.'));
      result.classList.add('revealed');
      button.disabled = newSet.disabled = false;
      button.textContent = 'Spin again';
    }, reduced ? 300 : SPIN_MS);
  });

  newSet.addEventListener('click', () => {
    set = pickWheelSet(set);
    rotation = 0;
    const fresh = wheelDisc(set);
    disc.replaceWith(fresh);
    disc = fresh;
    result.textContent = 'New set loaded. Give it a spin!';
    demoBox.replaceChildren();
    result.classList.remove('revealed');
    button.textContent = 'Spin the wheel';
  });

  return h(
    'section',
    { class: 'card wheel-card', 'aria-labelledby': 'wheel-title' },
    h('div', { class: 'wheel' }, h('span', { class: 'wheel-pointer', 'aria-hidden': 'true' }), disc),
    h('div', { class: 'wheel-body' }, h('h2', { id: 'wheel-title' }, 'Exercise roulette'), result, button, newSet),
    opts.inlineDemo ? demoBox : null,
  );
}
