import { sanitizeState } from '../../core/state';
import type { SyncStatus } from '../../core/sync';
import type { ViewContext } from '../context';
import { choiceGroup, field, h } from '../dom';
import { getTheme, setTheme } from '../theme';

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export function backupFileName(today: string): string {
  return `gym-backup-${today}.json`;
}

export function syncStatusText(status: SyncStatus, error: string | null = null): string {
  switch (status) {
    case 'error':
      return `Couldn't save to your account: ${error ?? 'unknown error'}. Your changes are kept on this device and will be retried.`;
    case 'synced':
      return 'All changes saved to your account.';
    case 'saving':
      return 'Saving…';
    case 'offline':
      return "Offline: changes will upload when you're back online.";
    default:
      return 'Your data is stored on this device only.';
  }
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function accountCard(ctx: ViewContext): HTMLElement {
  const { repo } = ctx;
  const status = h('p', { class: 'muted', 'data-sync-status': '' }, syncStatusText(repo.status, repo.lastError));
  if (repo.mode === 'cloud' && repo.user) {
    const signOut = h('button', { type: 'button', class: 'secondary' }, 'Sign out');
    signOut.addEventListener('click', async () => {
      if (repo.hasPendingChanges() && !confirm("Some changes haven't uploaded yet. Sign out anyway?")) return;
      await ctx.signOut();
    });
    return h('section', { class: 'card' }, h('h2', {}, 'Account'), h('p', {}, 'Signed in as ', h('strong', {}, repo.user.email ?? 'your Google account')), status, signOut);
  }
  const signIn = h('button', { type: 'button', class: 'primary' }, 'Sign in with Google to sync');
  signIn.addEventListener('click', () => ctx.signIn().catch((err: Error) => ctx.toast(`Could not start sign-in: ${err.message}`)));
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Account'),
    status,
    repo.cloudEnabled ? h('p', { class: 'muted' }, 'Sign in to see the same plan and progress on your phone and computer. Your data here moves into your account.') : null,
    repo.cloudEnabled ? signIn : null,
  );
}

function backupCard(ctx: ViewContext): HTMLElement {
  const exportBtn = h('button', { type: 'button', class: 'secondary' }, 'Download backup');
  exportBtn.addEventListener('click', () => download(backupFileName(ctx.today()), JSON.stringify(ctx.state, null, 2)));
  const file = h('input', { type: 'file', id: 'import-file', accept: 'application/json,.json' });
  const importMsg = h('p', { class: 'error', role: 'alert' });
  const importForm = h('form', {}, field('Backup file', file), importMsg, h('button', { type: 'submit', class: 'secondary' }, 'Restore backup'));
  importForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    importMsg.textContent = '';
    const f = file.files?.[0];
    if (!f) return void (importMsg.textContent = 'Choose a backup file.');
    if (f.size > MAX_BACKUP_BYTES) return void (importMsg.textContent = 'That file is too large to be a backup.');
    let data;
    try {
      data = sanitizeState(JSON.parse(await f.text()));
    } catch {
      return void (importMsg.textContent = 'That file is not a GymFree backup.');
    }
    const signedIn = ctx.repo.mode === 'cloud';
    // Offline, the restore could later lose to (or wipe out) changes made on another device.
    if (signedIn && !navigator.onLine) return void (importMsg.textContent = 'Connect to the internet to restore a backup to your account.');
    const where = signedIn ? 'in your account and on every signed-in device' : 'on this device';
    if (!confirm(`Restoring replaces all your current data, ${where}. Continue?`)) return;
    await ctx.replaceState(data);
    ctx.toast('Backup restored.');
  });
  return h('section', { class: 'card' }, h('h2', {}, 'Backup & restore'), h('p', { class: 'muted' }, 'Download a copy of your data as a file, or restore one.'), exportBtn, importForm);
}

function deleteCard(ctx: ViewContext): HTMLElement {
  const confirmInput = h('input', { type: 'text', id: 'delete-confirm', autocomplete: 'off' });
  const delBtn = h('button', { type: 'button', class: 'danger' }, 'Delete all my data');
  delBtn.addEventListener('click', async () => {
    if (confirmInput.value !== 'DELETE') {
      confirmInput.focus();
      return ctx.toast('Type DELETE to confirm.');
    }
    try {
      await ctx.destroy();
    } catch {
      ctx.toast('Could not delete your account data. Check your connection and try again.');
    }
  });
  const where = ctx.repo.mode === 'cloud' ? 'from your account and this device' : 'from this device';
  return h('section', { class: 'card danger-zone' }, h('h2', {}, 'Delete data'), h('p', {}, `Permanently erase your plan, workouts and settings ${where}.`), field('Type DELETE to confirm', confirmInput), delBtn);
}

function installCard(ctx: ViewContext): HTMLElement {
  const install = ctx.install;
  let body: HTMLElement;
  if (install?.isStandalone || install?.installed) {
    body = h('p', {}, '✓ Installed. GymFree opens like an app and works offline.');
  } else if (install?.canPrompt) {
    const btn = h('button', { type: 'button', class: 'primary' }, 'Install GymFree');
    btn.addEventListener('click', async () => {
      if (await install.prompt()) ctx.toast('GymFree installed.');
    });
    body = btn;
  } else if (install?.isIos) {
    body = h('p', {}, 'On iPhone or iPad: tap the Share button, then “Add to Home Screen”.');
  } else {
    body = h('p', {}, 'Use your browser menu and choose “Install app” or “Add to Home screen”.');
  }
  return h('section', { class: 'card' }, h('h2', {}, 'Install & offline'), h('p', { class: 'muted' }, 'After your first visit, GymFree works without an internet connection, including all exercise photos.'), body);
}

function preferencesCard(ctx: ViewContext): HTMLElement {
  const { state } = ctx;
  const units = choiceGroup({
    name: 'units',
    legend: 'Weight units',
    options: [['kg', 'Kilograms (kg)'], ['lb', 'Pounds (lb)']],
    value: state.settings.units,
    onChange: (v) => ctx.update((s) => (s.settings.units = v)),
  });
  const theme = choiceGroup({
    name: 'theme',
    legend: 'Theme',
    options: [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']],
    value: getTheme(),
    onChange: (v) => setTheme(v),
  });
  const animations = h('input', { type: 'checkbox', id: 'animations', checked: state.settings.animations });
  animations.addEventListener('change', () => ctx.update((s) => (s.settings.animations = animations.checked), { render: false }));
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Preferences'),
    theme,
    units,
    h('div', { class: 'field inline' }, animations, h('label', { for: 'animations' }, 'Animated exercise demos (off = start/end images)')),
    h('a', { href: '#/onboarding', class: 'button secondary' }, 'Change goal & routine'),
  );
}

export function renderSettings(ctx: ViewContext): HTMLElement {
  return h('main', { class: 'container' }, h('h1', {}, 'Settings'), accountCard(ctx), installCard(ctx), preferencesCard(ctx), backupCard(ctx), deleteCard(ctx));
}
