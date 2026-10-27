import { expect, test, type Page } from '@playwright/test';

const PASS = 'correct horse battery 42';

async function createVault(page: Page) {
  await page.goto('/');
  await page.getByLabel('Choose a passphrase').fill(PASS);
  await page.getByLabel('Repeat passphrase').fill(PASS);
  await page.getByLabel(/cannot be recovered/).check();
  await page.getByRole('button', { name: 'Create my private space' }).click();
  await expect(page.getByRole('heading', { name: "Let's set you up" })).toBeVisible();
}

/** The main nav, opening the hamburger menu first on narrow screens. */
async function mainNav(page: Page) {
  const menu = page.getByRole('button', { name: 'Open menu' });
  if (await menu.isVisible()) await menu.click();
  return page.getByRole('navigation', { name: 'Main' });
}

async function onboard(page: Page) {
  await page.getByText('Build muscle').click();
  await page.getByRole('button', { name: 'Next' }).click();
  // Routine: Tue, Thu, Sat; 45 minutes; gym equipment
  for (const d of ['Mon', 'Wed', 'Fri']) await page.getByRole('group', { name: 'Training days' }).getByText(d).click();
  for (const d of ['Tue', 'Thu', 'Sat']) await page.getByRole('group', { name: 'Training days' }).getByText(d).click();
  await page.getByText('Mostly sitting (desk job, little walking)').click();
  await page.getByText('Intermediate (6+ months)').click();
  await page.getByRole('group', { name: 'Equipment' }).getByText('Barbell & rack').click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('This step is optional')).toBeVisible();
  await page.getByLabel('Nickname').fill('Riley');
  await page.getByLabel('Age').fill('29');
  await page.getByLabel('Height (cm)').fill('178');
  await page.getByLabel('Body weight (kg)').fill('74');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: /Suggested plan: Build muscle/ })).toBeVisible();
  await expect(page.getByText(/kcal/)).toBeVisible();
  await page.getByRole('button', { name: 'Save my plan' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Riley' })).toBeVisible();
}

test.describe('GymFree end-to-end', () => {
  test('first run: create vault, onboard, and data is encrypted at rest', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    await createVault(page);
    await onboard(page);

    const stored = await page.evaluate(() => localStorage.getItem('gymx:vault'));
    expect(stored).toBeTruthy();
    const envelope = JSON.parse(stored!);
    expect(envelope).toMatchObject({ v: 1, kdf: 'PBKDF2-SHA256', iter: 600000 });
    expect(stored).not.toContain('Riley');
    expect(stored).not.toContain('gain-muscle');
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['gymx:vault']);
    expect(consoleErrors).toEqual([]);
  });

  test('persists across reloads and requires the passphrase', async ({ page }) => {
    await createVault(page);
    await onboard(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Riley')).toHaveCount(0);
    await page.getByLabel('Passphrase').fill('not the passphrase');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong passphrase.');
    await page.getByLabel('Passphrase').fill(PASS);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('heading', { name: 'Hi, Riley' })).toBeVisible();
  });

  test('fixed plan: learn an exercise in place and come back to the plan', async ({ page }) => {
    await createVault(page);
    await onboard(page);
    await (await mainNav(page)).getByRole('link', { name: 'Plan' }).click();
    await expect(page.getByRole('heading', { name: 'My weekly plan' })).toBeVisible();
    // Read-only: no form controls until the user chooses to edit
    await expect(page.locator('main input, main select')).toHaveCount(0);

    const firstItem = page.locator('.exercise-item').first();
    const exName = (await firstItem.locator('summary strong').textContent())!;
    await firstItem.locator('summary').click();
    const photo = firstItem.locator('.how-to .demo img').first();
    await expect(photo).toBeVisible();
    expect(await photo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await expect(firstItem.locator('.how-to ol li').first()).toBeVisible();

    await firstItem.getByRole('link', { name: 'Open full guide' }).click();
    await expect(page.getByRole('heading', { name: exName })).toBeVisible();
    await page.getByRole('link', { name: '← Back to my plan' }).click();
    await expect(page.getByRole('heading', { name: 'My weekly plan' })).toBeVisible();

    // Browser back also returns to the plan
    await page.locator('.exercise-item').first().locator('summary').click();
    await page.getByRole('link', { name: 'Open full guide' }).first().click();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'My weekly plan' })).toBeVisible();
  });

  test('edit the plan only when asked, then log a workout set by set', async ({ page }) => {
    await createVault(page);
    await onboard(page);
    await page.goto('/#/plan');
    await page.getByRole('link', { name: 'Edit plan' }).click();
    await expect(page.getByRole('heading', { name: 'Edit your plan' })).toBeVisible();
    const firstDay = page.locator('.plan-day').first();
    await firstDay.getByLabel('Day name').fill('Chest & Arms');
    await firstDay.getByLabel('Day name').blur();
    await firstDay.getByText('show all exercises').click();
    await firstDay.getByLabel(/^Add exercise to/).selectOption('hammer-curl');
    await expect(page.locator('.plan-day').first().getByRole('link', { name: 'Hammer Curl' })).toBeVisible();
    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'My weekly plan' })).toBeVisible();
    const chestDay = page.locator('section.plan-view', { hasText: 'Chest & Arms' });
    await expect(chestDay.getByText('Hammer Curl')).toBeVisible();

    await chestDay.getByRole('link', { name: 'Start this workout' }).click();
    await expect(page.getByRole('heading', { name: 'Chest & Arms' })).toBeVisible();
    // Every exercise starts with exactly one empty set
    const entries = page.locator('.log-entry');
    const count = await entries.count();
    for (let i = 0; i < count; i++) await expect(entries.nth(i).locator('tbody tr')).toHaveCount(1);
    await expect(page.getByLabel('Hammer Curl set 1 reps')).toHaveValue('');

    const hammer = page.locator('.log-entry', { hasText: 'Hammer Curl' });
    await hammer.getByText('How to do it').click();
    await expect(hammer.locator('.how-to .demo img').first()).toBeVisible();

    await page.getByLabel('Hammer Curl set 1 reps').fill('12');
    await page.getByLabel('Hammer Curl set 1 weight (kg)').fill('14');
    // Switching theme mid-workout must not wipe what was typed
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByLabel('Hammer Curl set 1 weight (kg)')).toHaveValue('14');
    await hammer.getByRole('button', { name: 'Increase by 2.5' }).click();
    await expect(page.getByLabel('Hammer Curl set 1 weight (kg)')).toHaveValue('15');
    await hammer.getByRole('button', { name: 'Decrease by 2.5' }).click();
    await hammer.getByRole('button', { name: '+ Add set' }).click();
    await page.getByLabel('Hammer Curl set 2 reps').fill('10');
    await page.getByRole('button', { name: 'Save workout' }).click();

    await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Workout saved');
    await expect(page.locator('.history li')).toHaveCount(1);
    await expect(page.locator('.history li')).toContainText('1 exercises');
    await page.getByLabel('Exercise to chart').selectOption('hammer-curl');
    await expect(page.locator('.chart-wrap figcaption').first()).toContainText('kg (est. 1RM)');

    await page.getByLabel(/^Weight \(kg\)/).fill('73.5');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText(/Latest 73.5 kg/)).toBeVisible();
  });

  test('controls follow the app theme (no stock dropdowns in setup)', async ({ page }) => {
    await createVault(page);
    await expect(page.locator('select')).toHaveCount(0);
    await page.getByText('Build muscle').click();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('main select')).toHaveCount(0);
    const chip = page.locator('label.chip', { hasText: '45 min' });
    const bg = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    // Remaining selects elsewhere are restyled, not native
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save my plan' }).click();
    await page.goto('/#/exercises');
    const appearance = await page.getByLabel('Muscle group').evaluate((el) => getComputedStyle(el).appearance);
    expect(['none', 'base-select']).toContain(appearance);
    const cb = await page.locator('#only-mine').evaluate((el) => getComputedStyle(el).appearance);
    expect(cb).toBe('none');
  });

  test('exercise library shows animations and still images', async ({ page }) => {
    await createVault(page);
    await onboard(page);
    await (await mainNav(page)).getByRole('link', { name: 'Exercises' }).click();
    await page.getByLabel('Muscle group').selectOption('legs');
    await page.getByPlaceholder('Search exercises').fill('squat');
    await expect(page.locator('.exercise-card').first()).toBeVisible();
    await page.getByRole('link', { name: /Barbell Back Squat/ }).click();
    await expect(page.getByRole('heading', { name: 'Barbell Back Squat' })).toBeVisible();
    const demo = page.locator('.demo-large .demo');
    await expect(demo).toHaveAttribute('aria-label', /animation/);
    // The end photo cross-fades over the start photo
    const endPhoto = demo.locator('img').nth(1);
    const opacities = new Set<string>();
    for (let i = 0; i < 8; i++) {
      opacities.add(await endPhoto.evaluate((el) => Number(getComputedStyle(el).opacity).toFixed(1)));
      await page.waitForTimeout(250);
    }
    expect(opacities.size).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Show still images' }).click();
    await expect(demo).toHaveAttribute('aria-label', /start and end position/);
    await expect(demo.getByText('1. Start')).toBeVisible();

    // Exercises without photos fall back to the stick-figure animation
    await page.goto('/#/exercises/burpee');
    await expect(page.locator('.demo-large svg')).toHaveAttribute('aria-label', /animation/);
  });

  test('reduced motion users get still images', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await createVault(page);
    await onboard(page);
    await page.goto('/#/exercises/push-up');
    await expect(page.locator('.demo-large .demo')).toHaveAttribute('aria-label', /start and end position/);
    await context.close();
  });

  test('settings: change passphrase, backup round-trip and delete data', async ({ page }) => {
    await createVault(page);
    await onboard(page);
    await (await mainNav(page)).getByRole('link', { name: 'Settings' }).click();

    await page.getByLabel('Current passphrase').fill(PASS);
    await page.getByLabel('New passphrase', { exact: true }).fill('another long passphrase');
    await page.getByLabel('Repeat new passphrase').fill('another long passphrase');
    await page.getByRole('button', { name: 'Change passphrase' }).click();
    await expect(page.getByText('Passphrase changed.')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download encrypted backup' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^gym-backup-\d{4}-\d{2}-\d{2}\.encrypted\.json$/);
    const backupPath = await download.path();

    page.on('dialog', (d) => d.accept());
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await page.getByRole('button', { name: 'Delete all my data' }).click();
    await expect(page.getByRole('heading', { name: /No sign-up/ })).toBeVisible();
    expect(await page.evaluate(() => localStorage.length)).toBe(0);

    // Restore the backup onto the now-empty device from the welcome screen
    await page.getByText('Moving from another device?').click();
    await page.getByLabel('Encrypted backup file').setInputFiles(backupPath);
    await page.getByLabel('Passphrase of that backup').fill(PASS);
    await page.getByRole('button', { name: 'Restore backup' }).click();
    await expect(page.getByRole('alert').last()).toHaveText('Wrong passphrase for this backup.');
    await page.getByLabel('Passphrase of that backup').fill('another long passphrase');
    await page.getByRole('button', { name: 'Restore backup' }).click();
    await expect(page.getByRole('heading', { name: 'Hi, Riley' })).toBeVisible();

    // Restoring from settings also works (replaces current data)
    await page.goto('/#/settings');
    await page.getByLabel('Backup file').setInputFiles(backupPath);
    await page.getByLabel('Passphrase used for that backup').fill('another long passphrase');
    await page.getByRole('button', { name: 'Restore backup' }).click();
    await expect(page.getByRole('heading', { name: 'Hi, Riley' })).toBeVisible();

    await page.reload();
    await page.getByLabel('Passphrase').fill('another long passphrase');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('heading', { name: 'Hi, Riley' })).toBeVisible();
  });

  test('header fits the screen: no sideways scrolling, menu reachable', async ({ page }) => {
    await createVault(page);
    await onboard(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const nav = await mainNav(page);
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
    await nav.getByRole('link', { name: 'Progress' }).click();
    await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible();
  });

  test('locks on demand', async ({ page }) => {
    await createVault(page);
    await onboard(page);
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Lock now' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Riley')).toHaveCount(0);
  });

  test('installable and works fully offline after the first visit', async ({ page, context }) => {
    await page.goto('/');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await page.request.get(manifestHref!)).json();
    expect(manifest).toMatchObject({ short_name: 'GymFree', display: 'standalone', start_url: './' });
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);

    // Service worker installs and precaches the whole app
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const cache = await caches.open(keys.find((k) => k.startsWith('gymfree-'))!);
      return (await cache.keys()).map((r) => new URL(r.url).pathname);
    });
    expect(cached).toEqual(expect.arrayContaining(['/', '/index.html', '/manifest.webmanifest', '/exercises/push-up-0.webp']));

    await createVault(page);
    await onboard(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.getByLabel('Passphrase').fill(PASS);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('heading', { name: 'Hi, Riley' })).toBeVisible();
    await page.goto('/#/exercises/goblet-squat');
    const photo = page.locator('.demo-large img').first();
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Install & offline' })).toBeVisible();
    await context.setOffline(false);
  });

  test('ships a strict Content-Security-Policy and loads no third-party resources', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://localhost:4173')) external.push(r.url());
    });
    await page.goto('/');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    await expect(page.getByRole('heading', { name: /No sign-up/ })).toBeVisible();
    expect(external).toEqual([]);
  });
});
