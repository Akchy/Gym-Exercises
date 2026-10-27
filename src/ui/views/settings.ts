import { checkPassphrase } from '../../core/passphrase';
import { DecryptionError } from '../../core/crypto';
import { sanitizeState } from '../../core/state';
import type { AppState } from '../../core/types';
import type { ViewContext } from '../context';
import { choiceGroup, field, h, select } from '../dom';
import { getTheme, setTheme } from '../theme';
import { MAX_BACKUP_BYTES } from './lock';

export { MAX_BACKUP_BYTES };

export function backupFileName(today: string): string {
  return `gym-backup-${today}.encrypted.json`;
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderSettings(ctx: ViewContext): HTMLElement {
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
  const autoLock = select(
    [1, 5, 15, 30, 60, 240].map((m) => [String(m), `${m} minute${m === 1 ? '' : 's'}`] as const),
    String(state.settings.autoLockMinutes),
    { id: 'auto-lock' },
  );
  autoLock.addEventListener('change', () => ctx.update((s) => (s.settings.autoLockMinutes = Number(autoLock.value)), { render: false }));

  // Change passphrase
  const cur = h('input', { type: 'password', id: 'cur-pass', autocomplete: 'current-password' });
  const next = h('input', { type: 'password', id: 'next-pass', autocomplete: 'new-password' });
  const next2 = h('input', { type: 'password', id: 'next-pass2', autocomplete: 'new-password' });
  const passMsg = h('p', { role: 'alert' });
  const passForm = h('form', {}, field('Current passphrase', cur), field('New passphrase', next), field('Repeat new passphrase', next2), passMsg, h('button', { type: 'submit', class: 'secondary' }, 'Change passphrase'));
  passForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    passMsg.className = 'error';
    const check = checkPassphrase(next.value);
    if (!check.ok) return void (passMsg.textContent = check.problems.join('. '));
    if (next.value !== next2.value) return void (passMsg.textContent = 'New passphrases do not match.');
    try {
      await ctx.vault.changePassphrase(cur.value, next.value);
      await ctx.update(() => {}, { render: false }); // re-save current in-memory state under the new key
      passForm.reset();
      passMsg.className = 'success';
      passMsg.textContent = 'Passphrase changed.';
    } catch (err) {
      passMsg.textContent = err instanceof DecryptionError ? 'Current passphrase is wrong.' : (err as Error).message;
    }
  });

  // Backup
  const exportBtn = h('button', { type: 'button', class: 'secondary' }, 'Download encrypted backup');
  exportBtn.addEventListener('click', async () => {
    const env = await ctx.vault.exportEncrypted();
    download(backupFileName(ctx.today()), JSON.stringify(env));
  });
  const file = h('input', { type: 'file', id: 'import-file', accept: 'application/json,.json' });
  const importPass = h('input', { type: 'password', id: 'import-pass', autocomplete: 'off' });
  const importMsg = h('p', { role: 'alert' });
  const importForm = h('form', {}, field('Backup file', file), field('Passphrase used for that backup', importPass), importMsg, h('button', { type: 'submit', class: 'secondary' }, 'Restore backup'));
  importForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    importMsg.className = 'error';
    const f = file.files?.[0];
    if (!f) return void (importMsg.textContent = 'Choose a backup file.');
    if (f.size > MAX_BACKUP_BYTES) return void (importMsg.textContent = 'That file is too large to be a backup.');
    if (!confirm('Restoring replaces all current data on this device. Continue?')) return;
    try {
      const raw = await f.text();
      const data = await ctx.vault.importEncrypted<AppState>(raw, importPass.value, sanitizeState);
      await ctx.replaceState(data);
      ctx.toast('Backup restored. Your passphrase is now the one from the backup.');
    } catch (err) {
      importMsg.textContent = err instanceof DecryptionError ? 'Wrong passphrase for this backup.' : (err as Error).message;
    }
  });

  const lockBtn = h('button', { type: 'button', class: 'secondary' }, 'Lock now');
  lockBtn.addEventListener('click', () => ctx.lock());

  const confirmInput = h('input', { type: 'text', id: 'delete-confirm', autocomplete: 'off' });
  const delBtn = h('button', { type: 'button', class: 'danger' }, 'Delete all my data');
  delBtn.addEventListener('click', async () => {
    if (confirmInput.value !== 'DELETE') {
      confirmInput.focus();
      return ctx.toast('Type DELETE to confirm.');
    }
    await ctx.destroy();
  });

  const install = ctx.install;
  let installBody: HTMLElement;
  if (install?.isStandalone || install?.installed) {
    installBody = h('p', {}, '✓ Installed. GymFree opens like an app and works offline.');
  } else if (install?.canPrompt) {
    const btn = h('button', { type: 'button', class: 'primary' }, 'Install GymFree');
    btn.addEventListener('click', async () => {
      if (await install.prompt()) ctx.toast('GymFree installed.');
    });
    installBody = btn;
  } else if (install?.isIos) {
    installBody = h('p', {}, 'On iPhone or iPad: tap the Share button, then “Add to Home Screen”.');
  } else {
    installBody = h('p', {}, 'Use your browser menu and choose “Install app” or “Add to Home screen”.');
  }

  return h(
    'main',
    { class: 'container' },
    h('h1', {}, 'Settings'),
    h('section', { class: 'card' }, h('h2', {}, 'Install & offline'), h('p', { class: 'muted' }, 'After your first visit, GymFree works without an internet connection, including all exercise photos.'), installBody),
    h('section', { class: 'card' }, h('h2', {}, 'Preferences'), theme, units, h('div', { class: 'field inline' }, animations, h('label', { for: 'animations' }, 'Animated exercise demos (off = start/end images)')), field('Auto-lock after inactivity', autoLock), h('a', { href: '#/onboarding', class: 'button secondary' }, 'Change goal & routine')),
    h('section', { class: 'card' }, h('h2', {}, 'Security'), h('p', { class: 'muted' }, 'Your data is encrypted with AES-256-GCM using a key derived from your passphrase (PBKDF2-SHA-256, 600,000 iterations). The passphrase is never stored.'), passForm, lockBtn),
    h('section', { class: 'card' }, h('h2', {}, 'Backup & restore'), h('p', { class: 'muted' }, 'Backups stay encrypted. Keep one somewhere safe, for example to move to a new device.'), exportBtn, importForm),
    h('section', { class: 'card danger-zone' }, h('h2', {}, 'Delete data'), h('p', {}, 'Permanently erase everything stored by this app on this device.'), field('Type DELETE to confirm', confirmInput), delBtn),
  );
}
