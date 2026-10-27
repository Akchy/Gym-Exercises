import { checkPassphrase } from '../../core/passphrase';
import { DecryptionError } from '../../core/crypto';
import { h } from '../dom';

export interface LockHandlers {
  create(passphrase: string): Promise<void>;
  /** Restores an encrypted backup file onto this (empty) device. */
  restore(raw: string, passphrase: string): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  reset(): Promise<void>;
}

function strengthMeter(): { el: HTMLElement; update(p: string): void } {
  const bar = h('meter', { min: 0, max: 4, value: 0, 'aria-label': 'Passphrase strength' });
  const msg = h('small', { class: 'hint', 'aria-live': 'polite' });
  return {
    el: h('div', { class: 'strength' }, bar, msg),
    update(p: string) {
      const c = checkPassphrase(p);
      bar.value = c.score;
      msg.textContent = p ? (c.ok ? ['Weak', 'Weak', 'Okay', 'Good', 'Strong'][c.score] : c.problems.join('. ')) : '';
    },
  };
}

export function renderWelcome(handlers: LockHandlers): HTMLElement {
  const pass = h('input', { type: 'password', id: 'new-pass', autocomplete: 'new-password', required: true });
  const confirm = h('input', { type: 'password', id: 'confirm-pass', autocomplete: 'new-password', required: true });
  const ack = h('input', { type: 'checkbox', id: 'ack' });
  const error = h('p', { class: 'error', role: 'alert' });
  const meter = strengthMeter();
  pass.addEventListener('input', () => meter.update(pass.value));
  const submit = h('button', { type: 'submit', class: 'primary' }, 'Create my private space');

  const form = h(
    'form',
    { class: 'card narrow', 'aria-labelledby': 'welcome-title' },
    h('h1', { id: 'welcome-title' }, 'Free gym coach. No sign-up. Private.'),
    h('p', {}, 'Tell us your goal and routine, get a plan with animated exercise guides, and track your progress. Free, with no subscription.'),
    h(
      'ul',
      { class: 'checklist' },
      h('li', {}, 'Your data is encrypted on this device with AES-256 before it is saved.'),
      h('li', {}, 'Only your passphrase can unlock it. We never see or store it.'),
      h('li', {}, 'No accounts, no trackers, no ads.'),
    ),
    h('div', { class: 'field' }, h('label', { for: 'new-pass' }, 'Choose a passphrase'), pass, meter.el),
    h('div', { class: 'field' }, h('label', { for: 'confirm-pass' }, 'Repeat passphrase'), confirm),
    h('div', { class: 'field inline' }, ack, h('label', { for: 'ack' }, 'I understand a forgotten passphrase cannot be recovered.')),
    error,
    submit,
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    const check = checkPassphrase(pass.value);
    if (!check.ok) return void (error.textContent = check.problems.join('. '));
    if (pass.value !== confirm.value) return void (error.textContent = 'Passphrases do not match.');
    if (!ack.checked) return void (error.textContent = 'Please confirm you understand there is no recovery.');
    submit.disabled = true;
    submit.textContent = 'Encrypting…';
    try {
      await handlers.create(pass.value);
    } catch (err) {
      error.textContent = (err as Error).message;
      submit.disabled = false;
      submit.textContent = 'Create my private space';
    }
  });
  return h('main', { class: 'center' }, form, renderRestore(handlers));
}

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

/** "Moving from another device?" restore form shown on the welcome screen. */
function renderRestore(handlers: LockHandlers): HTMLElement {
  const file = h('input', { type: 'file', id: 'restore-file', accept: 'application/json,.json' });
  const pass = h('input', { type: 'password', id: 'restore-pass', autocomplete: 'current-password' });
  const error = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'secondary' }, 'Restore backup');
  const form = h(
    'form',
    {},
    h('div', { class: 'field' }, h('label', { for: 'restore-file' }, 'Encrypted backup file'), file),
    h('div', { class: 'field' }, h('label', { for: 'restore-pass' }, 'Passphrase of that backup'), pass),
    error,
    submit,
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    const f = file.files?.[0];
    if (!f) return void (error.textContent = 'Choose a backup file.');
    if (f.size > MAX_BACKUP_BYTES) return void (error.textContent = 'That file is too large to be a backup.');
    submit.disabled = true;
    try {
      await handlers.restore(await f.text(), pass.value);
    } catch (err) {
      error.textContent = err instanceof DecryptionError ? 'Wrong passphrase for this backup.' : (err as Error).message;
      submit.disabled = false;
    }
  });
  return h('details', { class: 'card narrow' }, h('summary', {}, 'Moving from another device? Restore a backup'), form);
}

/** Small delay that grows with each failed attempt (slows down guessing in the UI). */
export function failureDelayMs(failures: number): number {
  return failures <= 2 ? 0 : Math.min(30_000, 1000 * 2 ** (failures - 3));
}

export function renderUnlock(handlers: LockHandlers, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): HTMLElement {
  let failures = 0;
  const pass = h('input', { type: 'password', id: 'unlock-pass', autocomplete: 'current-password', required: true, autofocus: true });
  const error = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'primary' }, 'Unlock');
  const form = h(
    'form',
    { class: 'card narrow', 'aria-labelledby': 'unlock-title' },
    h('h1', { id: 'unlock-title' }, 'Welcome back'),
    h('p', { class: 'muted' }, 'Enter your passphrase to decrypt your data on this device.'),
    h('div', { class: 'field' }, h('label', { for: 'unlock-pass' }, 'Passphrase'), pass),
    error,
    submit,
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Unlocking…';
    try {
      await handlers.unlock(pass.value);
    } catch (err) {
      failures++;
      error.textContent = err instanceof DecryptionError ? 'Wrong passphrase.' : (err as Error).message;
      pass.value = '';
      await sleep(failureDelayMs(failures));
      submit.disabled = false;
      submit.textContent = 'Unlock';
    }
  });

  const resetBtn = h('button', { type: 'button', class: 'link danger' }, 'Forgot passphrase? Erase data and start over');
  resetBtn.addEventListener('click', async () => {
    if (confirm('This permanently deletes all data stored on this device. Continue?')) await handlers.reset();
  });
  return h('main', { class: 'center' }, form, h('p', { class: 'center-text' }, resetBtn));
}
