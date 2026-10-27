import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/ui/app';
import { generatePlan } from '../../src/core/planner';
import { createDefaultState, MAX_WEIGHT_KG } from '../../src/core/state';
import type { DeviceStore } from '../../src/core/store';
import type { AppState, PlanDay } from '../../src/core/types';
import { nextPlanDay, renderDashboard } from '../../src/ui/views/dashboard';
import { draftToEntries, lastWeight, readDraft } from '../../src/ui/views/log';
import { prescriptionText } from '../../src/ui/views/plan';
import { backupFileName, MAX_BACKUP_BYTES, renderSettings, syncStatusText } from '../../src/ui/views/settings';
import type { InstallManager } from '../../src/pwa/register';
import { BACK_TARGETS } from '../../src/ui/views/exercises';
import { byText, change, check, fakeContext, go, makeApp, onboardedState, settle } from './helpers';

let app: App;
let root: HTMLElement;
let store: DeviceStore;
const state = () => app.currentState as AppState;

beforeEach(async () => {
  ({ app, root, store } = await makeApp(onboardedState()));
});
afterEach(() => vi.restoreAllMocks());

describe('dashboard', () => {
  it('finds the next scheduled plan day', () => {
    const plan = [{ weekday: 1 }, { weekday: 3 }, { weekday: null }] as PlanDay[];
    expect(nextPlanDay(plan, 1)?.inDays).toBe(0);
    expect(nextPlanDay(plan, 2)).toEqual({ day: plan[1], inDays: 1 });
    expect(nextPlanDay(plan, 4)).toEqual({ day: plan[0], inDays: 4 });
    expect(nextPlanDay([{ weekday: null }] as PlanDay[], 4)?.inDays).toBe(0);
    expect(nextPlanDay([], 4)).toBeNull();
  });

  it("shows today's workout (Tuesday) with stats and nutrition", () => {
    expect(root.querySelector('#today-title')?.textContent).toBe("Today's workout");
    expect(byText(root, 'a', 'Start workout').getAttribute('href')).toBe(`#/log/${state().plan[0].id}`);
    expect(root.querySelector('.stats')?.textContent).toContain('0/3');
    expect(root.textContent).toContain('kcal');
  });

  it('shows rest days, completed days and empty plans', () => {
    const s = onboardedState();
    s.routine.trainingDays = [2];
    s.plan = generatePlan(s.goal, s.routine, s.profile);
    s.profile.age = null;
    const view = renderDashboard(fakeContext(s));
    expect(view.querySelector('#today-title')?.textContent).toMatch(/Rest day/);
    expect(view.textContent).toContain('Tomorrow');
    expect(view.textContent).not.toContain('kcal');

    const done = onboardedState();
    done.workouts.push({ id: 'w1', date: '2026-10-27', dayId: null, entries: [], durationMin: null, notes: '' });
    expect(renderDashboard(fakeContext(done)).querySelector('#today-title')?.textContent).toMatch(/Done for today/);

    const empty = createDefaultState();
    expect(renderDashboard(fakeContext(empty)).textContent).toContain('No plan yet');

    const later = onboardedState();
    later.routine.trainingDays = [5];
    later.plan = generatePlan(later.goal, later.routine, later.profile);
    expect(renderDashboard(fakeContext(later)).textContent).toContain('On Saturday');
  });
});

