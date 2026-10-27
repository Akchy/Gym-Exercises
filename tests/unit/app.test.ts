import { afterEach, describe, expect, it, vi } from 'vitest';
import { VAULT_KEY } from '../../src/core/vault';
import { byText, check, change, go, makeApp, onboardedState, PASS, settle, unlock } from './helpers';

afterEach(() => vi.restoreAllMocks());

describe('App: first run', () => {
  it('shows the welcome screen and validates the passphrase form', async () => {
    const { root } = await makeApp();
    expect(root.querySelector('h1')?.textContent).toContain('No sign-up');
    const form = root.querySelector('form')!;
    const pass = root.querySelector<HTMLInputElement>('#new-pass')!;
    const confirmEl = root.querySelector<HTMLInputElement>('#confirm-pass')!;
    const error = root.querySelector('.error')!;

    pass.value = 'short';
    pass.dispatchEvent(new Event('input'));
    expect(root.querySelector('.strength small')?.textContent).toMatch(/at least/);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(error.textContent).toMatch(/at least/);

    pass.value = 'Strong-Passphrase-9';
    pass.dispatchEvent(new Event('input'));
    expect(root.querySelector('.strength small')?.textContent).toBe('Strong');
    confirmEl.value = 'different-passphrase';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(error.textContent).toMatch(/do not match/);

    confirmEl.value = 'Strong-Passphrase-9';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(error.textContent).toMatch(/no recovery/);
  });

  it('creates an encrypted vault and runs the onboarding wizard', async () => {
    const { app, root, storage } = await makeApp();
    root.querySelector<HTMLInputElement>('#new-pass')!.value = PASS;
    root.querySelector<HTMLInputElement>('#confirm-pass')!.value = PASS;
    root.querySelector<HTMLInputElement>('#ack')!.checked = true;
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app, 12);

    expect(window.location.hash).toBe('#/onboarding');
    expect(root.querySelector('h2')?.textContent).toMatch(/achieve/);
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
    const biceps = root.querySelector<HTMLInputElement>('#pd-0-biceps')!;
    check(biceps, true);
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

    // Nothing sensitive is stored in plaintext
    const raw = (await storage.getItem(VAULT_KEY))!;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['ct', 'iter', 'iv', 'kdf', 'salt', 'v']);
    expect(raw).not.toMatch(/"Jo"|lose-weight|kettlebell|"profile"/);
  });

  it('stores the onboarding weight in pounds correctly', async () => {
    const s = onboardedState();
    s.settings.units = 'lb';
    const { app, root } = await makeApp(s);
    await unlock(app, root);
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
});

