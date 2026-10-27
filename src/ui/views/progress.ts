import { daysBetween, isISODate } from '../../core/dates';
import {
  exerciseSeries,
  loggedExerciseIds,
  muscleGroupCounts,
  personalRecords,
  weekStreak,
  weightChange,
  workoutVolume,
  workoutsInWeek,
} from '../../core/progress';
import { clampNumber } from '../../core/state';
import type { MuscleGroup } from '../../core/types';
import { formatWeight, fromDisplayWeight, round, toDisplayWeight } from '../../core/units';
import { getExercise } from '../../data/exercises';
import { lineChart } from '../chart';
import type { ViewContext } from '../context';
import { h, stepper } from '../dom';
import { MUSCLE_LABELS } from '../labels';

export function renderProgress(ctx: ViewContext): HTMLElement {
  const { state } = ctx;
  const units = state.settings.units;
  const today = ctx.today();
  const recent = state.workouts.filter((w) => {
    const age = daysBetween(w.date, today);
    return age >= 0 && age < 30;
  });
  const volume30 = recent.reduce((s, w) => s + workoutVolume(w), 0);

  // Exercise chart
  const ids = loggedExerciseIds(state.workouts);
  const chartBox = h('div', {});
  const exSel = h('select', { 'aria-label': 'Exercise to chart' }, ...ids.map((id) => h('option', { value: id }, getExercise(id)?.name ?? id)));
  const drawChart = () => {
    const ex = getExercise(exSel.value);
    const weighted = state.workouts.some((w) => w.entries.some((e) => e.exerciseId === exSel.value && e.sets.some((s) => s.weightKg > 0)));
    const series = exerciseSeries(state.workouts, exSel.value).map((p) => (weighted ? { ...p, value: toDisplayWeight(p.value, units) } : p));
    chartBox.replaceChildren(lineChart(series, `${ex?.name} progress`, weighted ? ` ${units} (est. 1RM)` : ' reps'));
  };
  exSel.addEventListener('change', drawChart);
  if (ids.length) drawChart();

  // Body weight
  const bwDate = h('input', { type: 'date', id: 'bw-date', value: today, max: today });
  const bwValue = h('input', { type: 'number', id: 'bw-value', min: 20, max: units === 'kg' ? 400 : 880, step: 'any', inputmode: 'decimal', required: true });
  const bwError = h('p', { class: 'error', role: 'alert' });
  const bwForm = h(
    'form',
    { class: 'row' },
    h('label', { for: 'bw-date' }, 'Date ', bwDate),
    h('label', { for: 'bw-value' }, `Weight (${units})`), stepper(bwValue, 0.5),
    h('button', { type: 'submit', class: 'secondary' }, 'Add'),
  );
  bwForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = clampNumber(bwValue.value, 1, 2000, NaN);
    if (!isISODate(bwDate.value) || Number.isNaN(v)) return void (bwError.textContent = 'Enter a valid date and weight.');
    const kg = round(fromDisplayWeight(v, units), 2);
    if (kg < 20 || kg > 400) return void (bwError.textContent = 'That weight looks out of range.');
    await ctx.update((s) => {
      s.bodyLogs = s.bodyLogs.filter((b) => b.date !== bwDate.value).concat({ date: bwDate.value, weightKg: kg }).sort((a, b) => a.date.localeCompare(b.date));
      s.profile.weightKg = s.bodyLogs[s.bodyLogs.length - 1].weightKg;
    });
  });
  const change = weightChange(state.bodyLogs);

  const counts = muscleGroupCounts(state.workouts, today);
  const maxCount = Math.max(1, ...Object.values(counts));
  const prs = personalRecords(state.workouts).slice(0, 10);

  const history = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);

  return h(
    'main',
    { class: 'container' },
    h('h1', {}, 'Progress'),
    h(
      'section',
      { class: 'stats', 'aria-label': 'Summary' },
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(state.workouts.length)), h('span', { class: 'stat-label' }, 'total workouts')),
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(workoutsInWeek(state.workouts, today))), h('span', { class: 'stat-label' }, 'this week')),
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(weekStreak(state.workouts, today))), h('span', { class: 'stat-label' }, 'week streak')),
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, formatWeight(volume30, units)), h('span', { class: 'stat-label' }, 'lifted (30 days)')),
    ),
    h('section', { class: 'card' }, h('h2', {}, 'Exercise progress'), ids.length ? h('div', {}, exSel, chartBox) : h('p', { class: 'muted' }, 'Log a workout to see your progress here.')),
    prs.length
      ? h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Personal records'),
          h(
            'ul',
            { class: 'compact' },
            ...prs.map((p) => h('li', {}, h('strong', {}, getExercise(p.exerciseId)?.name ?? p.exerciseId), ': ', p.bestWeightKg > 0 ? `${formatWeight(p.bestWeightKg, units)} (est. 1RM ${formatWeight(p.bestOneRepMax, units)})` : `${p.bestReps} reps`, h('span', { class: 'muted' }, ` · ${p.date}`))),
          ),
        )
      : null,
    Object.keys(counts).length
      ? h(
          'section',
          { class: 'card' },
          h('h2', {}, 'Sets per muscle group (last 30 days)'),
          h('ul', { class: 'bars' }, ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([g, n]) =>
            {
            // Set via CSSOM (allowed by the strict CSP, unlike style attributes).
            const bar = h('span', { class: 'bar' });
            bar.style.setProperty('--w', `${Math.round((n / maxCount) * 100)}%`);
            return h('li', {}, h('span', {}, MUSCLE_LABELS[g as MuscleGroup]), bar, h('span', {}, String(n)));
          })),
        )
      : null,
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Body weight'),
      change ? h('p', {}, `Latest ${formatWeight(change.latest.weightKg, units)} · change since ${change.first.date}: ${change.changeKg > 0 ? '+' : ''}${toDisplayWeight(change.changeKg, units)} ${units}`) : null,
      lineChart(state.bodyLogs.map((b) => ({ date: b.date, value: toDisplayWeight(b.weightKg, units) })), 'Body weight', ` ${units}`),
      bwForm,
      bwError,
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'History'),
      history.length
        ? h('ul', { class: 'history' }, ...history.map((w) => {
            const del = h('button', { type: 'button', class: 'icon danger', 'aria-label': `Delete workout from ${w.date}` }, '✕');
            del.addEventListener('click', () => {
              if (!confirm(`Delete the workout from ${w.date}?`)) return;
              void ctx.update((s) => {
                s.workouts = s.workouts.filter((x) => x.id !== w.id);
                s.deletedWorkoutIds.push(w.id); // so another device's copy doesn't bring it back
              });
            });
            const dayName = state.plan.find((d) => d.id === w.dayId)?.name ?? 'Workout';
            return h('li', {}, h('span', {}, h('strong', {}, w.date), ` · ${dayName} · ${w.entries.length} exercises · ${formatWeight(workoutVolume(w), units)}`), del);
          }))
        : h('p', { class: 'muted' }, 'No workouts logged yet.'),
    ),
  );
}