describe('plan (read-only)', () => {
  beforeEach(() => go(app, '/plan'));

  it('shows a simple fixed plan with today highlighted and an edit button', () => {
    expect(root.querySelector('h1')?.textContent).toBe('My weekly plan');
    expect(byText(root, 'a', 'Edit plan').getAttribute('href')).toBe('#/plan/edit');
    const sections = root.querySelectorAll('section.plan-view');
    expect(sections).toHaveLength(3);
    expect(sections[0].classList.contains('today')).toBe(true);
    expect(sections[0].querySelector('.badge')?.textContent).toBe('Today');
    expect(root.querySelectorAll('input, select')).toHaveLength(0);
    expect(byText(sections[0] as HTMLElement, 'a', 'Start this workout').getAttribute('href')).toBe(`#/log/${state().plan[0].id}`);
    const firstItem = sections[0].querySelector('.exercise-item summary')!;
    expect(firstItem.textContent).toMatch(/sets × .* reps · \d+ s rest/);
  });

  it('expands an exercise in place to show how to do it', () => {
    const details = root.querySelector<HTMLDetailsElement>('.exercise-item')!;
    expect(details.querySelector('.how-to')!.childElementCount).toBe(0);
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    const howTo = details.querySelector('.how-to')!;
    expect(howTo.querySelector('.demo')).not.toBeNull();
    expect(howTo.querySelectorAll('ol li').length).toBeGreaterThan(1);
    const link = byText(howTo as HTMLElement, 'a', 'Open full guide');
    expect(link.getAttribute('href')).toMatch(/\?from=plan$/);
    details.dispatchEvent(new Event('toggle')); // re-toggle doesn't duplicate content
    expect(howTo.querySelectorAll('ol')).toHaveLength(1);
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    expect(howTo.querySelectorAll('ol')).toHaveLength(1);
  });

  it('shows an empty state and cardio notes', async () => {
    await app['context']().update((s) => {
      s.plan[0].cardioMinutes = 20;
      s.plan[1].weekday = null;
    });
    await go(app, '/plan');
    expect(root.textContent).toContain('+ 20 min cardio');
    expect(root.textContent).toContain('Any day');
    await app['context']().update((s) => (s.plan = []));
    expect(root.textContent).toContain('Your plan is empty');
  });

  it('formats prescriptions', () => {
    expect(prescriptionText({ sets: 3, repsMin: 8, repsMax: 12, restSec: 90 })).toBe('3 sets × 8–12 reps · 90 s rest');
    expect(prescriptionText({ sets: 5, repsMin: 5, repsMax: 5, restSec: 180 })).toBe('5 sets × 5 reps · 180 s rest');
  });
});

describe('plan editor', () => {
  beforeEach(() => go(app, '/plan/edit'));

  it('has a Done button back to the fixed plan', () => {
    expect(byText(root, 'a', 'Done').getAttribute('href')).toBe('#/plan');
    expect(root.querySelector('.plan-day tbody a')?.getAttribute('href')).toMatch(/\?from=plan-edit$/);
  });

  it('renames a day and changes its weekday', async () => {
    change(root.querySelector<HTMLInputElement>('.day-name')!, '  Chest Day  ');
    await settle(app);
    expect(state().plan[0].name).toBe('  Chest Day  ');
    change(root.querySelector<HTMLInputElement>('.day-name')!, '');
    await settle(app);
    expect(state().plan[0].name).toBe('Workout');
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Weekday"]')!, '6');
    await settle(app);
    expect(state().plan[0].weekday).toBe(6);
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Weekday"]')!, '');
    await settle(app);
    expect(state().plan[0].weekday).toBeNull();
  });

  it('toggles muscle groups and suggests matching exercises', async () => {
    const id = state().plan[0].id;
    for (const g of state().plan[0].muscleGroups) check(root.querySelector<HTMLInputElement>(`#m-${id}-${g}`)!, false);
    await settle(app);
    check(root.querySelector<HTMLInputElement>(`#m-${id}-calves`)!, true);
    await settle(app);
    expect(state().plan[0].muscleGroups).toEqual(['calves']);
    byText(root, 'button', 'Suggest exercises for these muscles').click();
    await settle(app);
    expect(state().plan[0].exercises.map((e) => e.exerciseId)).toEqual(['calf-raise']);
  });

  it('edits sets, reps and rest with clamping', async () => {
    const card = root.querySelector('.plan-day')!;
    const name = card.querySelector('tbody a')!.textContent;
    change(card.querySelector<HTMLInputElement>(`input[aria-label="Sets for ${name}"]`)!, '99');
    await settle(app);
    expect(state().plan[0].exercises[0].sets).toBe(10);
    change(root.querySelector<HTMLInputElement>(`input[aria-label="Minimum reps for ${name}"]`)!, '20');
    await settle(app);
    expect(state().plan[0].exercises[0]).toMatchObject({ repsMin: 20, repsMax: 20 });
    change(root.querySelector<HTMLInputElement>(`input[aria-label="Maximum reps for ${name}"]`)!, '5');
    await settle(app);
    expect(state().plan[0].exercises[0]).toMatchObject({ repsMin: 5, repsMax: 5 });
    change(root.querySelector<HTMLInputElement>(`input[aria-label="Rest seconds for ${name}"]`)!, '45');
    await settle(app);
    expect(state().plan[0].exercises[0].restSec).toBe(45);
    change(root.querySelector<HTMLInputElement>('input[aria-label="Cardio minutes"]')!, '12');
    await settle(app);
    expect(state().plan[0].cardioMinutes).toBe(12);
  });

  it('reorders, removes and adds exercises', async () => {
    const before = state().plan[0].exercises.map((e) => e.exerciseId);
    root.querySelectorAll<HTMLButtonElement>('.plan-day')[0].querySelectorAll<HTMLButtonElement>('button[aria-label^="Move"]')[1].click();
    await settle(app);
    expect(state().plan[0].exercises.slice(0, 2).map((e) => e.exerciseId)).toEqual([before[1], before[0]]);
    root.querySelector<HTMLButtonElement>('.plan-day button[aria-label^="Remove"]')!.click();
    await settle(app);
    expect(state().plan[0].exercises).toHaveLength(before.length - 1);

    const picker = root.querySelector<HTMLSelectElement>('.plan-day select[aria-label^="Add exercise"]')!;
    const allBox = root.querySelector<HTMLInputElement>('.plan-day input[id^="all-"]')!;
    const filteredCount = picker.options.length;
    check(allBox, true);
    expect(picker.options.length).toBeGreaterThan(filteredCount);
    change(picker, 'burpee');
    await settle(app);
    expect(state().plan[0].exercises.at(-1)?.exerciseId).toBe('burpee');
    change(root.querySelector<HTMLSelectElement>('.plan-day select[aria-label^="Add exercise"]')!, '');
    await settle(app);
    expect(state().plan[0].exercises.at(-1)?.exerciseId).toBe('burpee');
  });

  it('adds, deletes and regenerates days', async () => {
    byText(root, 'button', '+ Add training day').click();
    await settle(app);
    expect(state().plan).toHaveLength(4);
    expect(root.textContent).toContain('No exercises yet.');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    root.querySelectorAll<HTMLButtonElement>('.plan-day button.link.danger')[3].click();
    await settle(app);
    expect(state().plan).toHaveLength(3);
    const ids = state().plan.map((d) => d.id);
    byText(root, 'button', 'Regenerate the whole plan').click();
    await settle(app);
    expect(state().plan.map((d) => d.id)).not.toEqual(ids);
    confirmSpy.mockReturnValue(false);
    const ids2 = state().plan.map((d) => d.id);
    byText(root, 'button', 'Regenerate the whole plan').click();
    root.querySelectorAll<HTMLButtonElement>('.plan-day button.link.danger')[0].click();
    await settle(app);
    expect(state().plan.map((d) => d.id)).toEqual(ids2);
  });
});

