import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../src/core/types';
import { ALEX, FakeCloud } from './fake-cloud';
import { byText, change, check, go, makeApp, NOW, onboardedState, settle } from './helpers';

afterEach(() => vi.restoreAllMocks());

function signedIn(name = 'Alex', updatedAt = NOW.toISOString()) {
  const cloud = new FakeCloud();
  cloud.user = ALEX;
  const s = onboardedState();
  s.profile.name = name;
  cloud.rows.set(ALEX.id, { data: s, updatedAt });
  return cloud;
}

/** A newer version saved by "another device". */
function newerInCloud(cloud: FakeCloud, name: string) {
  const s = onboardedState();
  s.profile.name = name;
  cloud.rows.set(ALEX.id, { data: s, updatedAt: new Date(NOW.getTime() + 3_600_000).toISOString() });
}

describe('App: first run', () => {
  it('without sign-in configured goes straight to setup and saves on the device', async () => {
    const { app, root, store } = await makeApp();
    expect(window.location.hash).toBe('#/onboarding');
    expect(root.querySelector('h2')?.textContent).toMatch(/achieve/);
    expect(root.querySelector('input[type="password"]')).toBeNull();
    // Step 1: goal
    check(root.querySelector<HTMLInputElement>('#goal-lose-weight')!, true);
    byText(root, 'button', 'Next').click();
    // Step 2: routine - require at least one day
    for (const i of [0, 2, 4]) check(root.querySelector<HTMLInputElement>(`#day-${i}`)!, false);
    byText(root, 'button', 'Next').click();
    expect(root.querySelector('.error')?.textContent).toMatch(/at least one/);
    check(root.querySelector<HTMLInputElement>('#day-1')!, true);
    check(root.querySelector<HTMLInputElement>('#day-3')!, true);
    check(root.querySelector<HTMLInputElement>('#minutes-30')!, true);
    check(root.querySelector<HTMLInputElement>('#time-morning')!, true);
    check(root.querySelector<HTMLInputElement>('#activity-sedentary')!, true);
    check(root.querySelector<HTMLInputElement>('#experience-beginner')!, true);
    check(root.querySelector<HTMLInputElement>('#eq-kettlebell')!, true);
    check(root.querySelector<HTMLInputElement>('#eq-dumbbell')!, false);
    byText(root, 'button', 'Next').click();
    // Step 3: about you (optional)
    expect(root.textContent).toContain('This step is optional');
    change(root.querySelector<HTMLInputElement>('#name')!, 'Jo');
    check(root.querySelector<HTMLInputElement>('#sex-female')!, true);
    change(root.querySelector<HTMLInputElement>('#age')!, '28');
    change(root.querySelector<HTMLInputElement>('#height')!, '165');
    change(root.querySelector<HTMLInputElement>('#weight')!, '62');
    byText(root, 'button', 'Next').click();
    // Step 4: plan preview, back and forth regenerates
    expect(root.querySelector('h2')?.textContent).toMatch(/Lose weight/);
    expect(root.textContent).toMatch(/kcal/);
    expect(root.textContent).toMatch(/sit a lot/);
    byText(root, 'button', 'Back').click();
    change(root.querySelector<HTMLInputElement>('#weight')!, '');
    byText(root, 'button', 'Next').click();
    expect(root.textContent).not.toMatch(/kcal/);
    byText(root, 'button', 'Back').click();
    change(root.querySelector<HTMLInputElement>('#weight')!, '62');
    byText(root, 'button', 'Next').click();
    expect(root.textContent).toMatch(/kcal/);
    expect(root.querySelectorAll('article.card')).toHaveLength(2);
    // The suggested plan is fixed until the user chooses to customise it
    expect(root.querySelector('#pd-0-biceps')).toBeNull();
    byText(root, 'button', 'Customise muscle groups').click();
    check(root.querySelector<HTMLInputElement>('#pd-0-biceps')!, true);
    expect(root.querySelector<HTMLInputElement>('#pd-0-biceps')!.checked).toBe(true);
    check(root.querySelector<HTMLInputElement>('#pd-0-biceps')!, false);
    byText(root, 'button', 'Done customising').click();
    expect(root.querySelector('#pd-0-biceps')).toBeNull();
    byText(root, 'button', 'Save my plan').click();
    await settle(app, 12);

    expect(window.location.hash).toBe('#/');
    const state = app.currentState!;
    expect(state.onboarded).toBe(true);
    expect(state.goal).toBe('lose-weight');
    expect(state.routine).toMatchObject({ trainingDays: [1, 3], minutesPerSession: 30, preferredTime: 'morning', activityLevel: 'sedentary' });
    expect(state.routine.equipment).toEqual(['bodyweight', 'kettlebell']);
    expect(state.profile).toMatchObject({ name: 'Jo', experience: 'beginner', sex: 'female', age: 28, heightCm: 165, weightKg: 62 });
    expect(state.bodyLogs).toEqual([{ date: '2026-10-27', weightKg: 62 }]);
    expect(state.plan).toHaveLength(2);
    expect(root.querySelector('h1')?.textContent).toBe('Hi, Jo');
    expect(store.read('local')?.state.profile.name).toBe('Jo');
    expect(store.mode()).toBe('local');
  });

  it('stores the onboarding weight in pounds correctly', async () => {
    const s = onboardedState();
    s.settings.units = 'lb';
    const { app, root } = await makeApp(s);
    await go(app, '/onboarding');
    byText(root, 'button', 'Next').click();
    byText(root, 'button', 'Next').click();
    expect(root.querySelector<HTMLInputElement>('#weight')!.value).toBe('154.3');
    change(root.querySelector<HTMLInputElement>('#weight')!, '220.46');
    byText(root, 'button', 'Next').click();
    byText(root, 'button', 'Save my plan').click();
    await settle(app, 12);
    expect(app.currentState!.profile.weightKg).toBeCloseTo(100, 1);
  });

  it('with sign-in configured offers Google or no account', async () => {
    const cloud = new FakeCloud();
    const { app, root, store } = await makeApp(undefined, { cloud });
    expect(root.querySelector('h1')?.textContent).toBe('Free gym coach. No subscription.');
    const google = byText<HTMLButtonElement>(root, 'button', 'Continue with Google');
    google.click();
    await settle(app);
    expect(cloud.signIns).toBe(1);
    expect(google.disabled).toBe(true);
    byText(root, 'button', 'Use without an account').click();
    await settle(app);
    expect(window.location.hash).toBe('#/onboarding');
    expect(store.mode()).toBe('local');
  });

  it('reports a sign-in that fails to start', async () => {
    const cloud = new FakeCloud();
    cloud.signInWithGoogle = async () => {
      throw new Error('popup blocked');
    };
    const { app, root } = await makeApp(undefined, { cloud });
    byText(root, 'button', 'Continue with Google').click();
    await settle(app);
    expect(root.querySelector('.toast')?.textContent).toBe('Could not start sign-in: popup blocked');
  });
});