describe('App: unlock, lock and auto-lock', () => {
  it('rejects a wrong passphrase and accepts the right one', async () => {
    const { app, root } = await makeApp(onboardedState());
    expect(root.querySelector('h1')?.textContent).toBe('Welcome back');
    await unlock(app, root, 'wrong passphrase!');
    expect(root.querySelector('.error')?.textContent).toBe('Wrong passphrase.');
    expect(app.isUnlocked).toBe(false);
    await unlock(app, root);
    expect(app.isUnlocked).toBe(true);
    expect(root.querySelector('h1')?.textContent).toBe('Hi, Alex');
    expect(root.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Home');
  });

  it('locks from the header and forgets the decrypted state', async () => {
    const { app, root, vault } = await makeApp(onboardedState());
    await unlock(app, root);
    root.querySelector<HTMLButtonElement>('button[aria-label="Lock app"]')!.click();
    await settle(app);
    expect(app.isUnlocked).toBe(false);
    expect(vault.isUnlocked).toBe(false);
    expect(root.textContent).not.toContain('Alex');
    expect(root.querySelector('#unlock-pass')).not.toBeNull();
  });

  it('auto-locks after the configured inactivity', async () => {
    const { app, root } = await makeApp(onboardedState());
    expect(app.checkAutoLock()).toBe(false); // already locked
    await unlock(app, root);
    expect(app.checkAutoLock(Date.now() + 60_000)).toBe(false);
    expect(app.checkAutoLock(Date.now() + 15 * 60_000 + 1)).toBe(true);
    expect(app.isUnlocked).toBe(false);
  });

  it('resets everything when the user forgot the passphrase', async () => {
    const { app, root, vault } = await makeApp(onboardedState());
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    byText(root, 'button', /Forgot passphrase/).click();
    await settle(app);
    expect(await vault.exists()).toBe(true);
    byText(root, 'button', /Forgot passphrase/).click();
    await settle(app);
    expect(await vault.exists()).toBe(false);
    expect(root.querySelector('#new-pass')).not.toBeNull();
  });

  it('redirects to onboarding until it is finished, and handles unknown routes', async () => {
    const s = onboardedState();
    s.onboarded = false;
    const { app, root } = await makeApp(s);
    await unlock(app, root);
    expect(window.location.hash).toBe('#/onboarding');
    await go(app, '/progress');
    expect(window.location.hash).toBe('#/onboarding');

    const { app: app2, root: root2 } = await makeApp(onboardedState());
    await unlock(app2, root2);
    await go(app2, '/nowhere');
    expect(root2.querySelector('h1')?.textContent).toBe('Page not found');
  });

  it('routes to every section', async () => {
    const { app, root } = await makeApp(onboardedState());
    await unlock(app, root);
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

  it('persists edits encrypted so they survive a reload', async () => {
    const { app, root, storage } = await makeApp(onboardedState());
    await unlock(app, root);
    await go(app, '/settings');
    check(root.querySelector<HTMLInputElement>('#units-lb')!, true);
    await settle(app);
    const { Vault } = await import('../../src/core/vault');
    const data = await new Vault(storage, 1000).unlock<{ settings: { units: string } }>(PASS);
    expect(data.settings.units).toBe('lb');
  });

  it('shows a toast when saving fails', async () => {
    const { app, root, vault } = await makeApp(onboardedState());
    await unlock(app, root);
    vi.spyOn(vault, 'save').mockRejectedValueOnce(new Error('disk full'));
    await go(app, '/settings');
    check(root.querySelector<HTMLInputElement>('#units-lb')!, true);
    await settle(app);
    expect(root.querySelector('.toast')?.textContent).toBe('Could not save: disk full');
  });
});

describe('App: restore from the welcome screen', () => {
  it('restores an encrypted backup onto an empty device', async () => {
    const { MemoryStorageAdapter } = await import('../../src/core/storage');
    const { Vault } = await import('../../src/core/vault');
    const source = new Vault(new MemoryStorageAdapter(), 1000);
    await source.create('backup passphrase', onboardedState());
    const backup = JSON.stringify(await source.exportEncrypted());

    const { app, root } = await makeApp();
    const fileInput = root.querySelector<HTMLInputElement>('#restore-file')!;
    const form = fileInput.form!;
    const setFile = (f: File) => Object.defineProperty(fileInput, 'files', { value: [f], configurable: true });
    const error = () => form.querySelector('.error')!.textContent;

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(error()).toBe('Choose a backup file.');
    const big = new File(['x'], 'big.json');
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    setFile(big);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(error()).toMatch(/too large/);

    setFile(new File([backup], 'backup.json'));
    root.querySelector<HTMLInputElement>('#restore-pass')!.value = 'wrong';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app, 12);
    expect(error()).toBe('Wrong passphrase for this backup.');

    setFile(new File(['{"bad":1}'], 'backup.json'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app, 12);
    expect(error()).toMatch(/not a recognised/);

    setFile(new File([backup], 'backup.json'));
    root.querySelector<HTMLInputElement>('#restore-pass')!.value = 'backup passphrase';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(app, 12);
    expect(app.isUnlocked).toBe(true);
    expect(root.querySelector('h1')?.textContent).toBe('Hi, Alex');
  });
});

describe('App: onboarding details', () => {
  it('lets the user skip the optional "about you" step', async () => {
    const s = onboardedState();
    s.onboarded = false;
    s.profile = { ...s.profile, name: '', age: null, heightCm: null, weightKg: null };
    const { app, root } = await makeApp(s);
    await unlock(app, root);
    byText(root, 'button', 'Next').click();
    byText(root, 'button', 'Next').click();
    expect(root.querySelector('.steps .current')?.textContent).toBe('About you (optional)');
    byText(root, 'button', 'Skip this step').click();
    expect(root.querySelector('h2')?.textContent).toMatch(/Suggested plan/);
    expect(root.querySelector('button.link')?.textContent).toBe('Customise muscle groups');
    byText(root, 'button', 'Save my plan').click();
    await settle(app, 12);
    expect(app.currentState!.onboarded).toBe(true);
    expect(app.currentState!.bodyLogs).toEqual([]);
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