describe('exercise library', () => {
  it('filters by muscle, equipment and search', async () => {
    await go(app, '/exercises');
    const count = () => root.querySelectorAll('.exercise-card').length;
    const mineCount = count();
    check(root.querySelector<HTMLInputElement>('#only-mine')!, false);
    expect(count()).toBeGreaterThan(mineCount);
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Muscle group"]')!, 'biceps');
    expect([...root.querySelectorAll('.exercise-card strong')].map((e) => e.textContent)).toContain('Barbell Curl');
    const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'hammer';
    search.dispatchEvent(new Event('input'));
    expect(count()).toBe(1);
    expect(root.textContent).toContain('1 exercise');
    expect(root.querySelector('.exercise-card img')).not.toBeNull();
  });

  it('uses photo thumbnails, with the stick figure as fallback', async () => {
    await go(app, '/exercises');
    check(root.querySelector<HTMLInputElement>('#only-mine')!, false);
    const pushUp = byText(root, '.exercise-card', /Push-up/);
    expect(pushUp.querySelector('img')?.getAttribute('src')).toBe('/exercises/push-up-0.webp');
    expect(pushUp.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    const burpee = byText(root, '.exercise-card', /Burpee/);
    expect(burpee.querySelector('svg.exercise-figure')).not.toBeNull();
    expect(root.textContent).toContain('public domain');
  });

  it('shows details, toggles animation/stop images and adds to a plan day', async () => {
    await go(app, '/exercises/burpee');
    expect(root.querySelector('h1')?.textContent).toBe('Burpee');
    expect(root.querySelectorAll('ol li').length).toBeGreaterThan(1);
    expect(root.querySelector('.demo-large svg.animated')).not.toBeNull();
    const toggle = byText(root, 'button', 'Show still images');
    toggle.click();
    expect(root.querySelector('.demo-large svg.static')).not.toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent).toBe('Play animation');
    toggle.click();
    expect(root.querySelector('.demo-large svg.animated')).not.toBeNull();
    expect(byText(root, 'a', '← All exercises').getAttribute('href')).toBe('#/exercises');
    byText(root, 'button', 'Add to plan').click();
    await settle(app);
    expect(state().plan[0].exercises.some((e) => e.exerciseId === 'burpee')).toBe(true);
    byText(root, 'button', 'Add to plan').click();
    await settle(app);
    expect(state().plan[0].exercises.filter((e) => e.exerciseId === 'burpee')).toHaveLength(1);
    expect(root.querySelector('.toast')?.textContent).toContain('Burpee added');
  });

  it('respects the animations setting', async () => {
    await go(app, '/settings');
    check(root.querySelector<HTMLInputElement>('#animations')!, false);
    await settle(app);
    await go(app, '/exercises/push-up');
    expect(root.querySelector('.demo-large .demo.photo.static')).not.toBeNull();
  });

  it('shows the professional photos as a cross-fade or start/end pair', async () => {
    await go(app, '/exercises/push-up');
    const anim = root.querySelector('.demo-large .demo.photo.animated')!;
    expect([...anim.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(['/exercises/push-up-0.webp', '/exercises/push-up-1.webp']);
    byText(root, 'button', 'Show still images').click();
    const still = root.querySelector('.demo-large .demo.photo.static')!;
    expect([...still.querySelectorAll('figcaption')].map((f) => f.textContent)).toEqual(['1. Start', '2. End']);
    expect(still.querySelector('img')?.getAttribute('alt')).toBe('Push-up: start position');
  });

  it('goes back to wherever the user came from', async () => {
    for (const [from, href, label] of [
      ['plan', '#/plan', '← Back to my plan'],
      ['plan-edit', '#/plan/edit', '← Back to editing'],
      ['home', '#/', '← Back to home'],
      ['nonsense', '#/exercises', '← All exercises'],
    ]) {
      await go(app, `/exercises/push-up?from=${from}`);
      expect(byText(root, 'a', label).getAttribute('href')).toBe(href);
    }
    await go(app, '/exercises/nope?from=plan');
    expect(byText(root, 'a', '← Back to my plan')).toBeTruthy();
    expect(BACK_TARGETS.plan[0]).toBe('#/plan');
  });
});

describe('workout logging', () => {
  it('lists plan days and a free workout option', async () => {
    await go(app, '/log');
    expect(root.querySelectorAll('.link-card')).toHaveLength(4);
  });

  it('starts each exercise with one empty set and shows targets as hints', async () => {
    const day = state().plan[0];
    await go(app, `/log/${day.id}`);
    expect(root.querySelector('h1')?.textContent).toBe(day.name);
    const entries = root.querySelectorAll('.log-entry');
    expect(entries).toHaveLength(day.exercises.length);
    for (const entry of entries) expect(entry.querySelectorAll('tbody tr')).toHaveLength(1);
    const first = entries[0];
    const reps = first.querySelector<HTMLInputElement>('input[aria-label$="set 1 reps"]')!;
    expect(reps.value).toBe('');
    expect(reps.placeholder).toBe(`${day.exercises[0].repsMin}–${day.exercises[0].repsMax}`);
    expect(first.textContent).toContain('Target: ');
    expect(first.querySelector('button[aria-label^="Remove set"]')).toBeNull();
  });

  it('shows how to do each exercise inside the log', async () => {
    await go(app, `/log/${state().plan[0].id}`);
    const details = root.querySelector<HTMLDetailsElement>('.how-to-toggle')!;
    expect(details.querySelector('summary')?.textContent).toBe('How to do it');
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    expect(details.querySelector('.demo')).not.toBeNull();
    expect(details.querySelectorAll('ol li').length).toBeGreaterThan(1);
    details.dispatchEvent(new Event('toggle'));
    expect(details.querySelectorAll('ol')).toHaveLength(1);
  });

  it('logs only the sets the user filled in', async () => {
    const day = state().plan[0];
    await go(app, `/log/${day.id}`);
    const first = root.querySelector('.log-entry')!;
    const name = first.querySelector('h2')!.textContent;
    change(first.querySelector<HTMLInputElement>(`input[aria-label="${name} set 1 reps"]`)!, '8');
    change(first.querySelector<HTMLInputElement>(`input[aria-label="${name} set 1 weight (kg)"]`)!, '22.5');
    byText(first as HTMLElement, 'button', '+ Add set').click();
    const again = root.querySelector('.log-entry')!;
    expect(again.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(again.querySelector<HTMLInputElement>(`input[aria-label="${name} set 2 reps"]`)!.value).toBe('8');
    change(again.querySelector<HTMLInputElement>(`input[aria-label="${name} set 2 reps"]`)!, '6');
    change(again.querySelector<HTMLInputElement>(`input[aria-label="${name} set 2 weight (kg)"]`)!, '');
    byText(again as HTMLElement, 'button', '+ Add set').click();
    root.querySelector('.log-entry')!.querySelector<HTMLButtonElement>('button[aria-label^="Remove set 3"]')!.click();
    byText(root.querySelectorAll('.log-entry')[1] as HTMLElement, 'button', 'Remove exercise').click();
    expect(root.querySelectorAll('.log-entry')).toHaveLength(day.exercises.length - 1);
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Add exercise"]')!, 'plank');
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Add exercise"]')!, 'not-real');
    change(root.querySelector<HTMLInputElement>('input[aria-label="Plank set 1 reps"]')!, '45');
    change(root.querySelector<HTMLInputElement>('input[aria-label="Plank set 1 reps"]')!, '');
    change(root.querySelector<HTMLInputElement>('#log-duration')!, '50');
    root.querySelector<HTMLTextAreaElement>('#log-notes')!.value = 'Felt strong';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app);

    expect(window.location.hash).toBe('#/progress');
    const log = state().workouts[0];
    expect(log).toMatchObject({ date: '2026-10-27', dayId: day.id, durationMin: 50, notes: 'Felt strong' });
    expect(log.entries).toEqual([{ exerciseId: day.exercises[0].exerciseId, sets: [{ reps: 8, weightKg: 22.5 }, { reps: 6, weightKg: 0 }] }]);

    // Next time: still empty inputs, but the last weight appears as a hint
    await go(app, `/log/${day.id}`);
    const w = root.querySelector<HTMLInputElement>(`input[aria-label="${name} set 1 weight (kg)"]`)!;
    expect(w.value).toBe('');
    expect(w.placeholder).toBe('22.5');
  });

  it('validates the form', async () => {
    await go(app, '/log/free');
    expect(root.querySelectorAll('.log-entry')).toHaveLength(0);
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(root.querySelector('.error')?.textContent).toMatch(/at least one set/);
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Add exercise"]')!, 'push-up');
    expect(root.querySelector<HTMLInputElement>('input[aria-label="Push-up set 1 reps"]')!.placeholder).toBe('reps');
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(root.querySelector('.error')?.textContent).toMatch(/at least one set/);
    change(root.querySelector<HTMLInputElement>('input[aria-label="Push-up set 1 reps"]')!, '10');
    root.querySelector<HTMLInputElement>('#log-date')!.value = '2030-01-01';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(root.querySelector('.error')?.textContent).toMatch(/valid date/);
    expect(state().workouts).toHaveLength(0);
  });

  it('logs weights entered in pounds as kilograms', async () => {
    await go(app, '/settings');
    check(root.querySelector<HTMLInputElement>('#units-lb')!, true);
    await settle(app);
    await go(app, '/log/free');
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Add exercise"]')!, 'dumbbell-curl');
    change(root.querySelector<HTMLInputElement>('input[aria-label="Dumbbell Biceps Curl set 1 reps"]')!, '10');
    change(root.querySelector<HTMLInputElement>('input[aria-label="Dumbbell Biceps Curl set 1 weight (lb)"]')!, '22.0462');
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app);
    expect(state().workouts[0].entries[0].sets[0].weightKg).toBeCloseTo(10, 2);
  });

  it('keeps an unfinished workout when leaving the page and picks it up again', async () => {
    const day = state().plan[0];
    await go(app, `/log/${day.id}`);
    const firstName = root.querySelector('.log-entry h2')!.textContent!;
    const reps = root.querySelector<HTMLInputElement>(`input[aria-label="${firstName} set 1 reps"]`)!;
    reps.value = '9';
    reps.dispatchEvent(new Event('input', { bubbles: true })); // typed, not yet left the field
    root.querySelector<HTMLTextAreaElement>('#log-notes')!.value = 'felt strong';
    root.querySelector('#log-notes')!.dispatchEvent(new Event('input', { bubbles: true }));

    await go(app, '/log');
    expect(byText(root, `a[href="#/log/${day.id}"]`, /Unsaved workout in progress/)).toBeTruthy();
    expect(root.querySelector('a[href="#/log/free"] .in-progress')).toBeNull();

    await go(app, `/log/${day.id}`);
    expect(root.textContent).toContain('Picked up your unsaved workout from earlier.');
    expect(root.querySelector<HTMLInputElement>(`input[aria-label="${firstName} set 1 reps"]`)!.value).toBe('9');
    expect(root.querySelector<HTMLTextAreaElement>('#log-notes')!.value).toBe('felt strong');

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app);
    expect(state().workouts.at(-1)?.notes).toBe('felt strong');
    await go(app, `/log/${day.id}`);
    expect(root.textContent).not.toContain('Picked up your unsaved workout');
    expect(root.querySelector<HTMLInputElement>(`input[aria-label="${firstName} set 1 reps"]`)!.value).toBe('');
  });

  it('can discard an unfinished workout', async () => {
    await go(app, '/log/free');
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Add exercise"]')!, 'plank');
    await go(app, '/');
    await go(app, '/log/free');
    expect(root.querySelectorAll('.log-entry')).toHaveLength(1);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    byText(root, 'button', 'Discard and start over').click();
    await settle(app);
    expect(root.querySelectorAll('.log-entry')).toHaveLength(1);
    confirmSpy.mockReturnValue(true);
    byText(root, 'button', 'Discard and start over').click();
    await settle(app);
    expect(root.querySelectorAll('.log-entry')).toHaveLength(0);
    expect(root.textContent).not.toContain('Picked up');
  });

  it('readDraft accepts only well-formed drafts', () => {
    expect(readDraft(null)).toBeNull();
    expect(readDraft('x')).toBeNull();
    const d = readDraft({
      entries: [{ exerciseId: 'push-up', sets: [{ reps: 5.4, weightKg: 5000 }, { reps: 'x' }] }, { exerciseId: 'nope', sets: [] }, 'junk'],
      date: '2026-13-01',
      durationMin: -3,
      notes: 'a\u0000b',
    })!;
    expect(d.entries).toEqual([{ exerciseId: 'push-up', sets: [{ reps: 5, weightKg: MAX_WEIGHT_KG }, { reps: null, weightKg: null }] }]);
    expect(d.date).toBe('');
    expect(d.durationMin).toBe(0);
    expect(d.notes).toBe('ab');
  });

  it('caps weights at the same limit the saved data uses, and shows the correction', async () => {
    const save = async (units: 'kg' | 'lb', typed: string) => {
      await go(app, '/settings');
      check(root.querySelector<HTMLInputElement>(`#units-${units}`)!, true);
      await settle(app);
      await go(app, '/log/free');
      const picker = root.querySelector<HTMLSelectElement>('select[aria-label="Add exercise"]')!;
      change(picker, 'barbell-squat');
      change(root.querySelector<HTMLInputElement>('input[aria-label="Barbell Back Squat set 1 reps"]')!, '1');
      const weight = root.querySelector<HTMLInputElement>(`input[aria-label="Barbell Back Squat set 1 weight (${units})"]`)!;
      expect(Number(weight.max)).toBe(units === 'kg' ? MAX_WEIGHT_KG : 2204.6);
      change(weight, typed);
      const shown = weight.value;
      root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle(app);
      return { shown, savedKg: state().workouts.at(-1)!.entries[0].sets[0].weightKg };
    };
    expect(await save('kg', '1500')).toEqual({ shown: '1000', savedKg: 1000 });
    const lb = await save('lb', '3000');
    expect(lb.shown).toBe('2204.6');
    expect(lb.savedKg).toBeCloseTo(MAX_WEIGHT_KG, 6);
    const ok = await save('lb', '2000');
    expect(ok.shown).toBe('2000');
    expect(ok.savedKg).toBeCloseTo(907.185, 3);
  });

  it('draftToEntries drops empty sets and exercises', () => {
    expect(draftToEntries([
      { exerciseId: 'push-up', target: null, sets: [{ reps: null, weightKg: 5 }, { reps: 0, weightKg: null }] },
      { exerciseId: 'plank', target: null, sets: [{ reps: 30, weightKg: null }] },
    ])).toEqual([{ exerciseId: 'plank', sets: [{ reps: 30, weightKg: 0 }] }]);
  });

  it('lastWeight returns the most recent weight', () => {
    const s = onboardedState();
    s.workouts = [
      { id: 'a', date: '2026-10-01', dayId: null, entries: [{ exerciseId: 'push-up', sets: [{ reps: 5, weightKg: 10 }] }], durationMin: null, notes: '' },
      { id: 'b', date: '2026-10-05', dayId: null, entries: [{ exerciseId: 'push-up', sets: [{ reps: 5, weightKg: 15 }, { reps: 5, weightKg: 12 }] }], durationMin: null, notes: '' },
    ];
    expect(lastWeight(s.workouts, 'push-up')).toBe(15);
    expect(lastWeight(s.workouts, 'plank')).toBe(0);
  });
});

