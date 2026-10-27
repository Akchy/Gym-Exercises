import { prescription } from '../../core/planner';
import { exerciseSeries, personalRecords } from '../../core/progress';
import { MUSCLE_GROUPS, type MuscleGroup } from '../../core/types';
import { formatWeight } from '../../core/units';
import { filterExercises, getExercise } from '../../data/exercises';
import { PHOTO_CREDIT } from '../../data/photos';
import { lineChart } from '../chart';
import type { ViewContext } from '../context';
import { clear, h, select } from '../dom';
import { renderDemo } from '../demo';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../labels';

export function renderExerciseList(ctx: ViewContext): HTMLElement {
  const { state } = ctx;
  let muscle: MuscleGroup | 'all' = 'all';
  const muscleSel = select([['all', 'All muscle groups'] as const, ...MUSCLE_GROUPS.map((g) => [g, MUSCLE_LABELS[g]] as const)], 'all', { 'aria-label': 'Muscle group' });
  const mine = h('input', { type: 'checkbox', id: 'only-mine', checked: true });
  const search = h('input', { type: 'search', placeholder: 'Search exercises', 'aria-label': 'Search exercises' });
  const grid = h('div', { class: 'grid', 'aria-live': 'polite' });
  const count = h('p', { class: 'muted' });

  const render = () => {
    clear(grid);
    const list = filterExercises({ muscle, equipment: mine.checked ? state.routine.equipment : undefined, query: search.value });
    count.textContent = `${list.length} exercise${list.length === 1 ? '' : 's'}`;
    for (const ex of list) {
      grid.appendChild(
        h(
          'a',
          { href: `#/exercises/${ex.id}`, class: 'card exercise-card' },
          renderDemo(ex, { animate: false, size: 'thumb' }),
          h('strong', {}, ex.name),
          h('span', { class: 'muted' }, `${MUSCLE_LABELS[ex.primary]} · ${ex.equipment.map((e) => EQUIPMENT_LABELS[e]).join(' / ')}`),
        ),
      );
    }
  };
  muscleSel.addEventListener('change', () => {
    muscle = muscleSel.value as MuscleGroup | 'all';
    render();
  });
  mine.addEventListener('change', render);
  search.addEventListener('input', render);
  render();
  return h(
    'main',
    { class: 'container' },
    h('h1', {}, 'Exercise library'),
    h('div', { class: 'row filters' }, muscleSel, search, h('label', { class: 'inline', for: 'only-mine' }, mine, ' only my equipment')),
    count,
    grid,
    h('p', { class: 'muted small' }, PHOTO_CREDIT),
  );
}

/** Where the "back" link of the exercise page leads, based on where the user came from. */
export const BACK_TARGETS: Record<string, readonly [href: string, label: string]> = {
  plan: ['#/plan', '← Back to my plan'],
  'plan-edit': ['#/plan/edit', '← Back to editing'],
  home: ['#/', '← Back to home'],
  library: ['#/exercises', '← All exercises'],
};

export function renderExerciseDetail(ctx: ViewContext, id: string, from = 'library'): HTMLElement {
  const [backHref, backLabel] = BACK_TARGETS[from] ?? BACK_TARGETS.library;
  const ex = getExercise(id);
  if (!ex) {
    return h('main', { class: 'container' }, h('h1', {}, 'Exercise not found'), h('a', { href: backHref }, backLabel));
  }
  const { state } = ctx;
  let animate = ctx.animate();
  const figureBox = h('div', { class: 'demo-large' });
  const toggle = h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(animate) });
  const drawFigure = () => {
    figureBox.replaceChildren(renderDemo(ex, { animate }));
    toggle.textContent = animate ? 'Show still images' : 'Play animation';
    toggle.setAttribute('aria-pressed', String(animate));
  };
  toggle.addEventListener('click', () => {
    animate = !animate;
    drawFigure();
  });
  drawFigure();

  const daySel = select(state.plan.map((d) => [d.id, d.name] as const), state.plan[0]?.id ?? '', { 'aria-label': 'Plan day' });
  const addBtn = h('button', { type: 'button', class: 'primary' }, 'Add to plan');
  addBtn.addEventListener('click', async () => {
    const dayId = daySel.value;
    await ctx.update((s) => {
      const d = s.plan.find((x) => x.id === dayId);
      if (d && !d.exercises.some((x) => x.exerciseId === ex.id)) d.exercises.push({ exerciseId: ex.id, ...prescription(s.goal, s.profile.experience, ex) });
    }, { render: false });
    ctx.toast(`${ex.name} added to your plan.`);
  });

  const pr = personalRecords(state.workouts).find((p) => p.exerciseId === ex.id);
  const series = exerciseSeries(state.workouts, ex.id);

  return h(
    'main',
    { class: 'container' },
    h('a', { href: backHref, class: 'back' }, backLabel),
    h('h1', {}, ex.name),
    h('p', { class: 'muted' }, `${MUSCLE_LABELS[ex.primary]}${ex.secondary.length ? ` (also ${ex.secondary.map((g) => MUSCLE_LABELS[g]).join(', ')})` : ''} · ${ex.equipment.map((e) => EQUIPMENT_LABELS[e]).join(' / ')} · ${ex.level}`),
    h('div', { class: 'detail' }, h('div', {}, figureBox, toggle), h('div', {}, h('h2', {}, 'How to do it'), h('ol', {}, ...ex.steps.map((s) => h('li', {}, s))), h('p', { class: 'card note' }, '💡 ', ex.tip))),
    state.plan.length ? h('div', { class: 'row' }, daySel, addBtn) : null,
    pr
      ? h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Your progress'),
          h('p', {}, pr.bestWeightKg > 0 ? `Best: ${formatWeight(pr.bestWeightKg, state.settings.units)} · est. 1RM ${formatWeight(pr.bestOneRepMax, state.settings.units)}` : `Best: ${pr.bestReps} reps`),
          lineChart(series, `${ex.name} progress`),
        )
      : null,
  );
}
