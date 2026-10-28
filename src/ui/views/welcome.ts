import type { AppState } from '../../core/types';
import { h } from '../dom';
import { renderSpinWheel } from './wheel';

export interface WelcomeOptions {
  /** False when Supabase isn't configured or couldn't be reached: Google sign-in is shown disabled. */
  signInAvailable: boolean;
  /** Leaves for Google sign-in; rejects if it can't start. */
  onGoogle(): Promise<void>;
  onLocal(): void;
}

const SIGN_IN_UNAVAILABLE = 'Google sign-in is unavailable right now. You can still use GymFree without an account.';

/** Beside the headline: the exercise roulette visitors can play with. */
function heroWheel(): HTMLElement {
  const wheel = renderSpinWheel({ inlineDemo: true });
  wheel.classList.add('preview-card');
  return h('div', { class: 'preview' }, wheel);
}

const FEATURES = [
  ['🗓️', 'A plan that fits your week', 'Pick a goal and the days you can train. Get a weekly split with sets, reps and rest that suit you.'],
  ['📸', 'See how every move is done', 'Photo guides with start and end positions, step-by-step cues and a tip for each exercise.'],
  ['📈', 'Watch yourself get stronger', 'Log sets as you go. Personal records, strength charts, streaks and body weight, all in one place.'],
] as const;

const STEPS = [
  ['Choose your goal', 'Build muscle, lose fat, get stronger, improve stamina or just stay fit.'],
  ['Tell us your routine', 'Training days, session length and the equipment you have.'],
  ['Train and log', 'Follow the plan, tap any exercise for a guide, and track every set.'],
] as const;

/** Landing page: what GymFree does, then sign in to sync or use it on this device only. */
export function renderWelcome(opts: WelcomeOptions): HTMLElement {
  const note = h('p', { class: 'muted small', 'aria-live': 'polite' }, opts.signInAvailable
    ? 'Sign in to use it on your phone and computer. Without an account, your data stays on this device.'
    : SIGN_IN_UNAVAILABLE);
  const google = h('button', { type: 'button', class: 'primary', disabled: !opts.signInAvailable }, 'Continue with Google');
  google.addEventListener('click', async () => {
    google.disabled = true;
    google.textContent = 'Opening Google…';
    try {
      await opts.onGoogle();
    } catch {
      google.textContent = 'Continue with Google';
      note.textContent = SIGN_IN_UNAVAILABLE;
    }
  });
  const local = h('button', { type: 'button', class: opts.signInAvailable ? 'secondary' : 'primary' }, 'Use without an account');
  local.addEventListener('click', () => opts.onLocal());

  return h(
    'main',
    { class: 'landing' },
    h(
      'section',
      { class: 'hero', 'aria-labelledby': 'welcome-title' },
      h(
        'div',
        { class: 'hero-text' },
        h('p', { class: 'eyebrow' }, 'GymFree · free gym planner'),
        h('h1', { id: 'welcome-title' }, 'Your gym plan, built around your week.'),
        h('p', { class: 'lead' }, 'Tell us your goal and when you can train. Get a weekly plan with photo guides for every exercise, and track your progress. Free, with no subscription.'),
        h('div', { class: 'cta' }, google, local),
        note,
      ),
      heroWheel(),
    ),
    h(
      'section',
      { class: 'features', 'aria-label': 'What you get' },
      ...FEATURES.map(([icon, title, text]) => h('article', { class: 'feature' }, h('span', { class: 'feature-icon', 'aria-hidden': 'true' }, icon), h('h2', {}, title), h('p', {}, text))),
    ),
    h(
      'section',
      { class: 'how', 'aria-labelledby': 'how-title' },
      h('h2', { id: 'how-title' }, 'How it works'),
      h('ol', { class: 'how-steps' }, ...STEPS.map(([title, text]) => h('li', {}, h('strong', {}, title), h('span', { class: 'muted' }, text)))),
    ),
    h(
      'section',
      { class: 'promise' },
      h('p', {}, h('strong', {}, 'Works offline.'), ' Log a workout with no signal; it saves on your phone and syncs when you are back online.'),
      h('p', {}, h('strong', {}, 'No ads, no trackers.'), ' Just your plan and your progress.'),
    ),
    h('footer', { class: 'landing-footer muted small' }, 'Exercise photos: free-exercise-db (public domain). Plans and calorie estimates are general guidance, not medical advice.'),
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

/** Signed in on a new device, but the account's data couldn't be loaded (offline or server down). */
export function renderUnavailable(opts: { email: string | null; onRetry(): Promise<void>; onSignOut(): Promise<void> }): HTMLElement {
  const retry = h('button', { type: 'button', class: 'primary wide' }, 'Try again');
  retry.addEventListener('click', async () => {
    retry.disabled = true;
    retry.textContent = 'Trying…';
    await opts.onRetry();
  });
  const signOut = h('button', { type: 'button', class: 'secondary wide' }, 'Sign out');
  signOut.addEventListener('click', () => void opts.onSignOut());
  return h(
    'main',
    { class: 'center' },
    h(
      'section',
      { class: 'card narrow', 'aria-labelledby': 'unavailable-title' },
      h('h1', { id: 'unavailable-title' }, "Couldn't load your data"),
      h('p', {}, `You're signed in${opts.email ? ` as ${opts.email}` : ''}, but your plan and workouts couldn't be fetched. Check your connection and try again.`),
      h('div', { class: 'stack' }, retry, signOut),
    ),
  );
}