describe('App: everyday use', () => {
  it('has a theme toggle and no lock button in the header', async () => {
    localStorage.removeItem('gymx:theme');
    const { app, root } = await makeApp(onboardedState());
    expect(root.querySelector('button[aria-label="Lock app"]')).toBeNull();
    const toggle = root.querySelector<HTMLButtonElement>('button[aria-label="Switch to dark theme"]')!;
    toggle.click();
    expect(root.querySelector('.theme-toggle')).toBe(toggle); // updated in place, no re-render
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('gymx:theme')).toBe('dark');
    root.querySelector<HTMLButtonElement>('button[aria-label="Switch to light theme"]')!.click();
    await settle(app);
    expect(document.documentElement.dataset.theme).toBe('light');
    localStorage.removeItem('gymx:theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('opens and closes the mobile menu', async () => {
    const { root } = await makeApp(onboardedState());
    const header = root.querySelector('header')!;
    const btn = root.querySelector<HTMLButtonElement>('button.menu-toggle')!;
    expect(btn.getAttribute('aria-controls')).toBe(root.querySelector('nav')!.id);
    btn.click();
    expect(header.classList.contains('menu-open')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Close menu');
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(header.classList.contains('menu-open')).toBe(false);
    btn.click();
    document.body.click(); // outside the header
    expect(header.classList.contains('menu-open')).toBe(false);
    btn.click();
    root.querySelector<HTMLAnchorElement>('nav a[aria-current="page"]')!.click();
    expect(header.classList.contains('menu-open')).toBe(false);
  });

  it('redirects to onboarding until it is finished, and handles unknown routes', async () => {
    const s = onboardedState();
    s.onboarded = false;
    const { app } = await makeApp(s);
    expect(window.location.hash).toBe('#/onboarding');
    await go(app, '/progress');
    expect(window.location.hash).toBe('#/onboarding');

    const { app: app2, root: root2 } = await makeApp(onboardedState());
    await go(app2, '/nowhere');
    expect(root2.querySelector('h1')?.textContent).toBe('Page not found');
  });

  it('routes to every section', async () => {
    const { app, root } = await makeApp(onboardedState());
    const expectations: [string, string][] = [
      ['/plan', 'My weekly plan'],
      ['/plan/edit', 'Edit your plan'],
      ['/exercises', 'Exercise library'],
      ['/exercises/squat-typo', 'Exercise not found'],
      ['/exercises/push-up', 'Push-up'],
      ['/exercises/push-up?from=plan', 'Push-up'],
      ['/log', 'Log a workout'],
      ['/log/free', 'Free workout'],
      ['/progress', 'Progress'],
      ['/settings', 'Settings'],
      ['/onboarding', 'Update goal & routine'],
    ];
    for (const [path, title] of expectations) {
      await go(app, path);
      expect(root.querySelector('main h1')?.textContent, path).toBe(title);
    }
  });

  it('shows a toast when saving on the device fails', async () => {
    const { app, root } = await makeApp(onboardedState());
    await go(app, '/settings');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    check(root.querySelector<HTMLInputElement>('#units-lb')!, true);
    await settle(app);
    expect(root.querySelector('.toast')?.textContent).toMatch(/^Could not save: Could not save on this device/);
  });

  it('toasts when connectivity changes and cleans up listeners', async () => {
    const { app, root } = await makeApp(onboardedState());
    window.dispatchEvent(new Event('offline'));
    expect(root.querySelector('.toast')?.textContent).toMatch(/offline/);
    window.dispatchEvent(new Event('online'));
    expect(root.querySelector('.toast')?.textContent).toBe('Back online.');
    app.dispose();
    window.dispatchEvent(new Event('offline'));
    expect(root.querySelector('.toast')?.textContent).toBe('Back online.');
  });
});

describe('App: signed in with Google', () => {
  it("loads the account's data on a new device and shows the account in Settings", async () => {
    const { app, root, store } = await makeApp(undefined, { cloud: signedIn('Sam') });
    expect(root.querySelector('h1')?.textContent).toBe('Hi, Sam');
    await go(app, '/settings');
    expect(root.textContent).toContain('Signed in as alex@example.com');
    expect(root.querySelector('[data-sync-status]')?.textContent).toBe('All changes saved to your account.');
    expect(store.mode()).toBe('cloud');
  });

  it('uploads edits and updates the sync status in place', async () => {
    const cloud = signedIn();
    const { app, root } = await makeApp(undefined, { cloud });
    await go(app, '/settings');
    const status = root.querySelector('[data-sync-status]')!;
    cloud.offline = true;
    check(root.querySelector<HTMLInputElement>('#animations')!, false);
    await settle(app);
    expect(status.isConnected).toBe(true);
    expect(status.textContent).toMatch(/Offline/);
    cloud.offline = false;
    window.dispatchEvent(new Event('online'));
    await settle(app);
    expect(status.textContent).toBe('All changes saved to your account.');
    expect((cloud.rows.get(ALEX.id)?.data as AppState).settings.animations).toBe(false);
  });

  it('shows newer data from another device when back online', async () => {
    const cloud = signedIn();
    const { app, root } = await makeApp(undefined, { cloud });
    newerInCloud(cloud, 'Phone edit');
    window.dispatchEvent(new Event('online'));
    await settle(app);
    expect(root.querySelector('h1')?.textContent).toBe('Hi, Phone edit');
  });

  it('holds back synced data during a workout, then saves the workout on top of it', async () => {
    const cloud = signedIn();
    const { app, root } = await makeApp(undefined, { cloud });
    await go(app, `/log/${app.currentState!.plan[0].id}`);
    newerInCloud(cloud, 'Phone edit');
    window.dispatchEvent(new Event('online'));
    await settle(app);
    expect(app.currentState!.profile.name).toBe('Alex'); // not swapped mid-workout
    change(root.querySelector<HTMLInputElement>('input.num')!, '10');
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app, 12);
    expect(app.currentState!.profile.name).toBe('Phone edit');
    expect(app.currentState!.workouts).toHaveLength(1);
    expect((cloud.rows.get(ALEX.id)?.data as AppState).workouts).toHaveLength(1);
  });

  it('applies held-back data when leaving the workout without saving', async () => {
    const cloud = signedIn();
    const { app } = await makeApp(undefined, { cloud });
    await go(app, '/log/free');
    newerInCloud(cloud, 'Phone edit');
    window.dispatchEvent(new Event('online'));
    await settle(app);
    expect(app.currentState!.profile.name).toBe('Alex');
    await go(app, '/');
    expect(app.currentState!.profile.name).toBe('Phone edit');
  });

  it('asks which data to keep after signing in with data on both sides', async () => {
    const cloud = signedIn('Account');
    const local = onboardedState();
    local.profile.name = 'Device';
    const { app, root } = await makeApp(local, { cloud });
    expect(root.querySelector('h1')?.textContent).toBe('Which data should we keep?');
    byText(root, 'button', 'Keep my account data').click();
    await settle(app);
    expect(root.querySelector('h1')?.textContent).toBe('Hi, Account');
  });

  it('warns before signing out with changes that have not uploaded', async () => {
    const cloud = signedIn();
    const { app, root, store } = await makeApp(undefined, { cloud });
    await go(app, '/settings');
    cloud.offline = true;
    check(root.querySelector<HTMLInputElement>('#units-lb')!, true);
    await settle(app);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    byText(root, 'button', 'Sign out').click();
    await settle(app);
    expect(confirmSpy).toHaveBeenCalledWith("Some changes haven't uploaded yet. Sign out anyway?");
    expect(app.currentState).not.toBeNull();

    confirmSpy.mockReturnValue(true);
    byText(root, 'button', 'Sign out').click();
    await settle(app);
    expect(app.currentState).toBeNull();
    expect(root.textContent).toContain('Continue with Google');
    expect(store.read({ user: ALEX.id })).toBeNull();
  });

  it('deletes the account data and returns to the first screen', async () => {
    const cloud = signedIn();
    const { app, root } = await makeApp(undefined, { cloud });
    await go(app, '/settings');
    expect(root.textContent).toContain('from your account and this device');
    root.querySelector<HTMLInputElement>('#delete-confirm')!.value = 'DELETE';
    byText(root, 'button', 'Delete all my data').click();
    await settle(app);
    expect(cloud.rows.has(ALEX.id)).toBe(false);
    expect(root.textContent).toContain('Continue with Google');
  });

  it('offers sign-in from Settings in local mode', async () => {
    const cloud = new FakeCloud();
    const { app, root } = await makeApp(onboardedState(), { cloud });
    await go(app, '/settings');
    byText(root, 'button', 'Sign in with Google to sync').click();
    await settle(app);
    expect(cloud.signIns).toBe(1);
  });
});
