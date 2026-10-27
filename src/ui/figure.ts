/** Renders exercise stick-figure animations (SVG + SMIL), or a static start/end image. */
import type { Prop } from '../data/exercises';
import { getMotion, type MotionId, type Point, type Pose, type Scene } from '../data/motions';
import { svg } from './dom';

const SEGMENTS: [keyof Pose, keyof Pose][] = [
  ['head', 'sh'],
  ['sh', 'hip'],
  ['hip', 'kn'],
  ['kn', 'ft'],
  ['hip', 'kn2'],
  ['kn2', 'ft2'],
  ['sh', 'el'],
  ['el', 'ha'],
  ['sh', 'el2'],
  ['el2', 'ha2'],
];

const SPLINE = { calcMode: 'spline', keyTimes: '0;0.5;1', keySplines: '0.45 0 0.55 1;0.45 0 0.55 1', repeatCount: 'indefinite' };

function anim(attr: string, from: number, to: number, dur: number): SVGAnimateElement {
  return svg('animate', { attributeName: attr, values: `${from};${to};${from}`, dur: `${dur}s`, ...SPLINE });
}

function sceneElements(scene: Scene): SVGElement[] {
  const s = { class: 'scene' };
  const els: SVGElement[] = [svg('line', { ...s, x1: 10, y1: 176, x2: 190, y2: 176 })];
  if (scene === 'bench') {
    els.push(svg('rect', { ...s, x: 35, y: 136, width: 90, height: 6, rx: 2 }));
    els.push(svg('line', { ...s, x1: 50, y1: 142, x2: 50, y2: 176 }), svg('line', { ...s, x1: 112, y1: 142, x2: 112, y2: 176 }));
  } else if (scene === 'bar') {
    els.push(svg('line', { ...s, x1: 55, y1: 30, x2: 145, y2: 30 }));
  } else if (scene === 'dip-bars') {
    els.push(svg('line', { ...s, x1: 80, y1: 106, x2: 140, y2: 106 }), svg('line', { ...s, x1: 132, y1: 106, x2: 132, y2: 176 }));
  } else if (scene === 'seat') {
    els.push(svg('line', { ...s, x1: 84, y1: 124, x2: 130, y2: 124 }), svg('line', { ...s, x1: 86, y1: 124, x2: 82, y2: 66 }));
    els.push(svg('line', { ...s, x1: 108, y1: 124, x2: 108, y2: 176 }));
  } else if (scene === 'mat') {
    els.push(svg('rect', { ...s, x: 25, y: 173, width: 160, height: 3 }));
  }
  return els;
}

function propElement(prop: Prop, a: Point, b: Point | null, dur: number, a2?: Point, b2?: Point | null): SVGElement[] {
  if (prop === 'none') return [];
  const out: SVGElement[] = [];
  const at = (pa: Point, pb: Point | null) => {
    const el =
      prop === 'barbell'
        ? svg('circle', { class: 'prop', cx: pa[0], cy: pa[1], r: 11 })
        : prop === 'kettlebell'
          ? svg('circle', { class: 'prop', cx: pa[0], cy: pa[1] + 6, r: 7 })
          : prop === 'dumbbell'
            ? svg('circle', { class: 'prop', cx: pa[0], cy: pa[1], r: 5 })
            : svg('circle', { class: 'prop prop-handle', cx: pa[0], cy: pa[1], r: 3 });
    if (pb) {
      el.appendChild(anim('cx', pa[0], pb[0], dur));
      el.appendChild(anim('cy', pa[1] + (prop === 'kettlebell' ? 6 : 0), pb[1] + (prop === 'kettlebell' ? 6 : 0), dur));
    }
    out.push(el);
  };
  at(a, b);
  if (a2 && (prop === 'dumbbell' || prop === 'handle')) at(a2, b2 ?? null);
  return out;
}

function figure(a: Pose, b: Pose | null, prop: Prop, dur: number): SVGGElement {
  const g = svg('g', { class: 'figure' });
  for (const [p, q] of SEGMENTS) {
    const pa = a[p];
    const qa = a[q];
    if (!pa || !qa) continue;
    const line = svg('line', { x1: pa[0], y1: pa[1], x2: qa[0], y2: qa[1] });
    if (b) {
      const pb = b[p] ?? pa;
      const qb = b[q] ?? qa;
      line.append(anim('x1', pa[0], pb[0], dur), anim('y1', pa[1], pb[1], dur), anim('x2', qa[0], qb[0], dur), anim('y2', qa[1], qb[1], dur));
    }
    g.appendChild(line);
  }
  const head = svg('circle', { class: 'head', cx: a.head[0], cy: a.head[1], r: 9 });
  if (b) head.append(anim('cx', a.head[0], b.head[0], dur), anim('cy', a.head[1], b.head[1], dur));
  g.appendChild(head);
  for (const el of propElement(prop, a.ha, b ? b.ha : null, dur, a.ha2, b ? (b.ha2 ?? null) : null)) g.appendChild(el);
  return g;
}

export interface FigureOptions {
  animate: boolean;
  prop?: Prop;
  label?: string;
}

/**
 * animate=true: one looping figure. animate=false: a "stop image" showing the start and
 * end positions side by side (also used when the user prefers reduced motion).
 */
export function renderFigure(motionId: MotionId, opts: FigureOptions): SVGSVGElement {
  const motion = getMotion(motionId);
  const prop = opts.prop ?? 'none';
  const label = opts.label ?? 'Exercise demonstration';
  if (opts.animate) {
    const root = svg('svg', { viewBox: '0 0 200 200', class: 'exercise-figure animated', role: 'img', 'aria-label': `${label} (animation)` });
    for (const el of sceneElements(motion.scene)) root.appendChild(el);
    root.appendChild(figure(motion.a, motion.b, prop, motion.durationSec));
    return root;
  }
  const root = svg('svg', { viewBox: '0 0 400 200', class: 'exercise-figure static', role: 'img', 'aria-label': `${label}: start and end position` });
  const left = svg('g', {});
  const right = svg('g', { transform: 'translate(200 0)' });
  for (const el of sceneElements(motion.scene)) left.appendChild(el);
  for (const el of sceneElements(motion.scene)) right.appendChild(el);
  left.appendChild(figure(motion.a, null, prop, motion.durationSec));
  right.appendChild(figure(motion.b, null, prop, motion.durationSec));
  const arrow = svg('path', { class: 'arrow', d: 'M188 100 h24 m-7 -6 l7 6 l-7 6' });
  const t1 = svg('text', { x: 100, y: 196, 'text-anchor': 'middle', class: 'caption' });
  t1.textContent = 'Start';
  const t2 = svg('text', { x: 300, y: 196, 'text-anchor': 'middle', class: 'caption' });
  t2.textContent = 'End';
  root.append(left, right, arrow, t1, t2);
  return root;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