describe('progress', () => {
  async function seed() {
    await app['context']().update((s) => {
      s.workouts = [
        { id: 'w1', date: '2026-10-20', dayId: s.plan[0].id, entries: [{ exerciseId: 'dumbbell-curl', sets: [{ reps: 10, weightKg: 10 }] }, { exerciseId: 'push-up', sets: [{ reps: 15, weightKg: 0 }] }], durationMin: null, notes: '' },
        { id: 'w2', date: '2026-10-27', dayId: null, entries: [{ exerciseId: 'dumbbell-curl', sets: [{ reps: 10, weightKg: 12 }] }], durationMin: null, notes: '' },
      ];
    });
    await go(app, '/progress');
  }

  it('shows stats, charts, records and muscle group bars', async () => {
    await seed();
    expect(root.querySelector('.stats')?.textContent).toContain('2total workouts');
    expect(root.querySelector('.stats')?.textContent).toContain('2week streak');
    expect(root.querySelector('.chart-wrap figcaption')?.textContent).toContain('kg (est. 1RM)');
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Exercise to chart"]')!, 'push-up');
    expect(root.querySelector('.chart-wrap figcaption')?.textContent).toContain('reps');
    expect(root.querySelectorAll('.bars li')).toHaveLength(2);
    expect((root.querySelector('.bars .bar') as HTMLElement).style.getPropertyValue('--w')).toBe('100%');
    expect(root.querySelectorAll('.history li')).toHaveLength(2);
  });

  it('deletes a workout after confirmation', async () => {
    await seed();
    const spy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    root.querySelector<HTMLButtonElement>('.history button')!.click();
    await settle(app);
    expect(state().workouts).toHaveLength(2);
    root.querySelector<HTMLButtonElement>('.history button')!.click();
    await settle(app);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(state().workouts.map((w) => w.id)).toEqual(['w1']);
  });

  it('records body weight and validates it', async () => {
    await go(app, '/progress');
    expect(root.textContent).toContain('Log a workout to see your progress here.');
    const form = () => root.querySelector<HTMLFormElement>('#bw-value')!.form!;
    root.querySelector<HTMLInputElement>('#bw-value')!.value = '';
    form().dispatchEvent(new Event('submit', { cancelable: true }));
    expect(root.textContent).toContain('Enter a valid date and weight.');
    root.querySelector<HTMLInputElement>('#bw-value')!.value = '5';
    form().dispatchEvent(new Event('submit', { cancelable: true }));
    expect(root.textContent).toContain('out of range');
    root.querySelector<HTMLInputElement>('#bw-value')!.value = '71.2';
    form().dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app);
    root.querySelector<HTMLInputElement>('#bw-date')!.value = '2026-10-01';
    root.querySelector<HTMLInputElement>('#bw-value')!.value = '73';
    form().dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app);
    expect(state().bodyLogs).toEqual([{ date: '2026-10-01', weightKg: 73 }, { date: '2026-10-27', weightKg: 71.2 }]);
    expect(state().profile.weightKg).toBe(71.2);
    expect(root.textContent).toContain('change since 2026-10-01: -1.8 kg');
  });
});

