import { isISODate } from '../../core/dates';
import { randomId } from '../../core/encoding';
import { clampNumber, cleanText, MAX_NOTES, MAX_WEIGHT_KG } from '../../core/state';
import type { LoggedExercise, PlannedExercise, WorkoutLog } from '../../core/types';
import { fromDisplayWeight, round, toDisplayWeight } from '../../core/units';
import { EXERCISES, getExercise } from '../../data/exercises';
import type { ViewContext } from '../context';
import { clear, h, stepper } from '../dom';
import { renderDemo } from '../demo';
import { prescriptionText } from './plan';

/** Heaviest weight from the most recent session of an exercise (to prefill the form). */
export function lastWeight(workouts: readonly WorkoutLog[], exerciseId: string): number {
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) {
    const e = w.entries.find((x) => x.exerciseId === exerciseId && x.sets.length);
    if (e) return Math.max(...e.sets.map((x) => x.weightKg));
  }
  return 0;
}

function inProgress(ctx: ViewContext, dayId: string): HTMLElement | null {
  return ctx.repo.hasDraft(dayId) ? h('span', { class: 'badge in-progress' }, 'Unsaved workout in progress') : null;
}

export function renderLogPicker(ctx: ViewContext): HTMLElement {
  return h(
    'main',
    { class: 'container' },
    h('h1', {}, 'Log a workout'),
    h('p', { class: 'muted' }, 'Pick a day from your plan, or start a free workout.'),
    h(
      'div',
      { class: 'stack' },
      ...ctx.state.plan.map((d) => h('a', { href: `#/log/${d.id}`, class: 'card link-card' }, h('strong', {}, d.name), h('span', { class: 'muted' }, `${d.exercises.length} exercises`), inProgress(ctx, d.id))),
      h('a', { href: '#/log/free', class: 'card link-card' }, h('strong', {}, 'Free workout'), h('span', { class: 'muted' }, 'Choose exercises as you go'), inProgress(ctx, 'free')),
    ),
  );
}

interface DraftSet {
  reps: number | null;
  weightKg: number | null;
}

interface DraftEntry {
  exerciseId: string;
  target: PlannedExercise | null;
  sets: DraftSet[];
}

/** A workout being filled in, kept on the device until it is saved or discarded. */
export interface WorkoutDraft {
  entries: { exerciseId: string; sets: DraftSet[] }[];
  date: string;
  durationMin: number | null;
  notes: string;
}

const optionalNum = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? clampNumber(v, 0, max, 0) : null);

/** Validates a stored draft (it comes from device storage, so it is treated as untrusted). */
export function readDraft(raw: unknown): WorkoutDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const entries = (Array.isArray(d.entries) ? d.entries : []).slice(0, 40).flatMap((e) => {
    const exerciseId = (e as Record<string, unknown>)?.exerciseId;
    if (typeof exerciseId !== 'string' || !getExercise(exerciseId)) return [];
    const sets = (Array.isArray((e as Record<string, unknown>).sets) ? ((e as Record<string, unknown>).sets as unknown[]) : []).slice(0, 20).map((st) => {
      const x = (st ?? {}) as Record<string, unknown>;
      const reps = optionalNum(x.reps, 1000);
      return { reps: reps === null ? null : Math.round(reps), weightKg: optionalNum(x.weightKg, MAX_WEIGHT_KG) };
    });
    return [{ exerciseId, sets: sets.length ? sets : [{ reps: null, weightKg: null }] }];
  });
  return {
    entries,
    date: isISODate(d.date) ? d.date : '',
    durationMin: optionalNum(d.durationMin, 600),
    notes: cleanText(d.notes, MAX_NOTES),
  };
}

/** Converts the form draft into logged entries: sets without reps are skipped. */
export function draftToEntries(entries: readonly DraftEntry[]): LoggedExercise[] {
  return entries
    .map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets.filter((s) => (s.reps ?? 0) > 0).map((s) => ({ reps: s.reps as number, weightKg: s.weightKg ?? 0 })),
    }))
    .filter((e) => e.sets.length);
}

