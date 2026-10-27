import { randomId } from '../../core/encoding';
import { generatePlan, prescription, refillDay } from '../../core/planner';
import { clampNumber, cleanText, MAX_NAME } from '../../core/state';
import { weekdayOf } from '../../core/dates';
import { MUSCLE_GROUPS, WEEKDAY_NAMES, type PlanDay, type PlannedExercise, type Weekday } from '../../core/types';
import { EXERCISES, filterExercises, getExercise } from '../../data/exercises';
import type { ViewContext } from '../context';
import { h, select } from '../dom';
import { renderDemo } from '../demo';
import { MUSCLE_LABELS } from '../labels';

export function prescriptionText(pe: Pick<PlannedExercise, 'sets' | 'repsMin' | 'repsMax' | 'restSec'>): string {
  const reps = pe.repsMin === pe.repsMax ? `${pe.repsMin}` : `${pe.repsMin}–${pe.repsMax}`;
  return `${pe.sets} sets × ${reps} reps · ${pe.restSec} s rest`;
}

/**
 * One exercise as an expandable row: tap to see the demo and steps in place, without
 * leaving the page. The demo is only mounted when opened, so images load on demand.
 */
export function exerciseItem(ctx: ViewContext, pe: PlannedExercise, from: string): HTMLElement {
  const ex = getExercise(pe.exerciseId);
  if (!ex) return h('li', {}, pe.exerciseId);
  const content = h('div', { class: 'how-to' });
  const details = h(
    'details',
    { class: 'exercise-item' },
    h(
      'summary',
      {},
      renderDemo(ex, { animate: false, size: 'thumb' }),
      h('span', { class: 'ex-text' }, h('strong', {}, ex.name), h('span', { class: 'muted' }, prescriptionText(pe))),
      h('span', { class: 'ex-hint', 'aria-hidden': 'true' }, 'How to'),
    ),
    content,
  );
  details.addEventListener('toggle', () => {
    if (!details.open || content.firstChild) return;
    content.append(
      renderDemo(ex, { animate: ctx.animate() }),
      h('ol', {}, ...ex.steps.map((step) => h('li', {}, step))),
      h('p', { class: 'note-inline' }, '💡 ', ex.tip),
      h('a', { href: `#/exercises/${ex.id}?from=${from}` }, 'Open full guide'),
    );
  });
  return h('li', {}, details);
}

function orderedDays(plan: readonly PlanDay[]): PlanDay[] {
  return [...plan].sort((a, b) => (a.weekday ?? 7) - (b.weekday ?? 7));
}

/** Read-only weekly plan: simple to scan, editing lives behind "Edit plan". */
export function renderPlan(ctx: ViewContext): HTMLElement {
  const today = weekdayOf(ctx.today());
  const days = orderedDays(ctx.state.plan);
  return h(
    'main',
    { class: 'container' },
    h('div', { class: 'page-head' }, h('h1', {}, 'My weekly plan'), h('a', { href: '#/plan/edit', class: 'button secondary' }, 'Edit plan')),
    days.length ? null : h('p', { class: 'muted' }, 'Your plan is empty. Use “Edit plan” to add a training day.'),
    ...days.map((day) =>
      h(
        'section',
        { class: `card plan-view${day.weekday === today ? ' today' : ''}`, 'aria-labelledby': `day-${day.id}` },
        h(
          'div',
          { class: 'day-head' },
          h('h2', { id: `day-${day.id}` }, day.weekday === null ? 'Any day' : WEEKDAY_NAMES[day.weekday], h('span', { class: 'day-title' }, day.name)),
          day.weekday === today ? h('span', { class: 'badge' }, 'Today') : null,
        ),
        h('p', { class: 'muted' }, day.muscleGroups.map((g) => MUSCLE_LABELS[g]).join(' · ')),
        h('ul', { class: 'exercise-list' }, ...day.exercises.map((pe) => exerciseItem(ctx, pe, 'plan'))),
        day.cardioMinutes ? h('p', { class: 'muted' }, `+ ${day.cardioMinutes} min cardio of your choice`) : null,
        h('a', { href: `#/log/${day.id}`, class: 'button primary' }, 'Start this workout'),
      ),
    ),
  );
}

