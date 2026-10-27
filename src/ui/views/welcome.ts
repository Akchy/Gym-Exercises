import type { AppState } from '../../core/types';
import { h } from '../dom';

export interface WelcomeOptions {
  /** False when the app was built without Supabase settings: no sign-in offered. */
  cloudEnabled: boolean;
  onGoogle(): void;
  onLocal(): void;
}

/** First screen: sign in to sync across devices, or use the app on this device only. */
export function renderWelcome(opts: WelcomeOptions): HTMLElement {
  const google = h('button', { type: 'button', class: 'primary wide' }, 'Continue with Google');
  google.addEventListener('click', () => {
    google.disabled = true;
    google.textContent = 'Opening Google…';
    opts.onGoogle();
  });
  const local = h('button', { type: 'button', class: 'secondary wide' }, 'Use without an account');
  local.addEventListener('click', () => opts.onLocal());
  return h(
    'main',
    { class: 'center' },
    h(
      'section',
      { class: 'card narrow', 'aria-labelledby': 'welcome-title' },
      h('h1', { id: 'welcome-title' }, 'Free gym coach. No subscription.'),
      h('p', {}, 'Tell us your goal and routine, get a weekly plan with exercise guides, and track your progress.'),
      h(
        'ul',
        { class: 'checklist' },
        h('li', {}, 'Works offline, even at a gym with no signal.'),
        opts.cloudEnabled ? h('li', {}, 'Sign in to see the same plan and progress on your phone and computer.') : null,
        h('li', {}, 'No ads, no trackers.'),
      ),
      h('div', { class: 'stack' }, opts.cloudEnabled ? google : null, local),
      opts.cloudEnabled ? h('p', { class: 'muted small' }, 'Without an account, your data stays on this device only. You can sign in later from Settings.') : null,
    ),
  );
}

function summary(state: AppState): string {
  const n = state.workouts.length;
  return `${n} workout${n === 1 ? '' : 's'} logged, ${state.plan.length}-day plan`;
}

/** Asked once when signing in with data on this device and in the account. */
export function renderLinkChoice(data: { device: AppState; account: AppState }, onChoose: (choice: 'account' | 'device') => Promise<void>): HTMLElement {
  const error = h('p', { class: 'error', role: 'alert' });
  const option = (choice: 'account' | 'device', label: string, detail: string) => {
    const btn = h('button', { type: 'button', class: choice === 'account' ? 'primary wide' : 'secondary wide' }, label);
    btn.addEventListener('click', async () => {
      for (const b of btn.parentElement!.querySelectorAll('button')) b.disabled = true;
      try {
        await onChoose(choice);
      } catch (err) {
        error.textContent = `Something went wrong: ${(err as Error).message}`;
        for (const b of btn.parentElement!.querySelectorAll('button')) b.disabled = false;
      }
    });
    return [btn, h('p', { class: 'muted small' }, detail)];
  };
  return h(
    'main',
    { class: 'center' },
    h(
      'section',
      { class: 'card narrow', 'aria-labelledby': 'link-title' },
      h('h1', { id: 'link-title' }, 'Which data should we keep?'),
      h('p', {}, 'This device has data from using the app without an account, and your account already has data. Choose one; the other is replaced.'),
      h(
        'div',
        { class: 'stack' },
        ...option('account', 'Keep my account data', `Account: ${summary(data.account)}. This device's data is removed.`),
        ...option('device', "Use this device's data", `This device: ${summary(data.device)}. It replaces your account data.`),
      ),
      error,
    ),
  );
}