describe('settings', () => {
  beforeEach(() => go(app, '/settings'));

  it('changes preferences and has no lock or passphrase settings', async () => {
    check(root.querySelector<HTMLInputElement>('#units-lb')!, true);
    await settle(app);
    expect(state().settings.units).toBe('lb');
    expect(store.read('local')?.state.settings.units).toBe('lb');
    expect(root.querySelector('#auto-lock')).toBeNull();
    expect(root.textContent).not.toMatch(/passphrase|Lock now|encrypt/i);
  });

  it('shows local-mode account info without sign-in when Supabase is not configured', () => {
    expect(root.textContent).toContain('Your data is stored on this device only.');
    expect(() => byText(root, 'button', 'Sign in with Google to sync')).toThrow();
  });

  it('describes every sync status', () => {
    expect(syncStatusText('synced')).toMatch(/saved to your account/);
    expect(syncStatusText('saving')).toBe('Saving…');
    expect(syncStatusText('offline')).toMatch(/back online/);
    expect(syncStatusText('local')).toMatch(/this device only/);
    expect(syncStatusText('error', 'permission denied')).toBe("Couldn't save to your account: permission denied. Your changes are kept on this device and will be retried.");
  });

  it('exports a plain backup file', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    byText(root, 'button', 'Download backup').click();
    await settle(app);
    expect(clicks).toEqual(['gym-backup-2026-10-27.json']);
    expect(backupFileName('2026-10-27')).toBe('gym-backup-2026-10-27.json');
    const blob = (createObjectURL.mock.calls[0] as unknown[])[0] as Blob;
    expect(JSON.parse(await blob.text())).toMatchObject({ version: 1, profile: { name: 'Alex' } });
  });

  it('restores a backup file', async () => {
    const restored = onboardedState();
    restored.profile.name = 'Restored';
    const backup = JSON.stringify(restored);
    const fileInput = root.querySelector<HTMLInputElement>('#import-file')!;
    const submit = () => fileInput.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    const setFile = (f: File) => Object.defineProperty(fileInput, 'files', { value: [f], configurable: true });

    submit();
    expect(root.textContent).toContain('Choose a backup file.');
    setFile(new File(['x'], 'big.json'));
    Object.defineProperty(fileInput.files![0], 'size', { value: MAX_BACKUP_BYTES + 1 });
    submit();
    expect(root.textContent).toContain('too large');

    setFile(new File(['{"not":"a backup"}'], 'x.json'));
    submit();
    await settle(app);
    expect(root.textContent).toContain('That file is not a GymFree backup.');

    setFile(new File([backup], 'backup.json'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    submit();
    await settle(app);
    expect(state().profile.name).toBe('Alex');

    confirmSpy.mockReturnValue(true);
    submit();
    await settle(app);
    expect(state().profile.name).toBe('Restored');
    expect(window.location.hash).toBe('#/');
    expect(store.read('local')?.state.profile.name).toBe('Restored');
  });

  it('deletes all data only after typing DELETE', async () => {
    byText(root, 'button', 'Delete all my data').click();
    await settle(app);
    expect(store.read('local')).not.toBeNull();
    expect(root.querySelector('.toast')?.textContent).toBe('Type DELETE to confirm.');
    root.querySelector<HTMLInputElement>('#delete-confirm')!.value = 'DELETE';
    byText(root, 'button', 'Delete all my data').click();
    await settle(app);
    expect(store.read('local')).toBeNull();
    expect(app.currentState).toBeNull();
    expect(root.querySelector('h1')?.textContent).toBe('Your gym plan, built around your week.');
  });

  it('reports a failed delete instead of going back to the start', async () => {
    const destroy = vi.fn(async () => {
      throw new Error('Failed to fetch');
    });
    const ctx = fakeContext(onboardedState(), { destroy });
    const view = renderSettings(ctx);
    view.querySelector<HTMLInputElement>('#delete-confirm')!.value = 'DELETE';
    byText(view, 'button', 'Delete all my data').click();
    await settle();
    expect(ctx.toast).toHaveBeenCalledWith('Could not delete your account data. Check your connection and try again.');
  });
});

describe('install & offline UI', () => {
  function manager(over: Partial<InstallManager>) {
    return { canPrompt: false, isStandalone: false, isIos: false, installed: false, prompt: vi.fn(async () => true), subscribe: vi.fn(), ...over } as unknown as InstallManager;
  }

  it('shows an install card on the dashboard when the browser offers it', async () => {
    const install = manager({ canPrompt: true });
    const ctx = fakeContext(onboardedState(), { install });
    const view = renderDashboard(ctx);
    const btn = byText(view, 'button', 'Install app');
    btn.click();
    await settle();
    expect(install.prompt).toHaveBeenCalled();
    expect(ctx.toast).toHaveBeenCalledWith('GymFree installed.');
    expect(view.querySelector('.install-card')).toBeNull();
    expect(renderDashboard(fakeContext(onboardedState(), { install: manager({ canPrompt: true, isStandalone: true }) })).querySelector('.install-card')).toBeNull();
    expect(renderDashboard(fakeContext(onboardedState())).querySelector('.install-card')).toBeNull();
  });

  it('explains how to install in settings for each platform', async () => {
    const cases: [Partial<InstallManager> | undefined, RegExp][] = [
      [{ isStandalone: true }, /Installed/],
      [{ installed: true }, /Installed/],
      [{ isIos: true }, /Add to Home Screen/],
      [{}, /browser menu/],
      [undefined, /browser menu/],
    ];
    for (const [over, text] of cases) {
      const view = renderSettings(fakeContext(onboardedState(), { install: over ? manager(over) : undefined }));
      expect(view.textContent).toMatch(text);
    }
    const install = manager({ canPrompt: true, prompt: vi.fn(async () => false) });
    const ctx = fakeContext(onboardedState(), { install });
    byText(renderSettings(ctx), 'button', 'Install GymFree').click();
    await settle();
    expect(install.prompt).toHaveBeenCalled();
    expect(ctx.toast).not.toHaveBeenCalled();
  });
});
