import { weekdayOf } from '../../core/dates';
import { GOAL_PROFILES, estimateCalories, routineAdvice } from '../../core/planner';
import { weekStreak, workoutsInWeek } from '../../core/progress';
import { WEEKDAY_NAMES, type PlanDay } from '../../core/types';
import { getExercise } from '../../data/exercises';
import type { ViewContext } from '../context';
import { isPhone, startWorkoutHref } from '../device';
import { h } from '../dom';
import { MUSCLE_LABELS } from '../labels';
import { animateArrivals, reshuffleButton } from './plan';
import { renderSpinWheel } from './wheel';

export function nextPlanDay(plan: readonly PlanDay[], todayWeekday: number): { day: PlanDay; inDays: number } | null {
  const scheduled = plan.filter((d) => d.weekday !== null);
  if (!scheduled.length) return plan.length ? { day: plan[0], inDays: 0 } : null;
  let best: { day: PlanDay; inDays: number } | null = null;
  for (const day of scheduled) {
    const inDays = ((day.weekday as number) - todayWeekday + 7) % 7;
    if (!best || inDays < best.inDays) best = { day, inDays };
  }
  return best;
}

function stat(label: string, value: string | number): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(value)), h('span', { class: 'stat-label' }, label));
}

/**
 * The roulette is kept across re-renders, so saving something else on the home page (like
 * new exercises for today) doesn't redraw it with a different set or lose the last pick.
 */
let wheel: HTMLElement | null = null;

export function renderDashboard(ctx: ViewContext): HTMLElement {
  const { state } = ctx;
  const today = ctx.today();
  const next = nextPlanDay(state.plan, weekdayOf(today));
  const doneToday = state.workouts.some((w) => w.date === today);
  const calories = estimateCalories(state.profile, state.routine.activityLevel, state.goal);

  let todayCard: HTMLElement;
  if (!next) {
    todayCard = h('section', { class: 'card' }, h('h2', {}, 'No plan yet'), h('a', { href: '#/onboarding', class: 'button primary' }, 'Create a plan'));
  } else {
    const { day, inDays } = next;
    const when = inDays === 0 ? 'Today' : inDays === 1 ? 'Tomorrow' : `On ${WEEKDAY_NAMES[day.weekday as number]}`;
    todayCard = h(
      'section',
      { class: 'card highlight', 'aria-labelledby': 'today-title' },
      h('h2', { id: 'today-title' }, inDays === 0 ? (doneToday ? 'Done for today. Great work!' : "Today's workout") : 'Rest day: recover well'),
      h('p', {}, `${when}: `, h('strong', {}, day.name), ` · ${day.muscleGroups.map((g) => MUSCLE_LABELS[g]).join(', ')}`),
      h(
        'ul',
        { class: 'compact' },
        ...animateArrivals(ctx, day, day.exercises.slice(0, 6).map((pe) => {
          const ex = getExercise(pe.exerciseId);
          return h('li', {}, h('a', { href: `#/exercises/${pe.exerciseId}?from=home` }, ex?.name ?? pe.exerciseId), ` · ${pe.sets} × ${pe.repsMin}–${pe.repsMax}`);
        })),
      ),
      h(
        'div',
        { class: 'row' },
        // Phones always start workout mode; elsewhere, a day that isn't due today is logged in the list view.
        h('a', { href: startWorkoutHref(day.id), class: 'button primary' }, isPhone() || (inDays === 0 && !doneToday) ? 'Start workout' : 'Log this workout'),
        reshuffleButton(ctx, day),
      ),
    );
  }

  let installCard: HTMLElement | null = null;
  const install = ctx.install;
  if (install?.canPrompt && !install.isStandalone) {
    const btn = h('button', { type: 'button', class: 'primary' }, 'Install app');
    btn.addEventListener('click', async () => {
      if (await install.prompt()) ctx.toast('GymFree installed.');
      installCard?.remove();
    });
    installCard = h('section', { class: 'card install-card' }, h('span', {}, 'Install GymFree on this device for one-tap access, even offline.'), btn);
  }

  return h(
    'main',
    { class: 'container' },
    installCard,
    h('h1', {}, state.profile.name ? `Hi, ${state.profile.name}` : 'Your training'),
    h('p', { class: 'muted' }, `Goal: ${GOAL_PROFILES[state.goal].label}`),
    h('div', { class: 'today-row' }, todayCard, (wheel ??= renderSpinWheel())),
    h(
      'section',
      { class: 'stats', 'aria-label': 'Quick stats' },
      stat('workouts this week', `${workoutsInWeek(state.workouts, today)}/${state.plan.length || state.routine.trainingDays.length}`),
      stat('week streak', weekStreak(state.workouts, today)),
      stat('total workouts', state.workouts.length),
    ),
    calories
      ? h('section', { class: 'card' }, h('h2', {}, 'Daily nutrition estimate'), h('p', {}, `≈ ${calories.target} kcal · ${calories.proteinG} g protein`), h('small', { class: 'muted' }, 'Estimate only; not medical advice.'))
      : null,
    h('section', { class: 'card' }, h('h2', {}, 'Tips for you'), h('ul', { class: 'tips' }, ...routineAdvice(state.goal, state.routine).map((t) => h('li', {}, t)))),
  );
}
