import type { AppState } from '../../core/types';
import { getExercise } from '../../data/exercises';
import { photoUrls } from '../../data/photos';
import { h } from '../dom';

export interface WelcomeOptions {
  /** False when Supabase isn't configured or couldn't be reached: Google sign-in is shown disabled. */
  signInAvailable: boolean;
  /** Leaves for Google sign-in; rejects if it can't start. */
  onGoogle(): Promise<void>;
  onLocal(): void;
}

const SIGN_IN_UNAVAILABLE = 'Google sign-in is unavailable right now. You can still use GymFree without an account.';

/** A still preview of the app (today's workout + this week), drawn with the app's own styles. */
function appPreview(): HTMLElement {
  const rows: [string, string, boolean][] = [
    ['push-up', '3 × 8–12', true],
    ['dumbbell-shoulder-press', '3 × 8–12', true],
    ['bench-dip', '3 × 10–15', false],
  ];
  const week: [string, number, boolean][] = [
    ['M', 0.7, true], ['T', 0, false], ['W', 0.9, true], ['T', 0, false], ['F', 0.45, false], ['S', 0, false], ['S', 0, false],
  ];
  return h(
    'div',
    { class: 'preview', 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'preview-card' },
      h('div', { class: 'preview-head' }, h('span', { class: 'badge' }, 'Today'), h('strong', {}, 'Push day'), h('span', { class: 'muted small' }, 'Chest · Shoulders · Triceps')),
      h(
        'ul',
        { class: 'preview-list' },
        ...rows.map(([id, dose, done]) => {
          const photo = photoUrls(id)?.[0];
          return h(
            'li',
            {},
            photo ? h('img', { src: photo, alt: '', loading: 'lazy', decoding: 'async' }) : null,
            h('span', { class: 'preview-name' }, h('strong', {}, getExercise(id)?.name ?? id), h('span', { class: 'muted small' }, dose)),
            h('span', { class: `preview-check${done ? ' done' : ''}` }),
          );
        }),
      ),
    ),
    h(
      'div',
      { class: 'preview-card preview-week' },
      h('div', { class: 'preview-week-head' }, h('strong', {}, 'This week'), h('span', { class: 'muted small' }, '2 of 3 workouts · 🔥 4-week streak')),
      h(
        'div',
        { class: 'preview-bars' },
        ...week.map(([day, height, done]) => {
          const fill = h('span', { class: `fill${done ? ' done' : ''}` });
          fill.style.setProperty('--h', `${Math.round(height * 100)}%`); // CSSOM, allowed by the strict CSP
          return h('span', { class: 'preview-bar' }, fill, h('span', { class: 'muted small' }, day));
        }),
      ),
    ),
  );
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
      appPreview(),
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
