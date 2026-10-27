import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/ui/app';
import { generatePlan } from '../../src/core/planner';
import { createDefaultState } from '../../src/core/state';
import { MemoryStorageAdapter } from '../../src/core/storage';
import { Vault } from '../../src/core/vault';
import type { AppState, PlanDay } from '../../src/core/types';
import { nextPlanDay, renderDashboard } from '../../src/ui/views/dashboard';
import { lastWeight } from '../../src/ui/views/log';
import { failureDelayMs, renderUnlock } from '../../src/ui/views/lock';
import { backupFileName, MAX_BACKUP_BYTES } from '../../src/ui/views/settings';
import { renderExerciseList } from '../../src/ui/views/exercises';
import { byText, change, check, fakeContext, go, ITER, makeApp, onboardedState, PASS, settle, unlock } from './helpers';

let app: App;
let root: HTMLElement;
let vault: Vault;
let storage: MemoryStorageAdapter;
const state = () => app.currentState as AppState;

beforeEach(async () => {
  ({ app, root, vault, storage } = await makeApp(onboardedState()));
  await unlock(app, root);
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

describe('plan editor', () => {
  beforeEach(() => go(app, '/plan'));

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
    expect(root.querySelector('.exercise-card svg.animated')).not.toBeNull();
  });

  it('mounts figures lazily and pauses off-screen animations when IntersectionObserver exists', () => {
    const callbacks: IntersectionObserverCallback[] = [];
    const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: IntersectionObserverCallback) { callbacks.push(cb); }
      observe = observe;
    });
    const view = renderExerciseList(fakeContext(onboardedState(), { animate: () => true }));
    const holder = view.querySelector('.figure-holder')!;
    expect(holder.firstChild).toBeNull();
    const svgProto = Object.getPrototypeOf(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const pause = vi.fn();
    const unpause = vi.fn();
    svgProto.pauseAnimations = pause;
    svgProto.unpauseAnimations = unpause;
    callbacks[0]([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(holder.querySelector('svg')).not.toBeNull();
    expect(unpause).toHaveBeenCalled();
    callbacks[0]([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(pause).toHaveBeenCalled();
    delete svgProto.pauseAnimations;
    delete svgProto.unpauseAnimations;
    vi.unstubAllGlobals();
  });

  it('shows details, toggles animation/stop images and adds to a plan day', async () => {
    await go(app, '/exercises/burpee');
    expect(root.querySelector('h1')?.textContent).toBe('Burpee');
    expect(root.querySelectorAll('ol li').length).toBeGreaterThan(1);
    expect(root.querySelector('.figure-large svg.animated')).not.toBeNull();
    const toggle = byText(root, 'button', 'Show start/end images');
    toggle.click();
    expect(root.querySelector('.figure-large svg.static')).not.toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    expect(root.querySelector('.figure-large svg.animated')).not.toBeNull();
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
    expect(root.querySelector('.figure-large svg.static')).not.toBeNull();
  });
});

describe('workout logging', () => {
  it('lists plan days and an empty workout option', async () => {
    await go(app, '/log');
    expect(root.querySelectorAll('.link-card')).toHaveLength(4);
  });

  it('logs a planned workout with edited sets', async () => {
    const day = state().plan[0];
    await go(app, `/log/${day.id}`);
    expect(root.querySelectorAll('.log-entry')).toHaveLength(day.exercises.length);
    const first = root.querySelector('.log-entry')!;
    const name = first.querySelector('h2')!.textContent;
    change(first.querySelector<HTMLInputElement>(`input[aria-label="${name} set 1 reps"]`)!, '8');
    change(first.querySelector<HTMLInputElement>(`input[aria-label="${name} set 1 weight (kg)"]`)!, '22.5');
    byText(first, 'button', '+ Set').click();
    const sets = root.querySelector('.log-entry')!.querySelectorAll('tbody tr').length;
    expect(sets).toBe(day.exercises[0].sets + 1);
    root.querySelector('.log-entry')!.querySelector<HTMLButtonElement>('button[aria-label^="Remove set 2"]')!.click();
    byText(root.querySelectorAll('.log-entry')[1] as HTMLElement, 'button', 'Remove exercise').click();
    expect(root.querySelectorAll('.log-entry')).toHaveLength(day.exercises.length - 1);
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Add exercise"]')!, 'plank');
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Add exercise"]')!, 'not-real');
    change(root.querySelector<HTMLInputElement>('#log-duration')!, '50');
    root.querySelector<HTMLTextAreaElement>('#log-notes')!.value = 'Felt strong';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app);

    expect(window.location.hash).toBe('#/progress');
    const log = state().workouts[0];
    expect(log).toMatchObject({ date: '2026-10-27', dayId: day.id, durationMin: 50, notes: 'Felt strong' });
    expect(log.entries[0].sets[0]).toEqual({ reps: 8, weightKg: 22.5 });
    expect(log.entries[0].sets).toHaveLength(day.exercises[0].sets);
    expect(log.entries.at(-1)?.exerciseId).toBe('plank');
    expect(root.textContent).toContain('Personal records');

    // Next time, the last weight is prefilled
    await go(app, `/log/${day.id}`);
    expect(root.querySelector<HTMLInputElement>(`input[aria-label="${name} set 1 weight (kg)"]`)!.value).toBe('22.5');
  });

  it('validates the form', async () => {
    await go(app, '/log/free');
    const form = root.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(root.querySelector('.error')?.textContent).toMatch(/at least one set/);
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Add exercise"]')!, 'push-up');
    root.querySelector<HTMLInputElement>('#log-date')!.value = '2030-01-01';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(root.querySelector('.error')?.textContent).toMatch(/valid date/);
    expect(state().workouts).toHaveLength(0);
    // Removing the last set then adding a fresh one
    root.querySelector<HTMLButtonElement>('button[aria-label^="Remove set 1"]')!.click();
    byText(root, 'button', '+ Set').click();
    expect(root.querySelector<HTMLInputElement>('input[aria-label="Push-up set 1 reps"]')!.value).toBe('10');
  });

  it('logs weights entered in pounds as kilograms', async () => {
    await go(app, '/settings');
    change(root.querySelector<HTMLSelectElement>('#units')!, 'lb');
    await settle(app);
    await go(app, '/log/free');
    change(root.querySelector<HTMLSelectElement>('select[aria-label="Add exercise"]')!, 'dumbbell-curl');
    change(root.querySelector<HTMLInputElement>('input[aria-label="Dumbbell Biceps Curl set 1 weight (lb)"]')!, '22.0462');
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app);
    expect(state().workouts[0].entries[0].sets[0].weightKg).toBeCloseTo(10, 2);
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

  it('changes preferences', async () => {
    change(root.querySelector<HTMLSelectElement>('#auto-lock')!, '5');
    await settle(app);
    expect(state().settings.autoLockMinutes).toBe(5);
  });

  it('changes the passphrase', async () => {
    const submit = () => root.querySelector<HTMLInputElement>('#cur-pass')!.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    const set = (cur: string, a: string, b: string) => {
      root.querySelector<HTMLInputElement>('#cur-pass')!.value = cur;
      root.querySelector<HTMLInputElement>('#next-pass')!.value = a;
      root.querySelector<HTMLInputElement>('#next-pass2')!.value = b;
    };
    set(PASS, 'short', 'short');
    submit();
    expect(root.textContent).toContain('at least');
    set(PASS, 'new passphrase 456', 'new passphrase 457');
    submit();
    expect(root.textContent).toContain('do not match');
    set('wrong passphrase', 'new passphrase 456', 'new passphrase 456');
    submit();
    await settle(app, 12);
    expect(root.textContent).toContain('Current passphrase is wrong.');
    set(PASS, 'new passphrase 456', 'new passphrase 456');
    submit();
    await settle(app, 12);
    expect(root.textContent).toContain('Passphrase changed.');
    const fresh = new Vault(storage, ITER);
    await expect(fresh.unlock(PASS)).rejects.toThrow();
    expect((await fresh.unlock<AppState>('new passphrase 456')).profile.name).toBe('Alex');
  });

  it('exports an encrypted backup file', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    byText(root, 'button', 'Download encrypted backup').click();
    await settle(app);
    expect(clicks).toEqual([backupFileName('2026-10-27')]);
    const blob = (createObjectURL.mock.calls[0] as unknown[])[0] as Blob;
    const text = await blob.text();
    expect(JSON.parse(text)).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256' });
    expect(text).not.toContain('Alex');
  });

  it('restores a backup with its passphrase', async () => {
    const other = new Vault(new MemoryStorageAdapter(), ITER);
    const restored = onboardedState();
    restored.profile.name = 'Restored';
    await other.create('backup passphrase', restored);
    const backup = JSON.stringify(await other.exportEncrypted());
    const fileInput = root.querySelector<HTMLInputElement>('#import-file')!;
    const submit = () => fileInput.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    const setFile = (f: File) => Object.defineProperty(fileInput, 'files', { value: [f], configurable: true });

    submit();
    expect(root.textContent).toContain('Choose a backup file.');
    setFile(new File(['x'], 'big.json'));
    Object.defineProperty(fileInput.files![0], 'size', { value: MAX_BACKUP_BYTES + 1 });
    submit();
    expect(root.textContent).toContain('too large');

    setFile(new File([backup], 'backup.json'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    submit();
    await settle(app);
    expect(state().profile.name).toBe('Alex');

    confirmSpy.mockReturnValue(true);
    root.querySelector<HTMLInputElement>('#import-pass')!.value = 'wrong one';
    submit();
    await settle(app, 12);
    expect(root.textContent).toContain('Wrong passphrase for this backup.');

    setFile(new File(['{"not":"a backup"}'], 'x.json'));
    submit();
    await settle(app, 12);
    expect(root.textContent).toContain('not a recognised');

    setFile(new File([backup], 'backup.json'));
    root.querySelector<HTMLInputElement>('#import-pass')!.value = 'backup passphrase';
    submit();
    await settle(app, 12);
    expect(state().profile.name).toBe('Restored');
    expect(window.location.hash).toBe('#/');
    const fresh = new Vault(storage, ITER);
    expect((await fresh.unlock<AppState>('backup passphrase')).profile.name).toBe('Restored');
  });

  it('locks from settings', async () => {
    byText(root, 'button', 'Lock now').click();
    await settle(app);
    expect(app.isUnlocked).toBe(false);
  });

  it('deletes all data only after typing DELETE', async () => {
    byText(root, 'button', 'Delete all my data').click();
    await settle(app);
    expect(await vault.exists()).toBe(true);
    expect(root.querySelector('.toast')?.textContent).toBe('Type DELETE to confirm.');
    root.querySelector<HTMLInputElement>('#delete-confirm')!.value = 'DELETE';
    byText(root, 'button', 'Delete all my data').click();
    await settle(app);
    expect(await vault.exists()).toBe(false);
    expect(await storage.getItem('vault')).toBeNull();
    expect(root.querySelector('#new-pass')).not.toBeNull();
  });
});

describe('lock screen helpers', () => {
  it('backs off after repeated failures', () => {
    expect(failureDelayMs(1)).toBe(0);
    expect(failureDelayMs(2)).toBe(0);
    expect(failureDelayMs(3)).toBe(1000);
    expect(failureDelayMs(5)).toBe(4000);
    expect(failureDelayMs(20)).toBe(30_000);
  });

  it('applies the delay and shows non-crypto errors', async () => {
    const sleep = vi.fn(async () => {});
    const el = renderUnlock({ create: vi.fn(), restore: vi.fn(), reset: vi.fn(), unlock: vi.fn().mockRejectedValue(new Error('No vault found')) }, sleep);
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(el.querySelector('.error')?.textContent).toBe('No vault found');
    expect(sleep).toHaveBeenCalledWith(0);
  });
});
