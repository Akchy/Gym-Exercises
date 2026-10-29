import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/ui/app';
import type { AppState } from '../../src/core/types';
import { getExercise } from '../../src/data/exercises';
import { PHONE_QUERY } from '../../src/ui/device';
import { clock } from '../../src/ui/views/workout';
import { generatePlan } from '../../src/core/planner';
import { renderDashboard } from '../../src/ui/views/dashboard';
import { byText, change, fakeContext, go, makeApp, NOW, onboardedState, settle } from './helpers';

let app: App;
let root: HTMLElement;
const state = () => app.currentState as AppState;
const day = () => state().plan[0];
const pages = () => [...root.querySelectorAll<HTMLElement>('.reel-page:not(.reel-summary)')];
const btn = (page: HTMLElement, label: RegExp) => [...page.querySelectorAll<HTMLButtonElement>('button')].find((b) => label.test(b.getAttribute('aria-label') ?? ''))!;
let time = NOW.getTime();
let phone = true;

beforeEach(async () => {
  time = NOW.getTime();
  phone = true;
  window.matchMedia = vi.fn((q: string) => ({ matches: q === PHONE_QUERY && phone })) as unknown as typeof window.matchMedia;
  vi.spyOn(Date, 'now').mockImplementation(() => time);
  ({ app, root } = await makeApp(onboardedState()));
});
afterEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = undefined as unknown as typeof window.matchMedia;
});

/** Starts and stops a set on a page, `sec` seconds long. */
function doSet(page: HTMLElement, sec = 30) {
  btn(page, /^Start set/).click();
  time += sec * 1000;
  btn(page, /^Stop and log/).click();
}

