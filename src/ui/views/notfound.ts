/** "Page not found": a 404 whose zero is a weight plate rolling in, plus ways back into the app. */
import { h, svg } from '../dom';

export interface NotFoundOptions {
  /** The route that was opened, shown so a typo is easy to spot. */
  path: string;
  /** With data loaded, the main pages are offered too; otherwise only the first screen. */
  hasData: boolean;
}

function four(x: number): SVGElement {
  return svg('path', { class: 'nf-digit', d: 'M80 125V20L22 95H100', transform: `translate(${x} 0)` });
}

function plate(): SVGElement {
  // Holes around the hub make the roll visible.
  const holes = [0, 90, 180, 270].map((a) => {
    const r = (a * Math.PI) / 180;
    return svg('circle', { class: 'nf-hole', cx: 170 + Math.cos(r) * 27, cy: 81 + Math.sin(r) * 27, r: 4.5 });
  });
  return svg(
    'g',
    { class: 'nf-plate' },
    svg('circle', { class: 'nf-plate-rim', cx: 170, cy: 81, r: 53 }),
    svg('circle', { class: 'nf-plate-ring', cx: 170, cy: 81, r: 40 }),
    ...holes,
    svg('circle', { class: 'nf-hub', cx: 170, cy: 81, r: 11 }),
  );
}

export function renderNotFound(opts: NotFoundOptions): HTMLElement {
  const art = svg(
    'svg',
    { class: 'nf-art', viewBox: '0 0 340 150', role: 'img', 'aria-label': '404, with a weight plate as the zero' },
    svg('ellipse', { class: 'nf-shadow', cx: 170, cy: 136, rx: 40, ry: 5 }),
    svg('line', { class: 'nf-floor', x1: 10, x2: 330, y1: 136, y2: 136 }),
    four(0),
    plate(),
    four(220),
  );
  const links = opts.hasData
    ? [
        h('a', { href: '#/', class: 'button primary' }, 'Go home'),
        h('a', { href: '#/plan', class: 'button secondary' }, 'My plan'),
        h('a', { href: '#/exercises', class: 'button secondary' }, 'Exercise library'),
      ]
    : [h('a', { href: '#/', class: 'button primary' }, 'Go to the start')];
  return h(
    'main',
    { class: `container not-found${opts.hasData ? '' : ' full'}` },
    art,
    h('p', { class: 'eyebrow' }, 'Error 404 · Missed rep'),
    h('h1', {}, 'Oops! Sorry, page not found'),
    h('p', { class: 'lead' }, "This plate rolled right off the rack. The link may be mistyped, or the page has moved. Let's get you back to your workout."),
    opts.path !== '/' ? h('p', { class: 'muted nf-path' }, 'You tried to open ', h('code', {}, `#${opts.path}`)) : null,
    h('div', { class: 'cta nf-actions' }, ...links),
  );
}