export function renderLogForm(ctx: ViewContext, dayId: string): HTMLElement {
  const { state } = ctx;
  const units = state.settings.units;
  const maxWeight = toDisplayWeight(MAX_WEIGHT_KG, units);
  const day = state.plan.find((d) => d.id === dayId) ?? null;
  const targetFor = (exerciseId: string) => day?.exercises.find((pe) => pe.exerciseId === exerciseId) ?? null;
  // Each exercise starts with one empty set; the user adds sets as they go.
  const planned: DraftEntry[] = (day?.exercises ?? []).map((pe) => ({ exerciseId: pe.exerciseId, target: pe, sets: [{ reps: null, weightKg: null }] }));
  const plannedIds = planned.map((e) => e.exerciseId).join();
  // An unfinished workout from earlier (app closed, page left) picks up where it stopped.
  const restored = readDraft(ctx.repo.draft(dayId));
  const entries: DraftEntry[] = restored ? restored.entries.map((e) => ({ ...e, target: targetFor(e.exerciseId) })) : planned;

  const date = h('input', { type: 'date', id: 'log-date', value: restored?.date && restored.date <= ctx.today() ? restored.date : ctx.today(), max: ctx.today(), required: true });
  const duration = h('input', { type: 'number', id: 'log-duration', min: 0, max: 600, inputmode: 'numeric', value: restored?.durationMin ?? '' });
  const notes = h('textarea', { id: 'log-notes', maxlength: MAX_NOTES, rows: 2 }, restored?.notes ?? '');

  /** Keeps the workout on the device while it is being filled in (removed once nothing is entered). */
  const persistDraft = () => {
    const touched =
      entries.some((e) => e.sets.some((st) => st.reps !== null || st.weightKg !== null)) ||
      entries.map((e) => e.exerciseId).join() !== plannedIds ||
      notes.value.trim() !== '' ||
      duration.value !== '';
    const draft: WorkoutDraft = {
      entries: entries.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets })),
      date: date.value,
      durationMin: duration.value === '' ? null : Number(duration.value),
      notes: notes.value,
    };
    ctx.repo.setDraft(dayId, touched ? draft : null);
  };

  const list = h('div', { class: 'stack' });
  const renderEntries = () => {
    clear(list);
    entries.forEach((entry, ei) => {
      const ex = getExercise(entry.exerciseId);
      if (!ex) return;
      const name = ex.name;
      const last = lastWeight(state.workouts, entry.exerciseId);
      const repsHint = entry.target ? (entry.target.repsMin === entry.target.repsMax ? String(entry.target.repsMin) : `${entry.target.repsMin}–${entry.target.repsMax}`) : 'reps';
      const rows = entry.sets.map((set, si) => {
        const reps = h('input', { type: 'number', min: 0, max: 1000, step: 1, value: set.reps ?? '', placeholder: repsHint, inputmode: 'numeric', 'aria-label': `${name} set ${si + 1} reps`, class: 'num' });
        const readReps = () => (set.reps = reps.value === '' ? null : Math.round(clampNumber(reps.value, 0, 1000, 0)));
        reps.addEventListener('input', readReps); // while typing, so a draft is never behind
        reps.addEventListener('change', readReps);
        const weight = h('input', {
          type: 'number', min: 0, max: maxWeight, step: 'any', inputmode: 'decimal', class: 'num',
          value: set.weightKg === null ? '' : toDisplayWeight(set.weightKg, units),
          placeholder: last > 0 ? String(toDisplayWeight(last, units)) : '0',
          'aria-label': `${name} set ${si + 1} weight (${units})`,
        });
        const readWeight = (correct: boolean) => {
          if (weight.value === '') return void (set.weightKg = null);
          const typed = Number(weight.value);
          const kg = clampNumber(fromDisplayWeight(typed, units), 0, MAX_WEIGHT_KG, 0);
          set.weightKg = round(kg, 3);
          // Show the correction rather than silently saving a different number.
          if (correct && !(typed >= 0 && typed <= maxWeight)) weight.value = String(toDisplayWeight(kg, units));
        };
        weight.addEventListener('input', () => readWeight(false));
        weight.addEventListener('change', () => readWeight(true));
        const remove = h('button', { type: 'button', class: 'icon danger', 'aria-label': `Remove set ${si + 1} of ${name}` }, '✕');
        remove.addEventListener('click', () => {
          entry.sets.splice(si, 1);
          renderEntries();
        });
        return h('tr', {}, h('td', {}, String(si + 1)), h('td', {}, stepper(reps)), h('td', {}, stepper(weight, units === 'kg' ? 2.5 : 5)), h('td', {}, entry.sets.length > 1 ? remove : null));
      });
      const addSet = h('button', { type: 'button', class: 'secondary' }, '+ Add set');
      addSet.addEventListener('click', () => {
        const prev = entry.sets[entry.sets.length - 1];
        entry.sets.push(prev ? { ...prev } : { reps: null, weightKg: null });
        renderEntries();
      });
      const removeEx = h('button', { type: 'button', class: 'link danger' }, 'Remove exercise');
      removeEx.addEventListener('click', () => {
        entries.splice(ei, 1);
        renderEntries();
      });
      const howTo = h('div', { class: 'how-to' });
      const details = h('details', { class: 'how-to-toggle' }, h('summary', {}, 'How to do it'), howTo);
      details.addEventListener('toggle', () => {
        if (!details.open || howTo.firstChild) return;
        howTo.append(renderDemo(ex, { animate: ctx.animate() }), h('ol', {}, ...ex.steps.map((step) => h('li', {}, step))), h('p', { class: 'note-inline' }, '💡 ', ex.tip));
      });
      list.appendChild(
        h(
          'section',
          { class: 'card log-entry' },
          h(
            'div',
            { class: 'log-head' },
            renderDemo(ex, { animate: false, size: 'thumb' }),
            h('div', {}, h('h2', {}, name), entry.target ? h('p', { class: 'muted' }, `Target: ${prescriptionText(entry.target)}`) : null),
          ),
          details,
          h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Set'), h('th', {}, 'Reps'), h('th', {}, `Weight (${units})`), h('th', {}, h('span', { class: 'sr-only' }, 'Remove')))), h('tbody', {}, ...rows)),
          h('div', { class: 'row' }, addSet, removeEx),
        ),
      );
    });
    persistDraft();
  };
  renderEntries();

  const picker = h('select', { 'aria-label': 'Add exercise' }, h('option', { value: '' }, '+ Add another exercise…'), ...EXERCISES.map((ex) => h('option', { value: ex.id }, ex.name)));
  picker.addEventListener('change', () => {
    if (!getExercise(picker.value)) return;
    entries.push({ exerciseId: picker.value, target: null, sets: [{ reps: null, weightKg: null }] });
    picker.value = '';
    renderEntries();
  });

  const discard = h('button', { type: 'button', class: 'link' }, 'Discard and start over');
  discard.addEventListener('click', () => {
    if (!confirm('Discard the unsaved workout?')) return;
    ctx.repo.setDraft(dayId, null);
    ctx.navigate(`/log/${dayId}`);
  });
  const error = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { type: 'submit', class: 'primary' }, 'Save workout');

  const form = h(
    'form',
    { class: 'container' },
    h('h1', {}, day ? day.name : 'Free workout'),
    restored ? h('p', { class: 'note-inline', role: 'status' }, 'Picked up your unsaved workout from earlier. ', discard) : null,
    h('p', { class: 'muted' }, 'Fill in each set as you finish it. Grey numbers are your target and last weight. Empty sets are not saved.'),
    h('div', { class: 'row' }, h('label', { for: 'log-date' }, 'Date ', date), h('label', { for: 'log-duration' }, 'Duration (min)'), stepper(duration, 5)),
    list,
    picker,
    h('div', { class: 'field' }, h('label', { for: 'log-notes' }, 'Notes (optional)'), notes),
    error,
    h('div', { class: 'actions' }, save),
  );
  form.addEventListener('input', persistDraft);
  form.addEventListener('change', persistDraft);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const logged = draftToEntries(entries);
    if (!isISODate(date.value) || date.value > ctx.today()) return void (error.textContent = 'Please choose a valid date (not in the future).');
    if (!logged.length) return void (error.textContent = 'Enter the reps for at least one set before saving.');
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
    ctx.repo.setDraft(dayId, null);
    ctx.toast('Workout saved. Nice job!');
    ctx.navigate('/progress');
  });
  return h('main', {}, form);
}