describe('workout mode', () => {
  it('formats the clock', () => {
    expect(clock(0)).toBe('00:00');
    expect(clock(75.9)).toBe('01:15');
    expect(clock(-3)).toBe('00:00');
  });

  it('shows one full-screen page per exercise, without the site top bar', async () => {
    await go(app, `/workout/${day().id}`);
    expect(root.querySelector('.topbar')).toBeNull();
    expect(pages()).toHaveLength(day().exercises.length);
    expect(pages()[0].querySelector('h2')?.textContent).toBe(getExercise(day().exercises[0].exerciseId)!.name);
    expect(pages()[0].textContent).toContain('No sets yet');
    expect(root.querySelector('.reel-summary')).not.toBeNull();
    // How-to on the back: steps and a demo
    const back = pages()[0].querySelector('.reel-back')!;
    expect(back.querySelectorAll('.reel-steps li').length).toBeGreaterThan(0);
    expect(back.querySelector('.demo')).not.toBeNull();
  });

  it('flips a page with the how-to button and the arrow keys', async () => {
    await go(app, `/workout/${day().id}`);
    const page = pages()[0];
    byText(page, 'button', '← How to →').click();
    expect(page.classList.contains('flipped')).toBe(true);
    expect(page.querySelector('.reel-front')?.getAttribute('aria-hidden')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(page.classList.contains('flipped')).toBe(false);
  });

  it('logs a set on stop, prefilled from the target and last weight, and lets the user adjust the next one', async () => {
    const s = onboardedState();
    const first = s.plan[0].exercises[0];
    s.workouts.push({ id: 'old', date: '2026-10-20', dayId: null, entries: [{ exerciseId: first.exerciseId, sets: [{ reps: 8, weightKg: 40 }] }], durationMin: null, notes: '' });
    ({ app, root } = await makeApp(s));
    await go(app, `/workout/${day().id}`);
    const page = pages()[0];
    expect(page.textContent).toContain('40 kg');
    expect(page.textContent).toContain(`${first.repsMin} reps`);
    btn(page, /^More weight/).click();
    btn(page, /^Fewer reps/).click();
    expect(btn(page, /^Stop and log/).disabled).toBe(true);
    btn(page, /^Start set/).click();
    expect(page.dataset.mode).toBe('run');
    btn(page, /^Pause set/).click();
    expect(page.dataset.mode).toBe('pause');
    btn(page, /^Start set/).click();
    btn(page, /^Stop and log/).click();
    expect(page.dataset.mode).toBe('rest');
    expect(page.querySelector('.reel-set.done')?.textContent).toContain(`${first.repsMin - 1} × 42.5`);
    btn(page, /^Skip rest/).click();
    expect(page.dataset.mode).toBe('idle');
    // A set more than planned is just another start / stop
    for (let i = 0; i < first.sets; i++) doSet(page);
    expect(page.querySelectorAll('.reel-set.done')).toHaveLength(first.sets + 1);
  });

  it('edits or deletes a logged set', async () => {
    await go(app, `/workout/${day().id}`);
    const page = pages()[0];
    doSet(page);
    doSet(page);
    btn(page, /^Edit set 1/).click();
    const sheet = root.querySelector<HTMLElement>('.reel-sheet')!;
    expect(sheet.hidden).toBe(false);
    expect(sheet.querySelector('h2')?.textContent).toBe('Edit set 1');
    btn(sheet, /^More reps/).click();
    btn(sheet, /^More weight/).click();
    byText(sheet, 'button', 'Done').click();
    expect(sheet.hidden).toBe(true);
    const reps = day().exercises[0].repsMin;
    expect(page.querySelector('.reel-set.done')?.textContent).toContain(`${reps + 1} × 2.5`);
    btn(page, /^Edit set 2/).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sheet.hidden).toBe(true);
    btn(page, /^Edit set 2/).click();
    byText(sheet, 'button', 'Delete set').click();
    expect(page.querySelectorAll('.reel-set.done')).toHaveLength(1);
  });

  it('keeps progress in the draft shared with the list view, and saves the workout', async () => {
    await go(app, `/workout/${day().id}`);
    const summary = root.querySelector<HTMLElement>('.reel-summary')!;
    expect(byText<HTMLButtonElement>(summary, 'button', 'Save workout').disabled).toBe(true);
    doSet(pages()[0], 40);
    // Leaving and coming back keeps the set
    await go(app, '/');
    await go(app, `/workout/${day().id}`);
    expect(pages()[0].querySelectorAll('.reel-set.done')).toHaveLength(1);
    // The list view shows the same set and can add one
    await go(app, `/log/${day().id}`);
    const name = getExercise(day().exercises[0].exerciseId)!.name;
    expect(root.querySelector<HTMLInputElement>(`input[aria-label="${name} set 1 reps"]`)!.value).toBe(String(day().exercises[0].repsMin));
    byText(root.querySelector('.log-entry') as HTMLElement, 'button', '+ Add set').click();
    change(root.querySelector<HTMLInputElement>(`input[aria-label="${name} set 2 reps"]`)!, '3');
    await go(app, `/workout/${day().id}`);
    expect(pages()[0].querySelectorAll('.reel-set.done')).toHaveLength(2);

    time += 20 * 60 * 1000;
    byText(root.querySelector('.reel-summary') as HTMLElement, 'button', 'Save workout').click();
    await settle(app);
    expect(window.location.hash).toBe('#/progress');
    const log = state().workouts.at(-1)!;
    expect(log).toMatchObject({ date: '2026-10-27', dayId: day().id, durationMin: 21 });
    expect(log.entries).toEqual([{ exerciseId: day().exercises[0].exerciseId, sets: [{ reps: day().exercises[0].repsMin, weightKg: 0 }, { reps: 3, weightKg: 0 }] }]);
    await go(app, `/workout/${day().id}`);
    expect(pages()[0].textContent).toContain('No sets yet');
  });

  it('is only offered on phones; other devices get the list view', async () => {
    const id = day().id;
    expect(byText(root, 'a', 'Start workout').getAttribute('href')).toBe(`#/workout/${id}`);
    await go(app, `/log/${id}`);
    expect(byText(root, 'a', 'Switch to workout mode').getAttribute('href')).toBe(`#/workout/${id}`);
    // On a phone the home button starts workout mode even on a rest day
    const rest = onboardedState();
    rest.routine.trainingDays = [5];
    rest.plan = generatePlan(rest.goal, rest.routine, rest.profile);
    expect(byText(renderDashboard(fakeContext(rest)), 'a', 'Start workout').getAttribute('href')).toBe(`#/workout/${rest.plan[0].id}`);
    phone = false;
    expect(byText(renderDashboard(fakeContext(rest)), 'a', 'Log this workout').getAttribute('href')).toBe(`#/log/${rest.plan[0].id}`);
    await go(app, '/');
    expect(byText(root, 'a', 'Start workout').getAttribute('href')).toBe(`#/log/${id}`);
    await go(app, '/plan');
    expect(byText(root, 'a', 'Start this workout').getAttribute('href')).toBe(`#/log/${id}`);
    await go(app, `/log/${id}`);
    expect(root.textContent).not.toContain('Switch to workout mode');
    await go(app, `/workout/${id}`);
    await settle(app);
    expect(window.location.hash).toBe(`#/log/${id}`);
    expect(root.querySelector('.reel')).toBeNull();
  });

  it('pauses the workout clock while workout mode is closed and resumes it on return', async () => {
    const id = day().id;
    await go(app, `/workout/${id}`);
    doSet(pages()[0], 60);
    await go(app, '/');
    time += 30 * 60 * 1000; // away from workout mode: not counted
    await go(app, `/workout/${id}`);
    expect(root.querySelector('.reel-elapsed')?.textContent).toBe('01:00');
    time += 2 * 60 * 1000;
    byText(root.querySelector('.reel-summary') as HTMLElement, 'button', 'Save workout').click();
    await settle(app);
    expect(state().workouts.at(-1)!.durationMin).toBe(3);
  });

  it('counts time while the page was closed by the browser mid-workout, up to an hour', async () => {
    const id = day().id;
    const draft = (minutesAgo: number) => ({
      entries: [{ exerciseId: day().exercises[0].exerciseId, sets: [{ reps: 5, weightKg: 0 }] }],
      date: '', durationMin: null, notes: '', activeMs: 5 * 60_000, resumedAt: time - minutesAgo * 60_000,
    });
    app['repo'].setDraft(id, draft(10));
    await go(app, `/workout/${id}`);
    expect(root.querySelector('.reel-elapsed')?.textContent).toBe('15:00');
    await go(app, '/');
    app['repo'].setDraft(id, draft(300));
    await go(app, `/workout/${id}`);
    expect(root.querySelector('.reel-elapsed')?.textContent).toBe('65:00');
  });

  it('sends unknown days to the not-found page and free workouts to the list view', async () => {
    await go(app, '/workout/nope');
    expect(root.querySelector('.reel')).toBeNull();
    expect(root.querySelector('.topbar')).not.toBeNull();
    await go(app, '/workout/free');
    await settle(app);
    expect(window.location.hash).toBe('#/log/free');
  });
});
