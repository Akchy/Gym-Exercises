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

async function onboard(page: Page) {
  await page.getByText('Build muscle').click();
  await page.getByRole('button', { name: 'Next' }).click();
  // Routine: Tue, Thu, Sat; 45 minutes; gym equipment
  for (const d of ['Mon', 'Wed', 'Fri']) await page.getByRole('group', { name: 'Training days' }).getByText(d).click();
  for (const d of ['Tue', 'Thu', 'Sat']) await page.getByRole('group', { name: 'Training days' }).getByText(d).click();
  await page.getByLabel('How active is the rest of your day?').selectOption('sedentary');
  await page.getByRole('group', { name: 'Equipment' }).getByText('Barbell & rack').click();
  await page.getByRole('button', { name: 'Next' }).click();
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

  test('customise the plan, log a workout and see progress', async ({ page }) => {
    await createVault(page);
    await onboard(page);

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plan' }).click();
    await expect(page.getByRole('heading', { name: 'Your weekly plan' })).toBeVisible();
    const firstDay = page.locator('.plan-day').first();
    await firstDay.getByLabel('Day name').fill('Chest & Arms');
    await firstDay.getByLabel('Day name').blur();
    await firstDay.getByText('show all exercises').click();
    await firstDay.getByLabel(/^Add exercise to/).selectOption('hammer-curl');
    await expect(page.locator('.plan-day').first().getByRole('link', { name: 'Hammer Curl' })).toBeVisible();

    await page.locator('.plan-day').first().getByRole('link', { name: 'Log workout' }).click();
    await expect(page.getByRole('heading', { name: 'Log: Chest & Arms' })).toBeVisible();
    await page.getByLabel('Hammer Curl set 1 weight (kg)').fill('14');
    await page.getByLabel('Hammer Curl set 1 reps').fill('12');
    await page.getByRole('button', { name: 'Save workout' }).click();

    await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Workout saved');
    await expect(page.getByText('Personal records')).toBeVisible();
    await expect(page.locator('.history li')).toHaveCount(1);
    await page.getByLabel('Exercise to chart').selectOption('hammer-curl');
    await expect(page.locator('.chart-wrap figcaption').first()).toContainText('kg (est. 1RM)');

    await page.getByLabel(/^Weight \(kg\)/).fill('73.5');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText(/Latest 73.5 kg/)).toBeVisible();
  });

  test('exercise library shows animations and still images', async ({ page }) => {
    await createVault(page);
    await onboard(page);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Exercises' }).click();
    await page.getByLabel('Muscle group').selectOption('legs');
    await page.getByPlaceholder('Search exercises').fill('squat');
    await expect(page.locator('.exercise-card').first()).toBeVisible();
    await page.getByRole('link', { name: /Barbell Back Squat/ }).click();
    await expect(page.getByRole('heading', { name: 'Barbell Back Squat' })).toBeVisible();
    const figure = page.locator('.figure-large svg');
    await expect(figure).toHaveAttribute('aria-label', /animation/);
    // SMIL animation actually moves the figure
    const x1 = await page.locator('.figure-large line').nth(1).evaluate((l: SVGLineElement) => l.x1.animVal.value);
    await page.waitForTimeout(700);
    const x1Later = await page.locator('.figure-large line').nth(1).evaluate((l: SVGLineElement) => l.x1.animVal.value);
    expect(x1Later).not.toBe(x1);
    await page.getByRole('button', { name: 'Show start/end images' }).click();
    await expect(figure).toHaveAttribute('aria-label', /start and end position/);
  });

  test('reduced motion users get still images', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await createVault(page);
    await onboard(page);
    await page.goto('/#/exercises/push-up');
    await expect(page.locator('.figure-large svg')).toHaveAttribute('aria-label', /start and end position/);
    await context.close();
  });

  test('settings: change passphrase, backup round-trip and delete data', async ({ page }) => {
    await createVault(page);
    await onboard(page);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();

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

  test('locks on demand', async ({ page }) => {
    await createVault(page);
    await onboard(page);
    await page.getByRole('button', { name: 'Lock app' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Riley')).toHaveCount(0);
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
