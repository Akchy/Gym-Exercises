import type { SeriesPoint } from '../core/progress';
import { h, svg } from './dom';

export interface ChartGeometry {
  path: string;
  points: { x: number; y: number; point: SeriesPoint }[];
  min: number;
  max: number;
}

/** Maps a series into SVG coordinates within width x height (with padding). */
export function chartGeometry(series: readonly SeriesPoint[], width = 320, height = 160, pad = 24): ChartGeometry {
  if (!series.length) return { path: '', points: [], min: 0, max: 0 };
  const values = series.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const n = series.length;
  const points = series.map((point, i) => ({
    x: Math.round((n === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1)) * 10) / 10,
    y: Math.round((height - pad - ((point.value - min) / (max - min)) * (height - 2 * pad)) * 10) / 10,
    point,
  }));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  return { path, points, min, max };
}

export function lineChart(series: readonly SeriesPoint[], label: string, unit = ''): HTMLElement {
  if (!series.length) return h('p', { class: 'muted' }, 'No data yet.');
  const width = 320;
  const height = 160;
  const g = chartGeometry(series, width, height);
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img', 'aria-label': label });
  root.appendChild(svg('line', { class: 'axis', x1: 24, y1: height - 24, x2: width - 24, y2: height - 24 }));
  root.appendChild(svg('path', { class: 'line', d: g.path }));
  for (const p of g.points) {
    const c = svg('circle', { class: 'dot', cx: p.x, cy: p.y, r: 3.5 });
    const t = svg('title');
    t.textContent = `${p.point.date}: ${p.point.value}${unit}`;
    c.appendChild(t);
    root.appendChild(c);
  }
  const first = series[0];
  const last = series[series.length - 1];
  return h(
    'figure',
    { class: 'chart-wrap' },
    root,
    h('figcaption', { class: 'muted' }, `${first.date}: ${first.value}${unit} → ${last.date}: ${last.value}${unit}`),
  );
}
