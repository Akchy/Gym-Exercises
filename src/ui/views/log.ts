import { isISODate } from '../../core/dates';
import { randomId } from '../../core/encoding';
import { clampNumber, cleanText, MAX_NOTES } from '../../core/state';
import type { LoggedExercise, WorkoutLog } from '../../core/types';
import { fromDisplayWeight, round, toDisplayWeight } from '../../core/units';
import { EXERCISES, getExercise } from '../../data/exercises';
import type { ViewContext } from '../context';
import { clear, h } from '../dom';

/** Heaviest weight from the most recent session of an exercise (to prefill the form). */
export function lastWeight(workouts: readonly WorkoutLog[], exerciseId: string): number {
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    const e = w.entries.find((x) => x.exerciseId === exerciseId && x.sets.length);
    if (e) return Math.max(...e.sets.map((x) => x.weightKg));
  }
  return 0;
}

export function renderLogPicker(ctx: ViewContext): HTMLElement {
  return h(
    'main',
    { class: 'container' },
    h('h1', {}, 'Log a workout'),
    h('p', { class: 'muted' }, 'Pick a day from your plan, or start an empty workout.'),
    h(
      'div',
      { class: 'stack' },
      ...ctx.state.plan.map((d) => h('a', { href: `#/log/${d.id}`, class: 'card link-card' }, h('strong', {}, d.name), h('span', { class: 'muted' }, `${d.exercises.length} exercises`))),
      h('a', { href: '#/log/free', class: 'card link-card' }, h('strong', {}, 'Empty workout'), h('span', { class: 'muted' }, 'Choose exercises as you go')),
    ),
  );
}

export function renderLogForm(ctx: ViewContext, dayId: string): HTMLElement {
  const { state } = ctx;
  const units = state.settings.units;
  const day = state.plan.find((d) => d.id === dayId) ?? null;
  const entries: LoggedExercise[] = (day?.exercises ?? []).map((pe) => ({
    exerciseId: pe.exerciseId,
    sets: Array.from({ length: pe.sets }, () => ({ reps: pe.repsMax, weightKg: lastWeight(state.workouts, pe.exerciseId) })),
  }));

  const list = h('div', { class: 'stack' });
  const renderEntries = () => {
    clear(list);
    entries.forEach((entry, ei) => {
      const ex = getExercise(entry.exerciseId);
      const name = ex?.name ?? entry.exerciseId;
      const rows = entry.sets.map((set, si) => {
        const reps = h('input', { type: 'number', min: 0, max: 1000, step: 1, value: set.reps, inputmode: 'numeric', 'aria-label': `${name} set ${si + 1} reps`, class: 'num' });
        reps.addEventListener('change', () => (set.reps = Math.round(clampNumber(reps.value, 0, 1000, 0))));
        const weight = h('input', { type: 'number', min: 0, max: 2000, step: 'any', value: toDisplayWeight(set.weightKg, units), inputmode: 'decimal', 'aria-label': `${name} set ${si + 1} weight (${units})`, class: 'num' });
        weight.addEventListener('change', () => (set.weightKg = round(fromDisplayWeight(clampNumber(weight.value, 0, 2000, 0), units), 3)));
        const remove = h('button', { type: 'button', class: 'icon danger', 'aria-label': `Remove set ${si + 1} of ${name}` }, '✕');
        remove.addEventListener('click', () => {
          entry.sets.splice(si, 1);
          renderEntries();
        });
        return h('tr', {}, h('td', {}, String(si + 1)), h('td', {}, reps), h('td', {}, weight), h('td', {}, remove));
      });
      const addSet = h('button', { type: 'button', class: 'secondary' }, '+ Set');
      addSet.addEventListener('click', () => {
        const prev = entry.sets[entry.sets.length - 1];
        entry.sets.push(prev ? { ...prev } : { reps: 10, weightKg: 0 });
        renderEntries();
      });
      const removeEx = h('button', { type: 'button', class: 'link danger' }, 'Remove exercise');
      removeEx.addEventListener('click', () => {
        entries.splice(ei, 1);
        renderEntries();
      });
      list.appendChild(
        h(
          'section',
          { class: 'card log-entry' },
          h('h2', {}, h('a', { href: `#/exercises/${entry.exerciseId}` }, name)),
          h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Set'), h('th', {}, 'Reps'), h('th', {}, `Weight (${units})`), h('th', {}, h('span', { class: 'sr-only' }, 'Remove')))), h('tbody', {}, ...rows)),
          h('div', { class: 'row' }, addSet, removeEx),
        ),
      );
    });
  };
  renderEntries();

  const picker = h('select', { 'aria-label': 'Add exercise' }, h('option', { value: '' }, 'Add an exercise…'), ...EXERCISES.map((ex) => h('option', { value: ex.id }, ex.name)));
  picker.addEventListener('change', () => {
    if (!getExercise(picker.value)) return;
    entries.push({ exerciseId: picker.value, sets: [{ reps: 10, weightKg: lastWeight(state.workouts, picker.value) }] });
    picker.value = '';
    renderEntries();
  });

  const date = h('input', { type: 'date', id: 'log-date', value: ctx.today(), max: ctx.today(), required: true });
  const duration = h('input', { type: 'number', id: 'log-duration', min: 0, max: 600, inputmode: 'numeric' });
  const notes = h('textarea', { id: 'log-notes', maxlength: MAX_NOTES, rows: 2 });
  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { type: 'submit', class: 'primary' }, 'Save workout');

  const form = h(
    'form',
    { class: 'container' },
    h('h1', {}, day ? `Log: ${day.name}` : 'Log: empty workout'),
    h('div', { class: 'row' }, h('label', { for: 'log-date' }, 'Date ', date), h('label', { for: 'log-duration' }, 'Duration (min) ', duration)),
    list,
    picker,
    h('div', { class: 'field' }, h('label', { for: 'log-notes' }, 'Notes (optional)'), notes),
    error,
    h('div', { class: 'actions' }, save),
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const logged = entries.map((e) => ({ ...e, sets: e.sets.filter((s) => s.reps > 0) })).filter((e) => e.sets.length);
    if (!isISODate(date.value) || date.value > ctx.today()) return void (error.textContent = 'Please choose a valid date (not in the future).');
    if (!logged.length) return void (error.textContent = 'Add at least one set with reps before saving.');
    save.disabled = true;
    const log: WorkoutLog = {
      id: randomId(8),
      date: date.value,
      dayId: day?.id ?? null,
      entries: logged,
      durationMin: duration.value === '' ? null : Math.round(clampNumber(duration.value, 0, 600, 0)),
      notes: cleanText(notes.value, MAX_NOTES),
    };
    await ctx.update((s) => s.workouts.push(log), { render: false });
    ctx.toast('Workout saved. Nice job!');
    ctx.navigate('/progress');
  });
  return h('main', {}, form);
}
