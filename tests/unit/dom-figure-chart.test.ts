import { describe, expect, it, vi } from 'vitest';
import { chartGeometry, lineChart } from '../../src/ui/chart';
import { append, clear, field, h, select, stepper, svg, titleCase } from '../../src/ui/dom';
import { effectiveTheme, getTheme, setTheme, THEME_KEY } from '../../src/ui/theme';
import { prefersReducedMotion, renderFigure } from '../../src/ui/figure';
import { MOTIONS, type MotionId } from '../../src/data/motions';

describe('dom helpers', () => {
  it('creates elements with attributes, events and children', () => {
    const onClick = vi.fn();
    const el = h('button', { type: 'button', class: 'x', disabled: false, title: null, onClick }, 'Hi ', 3, null, [h('span', {}, 'there')]);
    expect(el.outerHTML).toBe('<button type="button" class="x">Hi 3<span>there</span></button>');
    el.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('sets value/checked as properties and boolean attributes', () => {
    expect(h('input', { value: 'v' }).value).toBe('v');
    expect(h('input', { type: 'checkbox', checked: true }).checked).toBe(true);
    expect(h('input', { required: true }).hasAttribute('required')).toBe(true);
  });

  it('renders text safely (no HTML injection)', () => {
    const el = h('p', {}, '<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('refuses inline event handler strings', () => {
    expect(() => h('div', { onclick: 'alert(1)' })).toThrow('Inline event handler');
  });

  it('appends and clears', () => {
    const el = h('div');
    append(el, ['a', h('b', {}, 'b')]);
    expect(el.childNodes).toHaveLength(2);
    clear(el);
    expect(el.childNodes).toHaveLength(0);
  });

  it('creates svg elements in the SVG namespace', () => {
    const s = svg('svg', { viewBox: '0 0 1 1' }, svg('line', { x1: 0 }));
    expect(s.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(s.firstElementChild?.getAttribute('x1')).toBe('0');
  });

  it('builds labelled fields and selects', () => {
    const input = h('input');
    const f = field('Name', input, 'hint text');
    expect(f.querySelector('label')?.getAttribute('for')).toBe(input.id);
    expect(f.querySelector('.hint')?.textContent).toBe('hint text');
    const s = select([['a', 'A'], ['b', 'B']] as const, 'b');
    expect(s.value).toBe('b');
    expect(s.options).toHaveLength(2);
  });

  it('title-cases', () => {
    expect(titleCase('gain-muscle')).toBe('Gain Muscle');
  });
});

describe('renderFigure', () => {
  it('renders a looping animation for every motion', () => {
    for (const id of Object.keys(MOTIONS) as MotionId[]) {
      const el = renderFigure(id, { animate: true, prop: 'dumbbell', label: id });
      expect(el.getAttribute('viewBox')).toBe('0 0 200 200');
      expect(el.querySelectorAll('animate').length).toBeGreaterThan(10);
      expect(el.getAttribute('aria-label')).toContain(id);
      expect(el.querySelector('.head')).not.toBeNull();
    }
  });

  it('renders a static start/end "stop image" without animation', () => {
    const el = renderFigure('squat', { animate: false, prop: 'barbell' });
    expect(el.getAttribute('viewBox')).toBe('0 0 400 200');
    expect(el.querySelectorAll('animate')).toHaveLength(0);
    expect(el.querySelectorAll('.figure')).toHaveLength(2);
    expect([...el.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['Start', 'End']);
  });

  it('draws props and scenes', () => {
    expect(renderFigure('lateral-raise', { animate: true, prop: 'dumbbell' }).querySelectorAll('.prop')).toHaveLength(2);
    expect(renderFigure('hinge', { animate: true, prop: 'kettlebell' }).querySelectorAll('.prop')).toHaveLength(1);
    expect(renderFigure('pulldown', { animate: false, prop: 'handle' }).querySelectorAll('.prop-handle')).toHaveLength(4);
    expect(renderFigure('plank', { animate: true }).querySelectorAll('.prop')).toHaveLength(0);
    for (const id of ['bench-press', 'pullup', 'dip', 'seated-row', 'crunch'] as MotionId[]) {
      expect(renderFigure(id, { animate: true }).querySelectorAll('.scene').length).toBeGreaterThan(1);
    }
  });

  it('draws a second leg/arm only when defined', () => {
    const one = renderFigure('curl', { animate: false }).querySelectorAll('.figure')[0].querySelectorAll('line').length;
    const two = renderFigure('jumping-jack', { animate: false }).querySelectorAll('.figure')[0].querySelectorAll('line').length;
    expect(two).toBeGreaterThan(one);
  });

  it('detects reduced motion preference', () => {
    const orig = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
    window.matchMedia = orig;
  });
});

describe('chart', () => {
  it('returns empty geometry for no data', () => {
    expect(chartGeometry([])).toEqual({ path: '', points: [], min: 0, max: 0 });
  });
  it('maps points into the drawing area', () => {
    const g = chartGeometry([{ date: 'a', value: 10 }, { date: 'b', value: 20 }], 320, 160, 24);
    expect(g.points.map((p) => [p.x, p.y])).toEqual([[24, 136], [296, 24]]);
    expect(g.path).toBe('M24 136 L296 24');
  });
  it('centres a single point and handles flat series', () => {
    const g = chartGeometry([{ date: 'a', value: 5 }], 320, 160, 24);
    expect(g.points[0]).toMatchObject({ x: 160, y: 80 });
    expect(g.min).toBe(4);
    expect(g.max).toBe(6);
  });
  it('renders an accessible chart or an empty message', () => {
    expect(lineChart([], 'x').textContent).toBe('No data yet.');
    const el = lineChart([{ date: '2026-01-01', value: 1 }, { date: '2026-01-02', value: 2 }], 'Bench', ' kg');
    expect(el.querySelector('svg')?.getAttribute('aria-label')).toBe('Bench');
    expect(el.querySelectorAll('circle')).toHaveLength(2);
    expect(el.querySelector('figcaption')?.textContent).toBe('2026-01-01: 1 kg → 2026-01-02: 2 kg');
  });
});

describe('stepper', () => {
  const make = (attrs: Record<string, string | number> = {}, step?: number) => {
    const input = h('input', { type: 'number', 'aria-label': 'reps', ...attrs });
    const onChange = vi.fn();
    input.addEventListener('change', onChange);
    const wrap = stepper(input, step);
    const [dec, inc] = wrap.querySelectorAll('button');
    return { input, wrap, dec, inc, onChange };
  };

  it('wraps the input with labelled themed buttons', () => {
    const { wrap, dec, inc, input } = make();
    expect(wrap.className).toBe('stepper');
    expect(wrap.children[1]).toBe(input);
    expect(dec.getAttribute('aria-label')).toBe('Decrease by 1');
    expect(inc.getAttribute('aria-label')).toBe('Increase by 1');
    expect(inc.type).toBe('button');
  });

  it('steps, snaps to the grid, clamps and fires change', () => {
    const { input, dec, inc, onChange } = make({ min: 0, max: 20, value: 7.3 }, 2.5);
    inc.click();
    expect(input.value).toBe('7.5');
    expect(onChange).toHaveBeenCalledOnce();
    inc.click();
    expect(input.value).toBe('10');
    for (let i = 0; i < 10; i++) inc.click();
    expect(input.value).toBe('20');
    input.value = '1';
    dec.click();
    dec.click();
    expect(input.value).toBe('0');
  });

  it('starts empty fields from the placeholder or min', () => {
    const a = make({ placeholder: '40' }, 2.5);
    a.inc.click();
    expect(a.input.value).toBe('40');
    const b = make({ min: 13, max: 110 });
    b.inc.click();
    expect(b.input.value).toBe('13');
  });

  it('lets field() label the wrapped input', () => {
    const { wrap, input } = make();
    const f = field('Age', wrap);
    expect(f.querySelector('label')!.htmlFor).toBe(input.id);
  });
});

describe('theme', () => {
  it('stores light/dark, clears for system and applies to <html>', () => {
    setTheme('dark');
    expect(getTheme()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(effectiveTheme()).toBe('dark');
    setTheme('light');
    expect(effectiveTheme()).toBe('light');
    setTheme('system');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    localStorage.setItem(THEME_KEY, 'neon');
    expect(getTheme()).toBe('system');
    localStorage.removeItem(THEME_KEY);
  });
});
