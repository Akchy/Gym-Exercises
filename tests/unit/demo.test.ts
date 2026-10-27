import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EXERCISES, getExercise } from '../../src/data/exercises';
import { PHOTO_EXERCISES, photoUrls } from '../../src/data/photos';
import { renderDemo } from '../../src/ui/demo';
import { choiceGroup } from '../../src/ui/dom';

const root = resolve(__dirname, '../..');

describe('exercise photos', () => {
  it('only lists known exercises, and every photo file exists', () => {
    for (const id of PHOTO_EXERCISES) {
      expect(getExercise(id), id).toBeDefined();
      for (const url of photoUrls(id)!) expect(existsSync(resolve(root, 'public', url.slice(1))), url).toBe(true);
    }
  });

  it('covers nearly the whole library', () => {
    expect(PHOTO_EXERCISES.size).toBeGreaterThanOrEqual(EXERCISES.length - 2);
  });

  it('keeps the download script mapping in sync', () => {
    const script = readFileSync(resolve(root, 'scripts/fetch_exercise_images.py'), 'utf8');
    for (const id of PHOTO_EXERCISES) expect(script, id).toContain(`"${id}":`);
  });

  it('builds URLs with the base path', () => {
    expect(photoUrls('plank', '/gym/')).toEqual(['/gym/exercises/plank-0.webp', '/gym/exercises/plank-1.webp']);
    expect(photoUrls('burpee')).toBeNull();
  });
});

describe('renderDemo', () => {
  const pushUp = getExercise('push-up')!;
  const burpee = getExercise('burpee')!;

  it('renders a lazy thumbnail', () => {
    const el = renderDemo(pushUp, { animate: true, size: 'thumb' });
    expect(el.className).toBe('demo thumb');
    expect(el.querySelectorAll('img')).toHaveLength(1);
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('Push-up');
  });

  it('renders a cross-fading animation of start and end photos', () => {
    const el = renderDemo(pushUp, { animate: true });
    expect(el.classList.contains('animated')).toBe(true);
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toMatch(/animation/);
    expect(el.querySelectorAll('img')).toHaveLength(2);
    expect(el.querySelector('img')?.getAttribute('loading')).toBe('eager');
  });

  it('renders labelled still images', () => {
    const el = renderDemo(pushUp, { animate: false });
    expect(el.classList.contains('static')).toBe(true);
    expect(el.querySelectorAll('figure')).toHaveLength(2);
  });

  it('falls back to the stick figure (static in thumbnails)', () => {
    expect(renderDemo(burpee, { animate: true }).querySelector('svg.animated')).not.toBeNull();
    expect(renderDemo(burpee, { animate: true, size: 'thumb' }).querySelector('svg.static')).not.toBeNull();
    expect(renderDemo(burpee, { animate: false }).querySelector('svg.static')).not.toBeNull();
  });
});

describe('choiceGroup', () => {
  it('renders themed radios that report changes', () => {
    const onChange = vi.fn();
    const el = choiceGroup({ name: 'size', legend: 'Size', options: [['s', 'Small'], ['l', 'Large', 'Big one']], value: 's', onChange });
    expect(el.querySelector('legend')?.textContent).toBe('Size');
    expect(el.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Size');
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios[0].checked).toBe(true);
    expect(radios[0].className).toBe('visually-hidden');
    radios[1].checked = true;
    radios[1].dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith('l');
    expect(el.querySelector('label[for="size-l"] .muted')?.textContent).toBe('Big one');
  });

  it('supports a card layout', () => {
    const el = choiceGroup({ name: 'g', legend: 'Goal', layout: 'cards', options: [['a', 'A']], value: 'a', onChange: () => {} });
    expect(el.querySelector('.choice-grid .choice strong')?.textContent).toBe('A');
  });
});
