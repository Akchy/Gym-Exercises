import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXERCISES } from '../../src/data/exercises';
import { pickWheelSet, planSpin, renderSpinWheel, segmentAt, SPIN_MS, timeMixedRandom, WHEEL_SIZE } from '../../src/ui/views/wheel';

const COUNT = WHEEL_SIZE;

afterEach(() => vi.useRealTimers());

describe('exercise roulette', () => {
  it('lands the chosen segment under the pointer, always spinning forward', () => {
    let current = 0;
    for (let i = 0; i < 200; i++) {
      const spin = planSpin(current, COUNT);
      expect(segmentAt(spin.rotation, COUNT)).toBe(spin.index);
      expect(spin.rotation - current).toBeGreaterThanOrEqual(5 * 360 - 360);
      current = spin.rotation;
    }
  });

  it('mixes the clock into the randomness', () => {
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((b) => b);
    expect(timeMixedRandom(1000, 5)).not.toBe(timeMixedRandom(1001, 5));
    const values = Array.from({ length: 500 }, (_, i) => timeMixedRandom(1_700_000_000_000 + i, i));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(values).size).toBe(500);
  });

  it('spins for five seconds, then reveals the answer', () => {
    vi.useFakeTimers();
    const card = renderSpinWheel();
    const button = card.querySelector('button') as HTMLButtonElement;
    button.click();
    expect(button.disabled).toBe(true);
    expect((card.querySelector('.wheel-disc') as SVGElement).style.transform).toMatch(/rotate\(/);
    vi.advanceTimersByTime(SPIN_MS - 1);
    expect(card.querySelector('.wheel-result')?.textContent).toBe('Spinning…');
    vi.advanceTimersByTime(1);
    const answer = card.querySelector('.wheel-result strong')?.textContent;
    expect(EXERCISES.map((x) => x.name)).toContain(answer);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Spin again');
  });

  it('picks a fresh set of distinct exercises from the library', () => {
    const first = pickWheelSet();
    expect(first).toHaveLength(WHEEL_SIZE);
    expect(new Set(first.map((x) => x.id)).size).toBe(WHEEL_SIZE);
    expect(first.every((x) => EXERCISES.includes(x))).toBe(true);
    if (EXERCISES.length >= 2 * WHEEL_SIZE) {
      const next = pickWheelSet(first);
      expect(next.some((x) => first.includes(x))).toBe(false);
    }
    expect(pickWheelSet([], WHEEL_SIZE, Math.random, EXERCISES.slice(0, 3))).toHaveLength(3);
  });

  it('loads a new set of exercises onto the wheel', () => {
    vi.useFakeTimers();
    const card = renderSpinWheel();
    const button = (text: string) => [...card.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
    const labels = () => [...card.querySelectorAll('.wheel-label')].map((t) => t.textContent);
    const before = labels();
    expect(before).toHaveLength(WHEEL_SIZE);

    button('Spin the wheel').click();
    expect(button('New set of exercises').disabled).toBe(true);
    vi.advanceTimersByTime(SPIN_MS);
    const link = card.querySelector('.wheel-result a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toMatch(/^#\/exercises\/[^?]+\?from=home$/);

    button('New set of exercises').click();
    expect(labels()).toHaveLength(WHEEL_SIZE);
    expect(labels()).not.toEqual(before);
    expect(card.querySelector('.wheel-result')?.textContent).toMatch(/New set/);
  });

  it('on the landing page, shows the picked exercise demo at the bottom when tapped', () => {
    vi.useFakeTimers();
    const card = renderSpinWheel({ inlineDemo: true });
    const demo = card.querySelector('.wheel-demo') as HTMLElement;
    (card.querySelector('button.primary') as HTMLButtonElement).click();
    vi.advanceTimersByTime(SPIN_MS);
    expect(card.querySelector('.wheel-result a')).toBeNull();
    const pick = card.querySelector('.wheel-result button') as HTMLButtonElement;
    expect(demo.childElementCount).toBe(0);

    pick.click();
    expect(pick.getAttribute('aria-expanded')).toBe('true');
    expect(demo.querySelector('h3')?.textContent).toBe(pick.textContent);
    expect(demo.querySelector('.demo')).not.toBeNull();
    expect(card.lastElementChild).toBe(demo);

    pick.click();
    expect(demo.childElementCount).toBe(0);
    pick.click();
    (card.querySelector('button.primary') as HTMLButtonElement).click();
    expect(demo.childElementCount).toBe(0);
  });

  it('is not shown with an inline demo on the dashboard', () => {
    expect(renderSpinWheel().querySelector('.wheel-demo')).toBeNull();
  });
});
