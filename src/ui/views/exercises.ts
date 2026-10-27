import { prescription } from '../../core/planner';
import { exerciseSeries, personalRecords } from '../../core/progress';
import { MUSCLE_GROUPS, type MuscleGroup } from '../../core/types';
import { formatWeight } from '../../core/units';
import { filterExercises, getExercise, type Exercise } from '../../data/exercises';
import { lineChart } from '../chart';
import type { ViewContext } from '../context';
import { clear, h, select } from '../dom';
import { renderFigure } from '../figure';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../labels';

/** Renders figures lazily when cards scroll into view, and pauses off-screen animations. */
function lazyFigure(ex: Exercise, animate: boolean): HTMLElement {
  const holder = h('div', { class: 'figure-holder' });
  const mount = () => {
    if (!holder.firstChild) holder.appendChild(renderFigure(ex.motion, { animate, prop: ex.prop, label: ex.name }));
  };
  if (typeof IntersectionObserver === 'undefined') {
    mount();
    return holder;
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) mount();
      const el = holder.firstChild as SVGSVGElement | null;
      if (el && typeof el.pauseAnimations === 'function') {
        if (entry.isIntersecting) el.unpauseAnimations();
        else el.pauseAnimations();
      }
    }
  }, { rootMargin: '100px' });
  io.observe(holder);
  return holder;
}

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
          lazyFigure(ex, ctx.animate()),
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
  );
}

export function renderExerciseDetail(ctx: ViewContext, id: string): HTMLElement {
  const ex = getExercise(id);
  if (!ex) {
    return h('main', { class: 'container' }, h('h1', {}, 'Exercise not found'), h('a', { href: '#/exercises' }, 'Back to library'));
  }
  const { state } = ctx;
  let animate = ctx.animate();
  const figureBox = h('div', { class: 'figure-large' });
  const toggle = h('button', { type: 'button', class: 'secondary', 'aria-pressed': String(animate) });
  const drawFigure = () => {
    figureBox.replaceChildren(renderFigure(ex.motion, { animate, prop: ex.prop, label: ex.name }));
    toggle.textContent = animate ? 'Show start/end images' : 'Show animation';
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
    h('a', { href: '#/exercises', class: 'back' }, '← All exercises'),
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