function numberInput(label: string, value: number, min: number, max: number, onSet: (v: number) => void): HTMLElement {
  const input = h('input', { type: 'number', min, max, step: 1, value, 'aria-label': label, class: 'num' });
  input.addEventListener('change', () => onSet(Math.round(clampNumber(input.value, min, max, value))));
  return input;
}

function dayCard(ctx: ViewContext, day: PlanDay, index: number): HTMLElement {
  const { state } = ctx;
  const mutateDay = (fn: (d: PlanDay) => void, render = true) =>
    ctx.update((s) => {
      const d = s.plan.find((x) => x.id === day.id);
      if (d) fn(d);
    }, { render });

  const name = h('input', { type: 'text', value: day.name, maxlength: MAX_NAME, 'aria-label': 'Day name', class: 'day-name' });
  name.addEventListener('change', () => mutateDay((d) => (d.name = cleanText(name.value, MAX_NAME) || 'Workout'), false));

  const weekday = select(
    [['', 'Any day'] as const, ...WEEKDAY_NAMES.map((n, i) => [String(i), n] as const)],
    day.weekday === null ? '' : String(day.weekday),
    { 'aria-label': 'Weekday' },
  );
  weekday.addEventListener('change', () => mutateDay((d) => (d.weekday = weekday.value === '' ? null : (Number(weekday.value) as Weekday))));

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Muscle groups' });
  for (const g of MUSCLE_GROUPS) {
    const id = `m-${day.id}-${g}`;
    const cb = h('input', { type: 'checkbox', id, class: 'visually-hidden', checked: day.muscleGroups.includes(g) });
    cb.addEventListener('change', () =>
      mutateDay((d) => (d.muscleGroups = cb.checked ? [...d.muscleGroups, g] : d.muscleGroups.filter((x) => x !== g)), false),
    );
    chips.appendChild(h('label', { class: 'chip small', for: id }, cb, MUSCLE_LABELS[g]));
  }

  const suggest = h('button', { type: 'button', class: 'secondary' }, 'Suggest exercises for these muscles');
  suggest.addEventListener('click', () =>
    ctx.update((s) => {
      const i = s.plan.findIndex((x) => x.id === day.id);
      if (i >= 0) s.plan[i] = refillDay(s.plan[i], s.goal, s.routine, s.profile.experience);
    }),
  );

  const rows = day.exercises.map((pe, ei) => {
    const ex = getExercise(pe.exerciseId);
    const remove = h('button', { type: 'button', class: 'icon danger', 'aria-label': `Remove ${ex?.name}` }, '✕');
    remove.addEventListener('click', () => mutateDay((d) => d.exercises.splice(ei, 1)));
    const up = h('button', { type: 'button', class: 'icon', 'aria-label': `Move ${ex?.name} up`, disabled: ei === 0 }, '↑');
    up.addEventListener('click', () => mutateDay((d) => d.exercises.splice(ei - 1, 0, ...d.exercises.splice(ei, 1))));
    return h(
      'tr',
      {},
      h('td', {}, h('a', { href: `#/exercises/${pe.exerciseId}?from=plan-edit` }, ex?.name ?? pe.exerciseId)),
      h('td', {}, numberInput(`Sets for ${ex?.name}`, pe.sets, 1, 10, (v) => mutateDay((d) => (d.exercises[ei].sets = v), false))),
      h(
        'td',
        { class: 'nowrap' },
        numberInput(`Minimum reps for ${ex?.name}`, pe.repsMin, 1, 100, (v) => mutateDay((d) => {
          d.exercises[ei].repsMin = v;
          d.exercises[ei].repsMax = Math.max(v, d.exercises[ei].repsMax);
        })),
        '–',
        numberInput(`Maximum reps for ${ex?.name}`, pe.repsMax, 1, 100, (v) => mutateDay((d) => {
          d.exercises[ei].repsMax = v;
          d.exercises[ei].repsMin = Math.min(v, d.exercises[ei].repsMin);
        })),
      ),
      h('td', {}, numberInput(`Rest seconds for ${ex?.name}`, pe.restSec, 0, 600, (v) => mutateDay((d) => (d.exercises[ei].restSec = v), false))),
      h('td', { class: 'nowrap' }, up, remove),
    );
  });

  const showAll = h('input', { type: 'checkbox', id: `all-${day.id}` });
  const picker = h('select', { 'aria-label': `Add exercise to ${day.name}` });
  const fillPicker = () => {
    picker.replaceChildren(h('option', { value: '' }, 'Add an exercise…'));
    const list = showAll.checked
      ? EXERCISES
      : day.muscleGroups.flatMap((g) => filterExercises({ muscle: g, equipment: state.routine.equipment }));
    const seen = new Set(day.exercises.map((x) => x.exerciseId));
    for (const ex of list) {
      if (seen.has(ex.id)) continue;
      seen.add(ex.id);
      picker.appendChild(h('option', { value: ex.id }, `${ex.name} (${MUSCLE_LABELS[ex.primary]})`));
    }
  };
  fillPicker();
  showAll.addEventListener('change', fillPicker);
  picker.addEventListener('change', () => {
    const ex = getExercise(picker.value);
    if (!ex) return;
    mutateDay((d) => d.exercises.push({ exerciseId: ex.id, ...prescription(state.goal, state.profile.experience, ex) }));
  });

  const cardio = numberInput('Cardio minutes', day.cardioMinutes, 0, 180, (v) => mutateDay((d) => (d.cardioMinutes = v), false));
  const del = h('button', { type: 'button', class: 'link danger' }, 'Delete this day');
  del.addEventListener('click', () => {
    if (confirm(`Delete "${day.name}"?`)) void ctx.update((s) => (s.plan = s.plan.filter((x) => x.id !== day.id)));
  });

  return h(
    'article',
    { class: 'card plan-day', 'data-day': index },
    h('div', { class: 'row' }, name, weekday),
    h('fieldset', {}, h('legend', {}, 'Muscle groups'), chips),
    suggest,
    day.exercises.length
      ? h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            {},
            h('thead', {}, h('tr', {}, h('th', {}, 'Exercise'), h('th', {}, 'Sets'), h('th', {}, 'Reps'), h('th', {}, 'Rest (s)'), h('th', {}, h('span', { class: 'sr-only' }, 'Actions')))),
            h('tbody', {}, ...rows),
          ),
        )
      : h('p', { class: 'muted' }, 'No exercises yet.'),
    h('div', { class: 'row' }, picker, h('label', { class: 'inline', for: `all-${day.id}` }, showAll, ' show all exercises')),
    h('div', { class: 'row' }, h('label', {}, 'Cardio minutes ', cardio), del),
  );
}

export function renderPlanEditor(ctx: ViewContext): HTMLElement {
  const add = h('button', { type: 'button', class: 'secondary' }, '+ Add training day');
  add.addEventListener('click', () =>
    ctx.update((s) => s.plan.push({ id: randomId(8), name: 'Custom day', weekday: null, muscleGroups: [], exercises: [], cardioMinutes: 0 })),
  );
  const regen = h('button', { type: 'button', class: 'link danger' }, 'Regenerate the whole plan');
  regen.addEventListener('click', () => {
    if (confirm('Replace your current plan with a freshly generated one?')) {
      void ctx.update((s) => (s.plan = generatePlan(s.goal, s.routine, s.profile)));
    }
  });
  return h(
    'main',
    { class: 'container' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Edit your plan'), h('a', { href: '#/plan', class: 'button primary' }, 'Done')),
    h('p', { class: 'muted' }, 'Changes save automatically. Change days, muscle groups, exercises, sets, reps and rest.'),
    h('div', { class: 'stack' }, ...ctx.state.plan.map((d, i) => dayCard(ctx, d, i))),
    h('div', { class: 'actions' }, add, h('a', { href: '#/onboarding', class: 'button secondary' }, 'Change goal & routine'), regen),
  );
}
