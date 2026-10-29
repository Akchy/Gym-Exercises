/**
 * Workout mode: a full-screen feed with one exercise per page (swipe up for the next).
 * Each page times a set with start / pause / stop; stopping logs the set with the reps
 * and weight shown, which start from the last set or session. Swiping sideways flips the
 * page to show how to do the exercise. Progress is kept in the same draft as the log form.
 */
import { isISODate } from '../../core/dates';
import { randomId } from '../../core/encoding';
import { clampNumber, cleanText, MAX_NOTES, MAX_WEIGHT_KG } from '../../core/state';
import type { PlannedExercise, WorkoutLog } from '../../core/types';
import { fromDisplayWeight, round, toDisplayWeight } from '../../core/units';
import { type Exercise, getExercise } from '../../data/exercises';
import { photoUrls } from '../../data/photos';
import type { ViewContext } from '../context';
import { h, svg } from '../dom';
import { renderDemo } from '../demo';
import { renderFigure } from '../figure';
import { MUSCLE_LABELS } from '../labels';
import { draftToEntries, lastWeight, readDraft, type WorkoutDraft } from './log';

type Mode = 'idle' | 'run' | 'pause' | 'rest';

interface WorkoutSet {
  reps: number;
  weightKg: number;
}

interface Card {
  ex: Exercise;
  target: PlannedExercise | null;
  sets: WorkoutSet[];
  /** What the next set will be logged with. */
  next: WorkoutSet;
  mode: Mode;
  /** Time on the set before the last pause, and when it was last started (ms). */
  workedMs: number;
  runningSince: number | null;
  restEndsAt: number | null;
}

const DEFAULT_REST_SEC = 90;
const MAX_GAP_MS = 60 * 60 * 1000;
/** The newest workout screen; one replaced by a re-render must not save over it. */
let latestView = 0;
const SWIPE_PX = 50;

/** mm:ss for a number of seconds. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const ICONS = {
  play: 'M7 4.5v15l13-7.5z',
  pause: 'M6 4h4.5v16H6zM13.5 4H18v16h-4.5z',
  stop: 'M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  skip: 'M5 4.5v15l10-7.5zM16.5 4.5H20v15h-3.5z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z',
};
const icon = (name: keyof typeof ICONS) => svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d: ICONS[name] }));

export function renderWorkout(ctx: ViewContext, dayId: string): HTMLElement {
  const { state } = ctx;
  const view = ++latestView;
  const units = state.settings.units;
  const day = state.plan.find((d) => d.id === dayId)!;
  const targetFor = (id: string) => day.exercises.find((pe) => pe.exerciseId === id) ?? null;
  const plannedIds = day.exercises.map((pe) => pe.exerciseId).join();
  // Picks up a workout started earlier, here or in the log form.
  const restored = readDraft(ctx.repo.draft(dayId));
  const source = restored ? restored.entries : day.exercises.map((pe) => ({ exerciseId: pe.exerciseId, sets: [] }));
  // The workout clock only runs while workout mode is open: time from earlier visits, plus
  // this visit since `resumedAt`. A visit cut short while the phone was locked (the browser
  // closed the page) still counts, up to an hour.
  const now = () => Date.now();
  let activeMs = restored?.activeMs ?? 0;
  if (restored?.resumedAt != null) activeMs += clampNumber(now() - restored.resumedAt, 0, MAX_GAP_MS, 0);
  let resumedAt: number | null = activeMs > 0 ? now() : null;
  const workoutMs = () => activeMs + (resumedAt === null ? 0 : now() - resumedAt);

  const cards: Card[] = source.flatMap((e) => {
    const ex = getExercise(e.exerciseId);
    if (!ex) return [];
    const target = targetFor(e.exerciseId);
    // Sets the form left without reps are not logged yet.
    const sets = e.sets.filter((s) => (s.reps ?? 0) > 0).map((s) => ({ reps: s.reps as number, weightKg: s.weightKg ?? 0 }));
    const prev = sets.at(-1);
    const next = prev ? { ...prev } : { reps: target?.repsMin ?? 10, weightKg: lastWeight(state.workouts, ex.id) };
    return [{ ex, target, sets, next, mode: 'idle' as Mode, workedMs: 0, runningSince: null, restEndsAt: null }];
  });

  const persist = () => {
    const touched = activeMs > 0 || resumedAt !== null || cards.some((c) => c.sets.length) || cards.map((c) => c.ex.id).join() !== plannedIds || !!restored?.notes.trim() || restored?.durationMin != null;
    const draft: WorkoutDraft = {
      entries: cards.map((c) => ({ exerciseId: c.ex.id, sets: c.sets.length ? c.sets.map((s) => ({ ...s })) : [{ reps: null, weightKg: null }] })),
      date: restored?.date ?? '',
      durationMin: restored?.durationMin ?? null,
      notes: restored?.notes ?? '',
      activeMs,
      resumedAt,
    };
    ctx.repo.setDraft(dayId, touched ? draft : null);
  };

  const weightText = (ex: Exercise, kg: number) => (kg === 0 && ex.equipment.includes('bodyweight') ? 'Bodyweight' : `${toDisplayWeight(kg, units)} ${units}`);
  const setText = (ex: Exercise, s: WorkoutSet) => `${s.reps} × ${s.weightKg === 0 && ex.equipment.includes('bodyweight') ? 'BW' : toDisplayWeight(s.weightKg, units)}`;
  /** One step of the weight buttons: 2.5 kg or 5 lb, snapped to that grid. */
  const stepWeight = (kg: number, dir: -1 | 1) => {
    const by = units === 'kg' ? 2.5 : 5;
    const shown = toDisplayWeight(kg, units);
    const next = (dir > 0 ? Math.floor(shown / by + 1e-9) + 1 : Math.ceil(shown / by - 1e-9) - 1) * by;
    return round(clampNumber(fromDisplayWeight(next, units), 0, MAX_WEIGHT_KG, 0), 3);
  };
  const stepReps = (reps: number, dir: -1 | 1) => Math.round(clampNumber(reps + dir, 1, 1000, 1));

  const worked = (c: Card) => c.workedMs + (c.runningSince === null ? 0 : now() - c.runningSince);

  // ----- edit sheet (fixes a set logged by mistake) -----
  let editing: { card: Card; index: number; opener: HTMLElement } | null = null;
  const sheetTitle = h('h2', { id: 'edit-set-title' }, 'Edit set');
  const sheetWeight = h('span', { class: 'chip-value' });
  const sheetReps = h('span', { class: 'chip-value' });
  const sheetChip = (label: string, value: HTMLElement, change: (s: WorkoutSet, dir: -1 | 1) => void, names: [string, string]) => {
    const btn = (dir: -1 | 1) => {
      const b = h('button', { type: 'button', 'aria-label': names[dir < 0 ? 0 : 1] }, dir < 0 ? '−' : '+');
      b.addEventListener('click', () => {
        if (!editing) return;
        change(editing.card.sets[editing.index], dir);
        paintSheet();
        paint(editing.card);
        persist();
      });
      return b;
    };
    return h('div', { class: 'sheet-row' }, h('span', {}, label), h('span', { class: 'reel-chip big' }, btn(-1), value, btn(1)));
  };
  const deleteBtn = h('button', { type: 'button', class: 'sheet-delete' }, 'Delete set');
  const doneBtn = h('button', { type: 'button', class: 'sheet-done' }, 'Done');
  const scrim = h('div', { class: 'reel-scrim', hidden: true });
  const sheet = h(
    'div',
    { class: 'reel-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'edit-set-title', hidden: true },
    sheetTitle,
    sheetChip('Weight', sheetWeight, (s, d) => (s.weightKg = stepWeight(s.weightKg, d)), ['Less weight', 'More weight']),
    sheetChip('Reps', sheetReps, (s, d) => (s.reps = stepReps(s.reps, d)), ['Fewer reps', 'More reps']),
    h('div', { class: 'sheet-actions' }, deleteBtn, doneBtn),
  );
  const paintSheet = () => {
    if (!editing) return;
    const s = editing.card.sets[editing.index];
    sheetTitle.textContent = `Edit set ${editing.index + 1}`;
    sheetWeight.textContent = weightText(editing.card.ex, s.weightKg);
    sheetReps.textContent = `${s.reps} reps`;
  };
  const openSheet = (card: Card, index: number, opener: HTMLElement) => {
    editing = { card, index, opener };
    paintSheet();
    scrim.hidden = false;
    sheet.hidden = false;
    doneBtn.focus();
  };
  const closeSheet = () => {
    if (!editing) return;
    const { card, opener } = editing;
    editing = null;
    scrim.hidden = true;
    sheet.hidden = true;
    paint(card);
    paintSummary();
    // The set buttons are rebuilt on paint, so return focus to the same position.
    const strip = refs.get(card)!.sets;
    (strip.querySelector<HTMLElement>(`[data-set="${opener.dataset.set}"]`) ?? strip).focus?.();
  };
  doneBtn.addEventListener('click', closeSheet);
  scrim.addEventListener('click', closeSheet);
  deleteBtn.addEventListener('click', () => {
    if (!editing) return;
    const { card, index } = editing;
    card.sets.splice(index, 1);
    persist();
    closeSheet();
    ctx.toast(`Set ${index + 1} deleted`);
  });

  // ----- pages -----
  interface Refs {
    page: HTMLElement;
    sets: HTMLElement;
    label: HTMLElement;
    time: HTMLElement;
    weight: HTMLElement;
    reps: HTMLElement;
    main: HTMLButtonElement;
    stop: HTMLButtonElement;
    skip: HTMLButtonElement;
  }
  const refs = new Map<Card, Refs>();
  const flip = (page: HTMLElement, dir: -1 | 1) => {
    page.classList.toggle('from-left', dir < 0);
    const flipped = page.classList.toggle('flipped');
    page.querySelector('.reel-front')!.setAttribute('aria-hidden', String(flipped));
    page.querySelector('.reel-back')!.setAttribute('aria-hidden', String(!flipped));
  };

  const act = (card: Card, action: 'main' | 'stop' | 'skip') => {
    if (action === 'main') {
      if (card.mode === 'run') {
        card.workedMs = worked(card);
        card.runningSince = null;
        card.mode = 'pause';
      } else {
        if (resumedAt === null) resumedAt = now();
        if (card.mode !== 'pause') card.workedMs = 0;
        card.runningSince = now();
        card.restEndsAt = null;
        card.mode = 'run';
        persist();
      }
    } else if (action === 'stop' && (card.mode === 'run' || card.mode === 'pause')) {
      card.sets.push({ ...card.next });
      card.workedMs = 0;
      card.runningSince = null;
      card.restEndsAt = now() + (card.target?.restSec ?? DEFAULT_REST_SEC) * 1000;
      card.mode = 'rest';
      persist();
    } else if (action === 'skip' && card.mode === 'rest') {
      card.restEndsAt = null;
      card.mode = 'idle';
    }
    paint(card);
    paintSummary();
  };

  const nextChip = (card: Card, value: HTMLElement, change: (dir: -1 | 1) => void, names: [string, string]) => {
    const btn = (dir: -1 | 1) => {
      const b = h('button', { type: 'button', 'aria-label': `${names[dir < 0 ? 0 : 1]} for ${card.ex.name}` }, dir < 0 ? '−' : '+');
      b.addEventListener('click', () => {
        change(dir);
        paint(card);
      });
      return b;
    };
    return h('span', { class: 'reel-chip' }, btn(-1), value, btn(1));
  };

  const buildPage = (card: Card, i: number): HTMLElement => {
    const { ex } = card;
    const photos = photoUrls(ex.id);
    const media = photos
      ? h('img', { src: photos[1], alt: '', loading: i < 2 ? 'eager' : 'lazy', decoding: 'async' })
      : renderFigure(ex.motion, { animate: ctx.animate(), prop: ex.prop, label: ex.name });
    const sets = h('div', { class: 'reel-sets', tabindex: -1 });
    sets.addEventListener('click', (ev) => {
      const b = (ev.target as Element).closest<HTMLElement>('[data-set]');
      if (b) openSheet(card, Number(b.dataset.set), b);
    });
    const label = h('div', { class: 'reel-clock-label' });
    const time = h('div', { class: 'reel-clock', role: 'timer', 'aria-live': 'off' });
    const weight = h('span', { class: 'chip-value' });
    const reps = h('span', { class: 'chip-value' });
    const control = (cls: string, action: 'main' | 'stop' | 'skip', name: keyof typeof ICONS, aria: string) => {
      const b = h('button', { type: 'button', class: `reel-btn ${cls}`, 'aria-label': aria }, icon(name));
      b.addEventListener('click', () => act(card, action));
      return b;
    };
    const stop = control('stop', 'stop', 'stop', `Stop and log set of ${ex.name}`);
    const main = control('main', 'main', 'play', `Start set of ${ex.name}`);
    const skip = control('', 'skip', 'skip', 'Skip rest');
    const howTo = h('button', { type: 'button', class: 'reel-hint-btn' }, '← How to →');
    const back = h('button', { type: 'button', class: 'reel-hint-btn' }, '← Back to sets →');
    const next = cards[i + 1];
    const page = h(
      'section',
      { class: 'reel-page', 'aria-label': ex.name, 'data-mode': 'idle' },
      h(
        'div',
        { class: 'reel-flip' },
        h(
          'div',
          { class: 'reel-face reel-front' },
          h('div', { class: `reel-media${photos ? '' : ' figure'}` }, media),
          h(
            'div',
            { class: 'reel-body' },
            h('h2', {}, ex.name),
            sets,
            h('div', { class: 'reel-timer' }, label, time),
            h(
              'div',
              { class: 'reel-quick' },
              nextChip(card, weight, (d) => (card.next.weightKg = stepWeight(card.next.weightKg, d)), ['Less weight', 'More weight']),
              nextChip(card, reps, (d) => (card.next.reps = stepReps(card.next.reps, d)), ['Fewer reps', 'More reps']),
            ),
            h('div', { class: 'reel-controls' }, stop, main, skip),
            h('div', { class: 'reel-hints' }, howTo, h('span', {}, next ? `Next: ${next.ex.name} ↑` : 'Swipe up to finish ↑')),
          ),
        ),
        h(
          'div',
          { class: 'reel-face reel-back', 'aria-hidden': 'true' },
          h('h3', {}, ex.name),
          h('p', { class: 'reel-muscles' }, [ex.primary, ...ex.secondary].map((m) => MUSCLE_LABELS[m]).join(' · ')),
          renderDemo(ex, { animate: false }),
          h('ol', { class: 'reel-steps' }, ...ex.steps.map((s) => h('li', {}, s))),
          h('p', { class: 'reel-tip' }, h('strong', {}, 'Tip. '), ex.tip),
          h('div', { class: 'reel-hints' }, back),
        ),
      ),
    );
    howTo.addEventListener('click', () => flip(page, 1));
    back.addEventListener('click', () => flip(page, 1));
    refs.set(card, { page, sets, label, time, weight, reps, main, stop, skip });
    return page;
  };

  const paintClock = (card: Card) => {
    const r = refs.get(card)!;
    r.time.textContent = card.mode === 'rest' ? clock(((card.restEndsAt ?? 0) - now()) / 1000) : clock(worked(card) / 1000);
  };
  const paint = (card: Card) => {
    const r = refs.get(card)!;
    const n = card.sets.length;
    r.page.dataset.mode = card.mode;
    const chips: HTMLElement[] = card.sets.map((s, k) =>
      h('button', { type: 'button', class: 'reel-set done', 'data-set': k, 'aria-label': `Edit set ${k + 1}: ${setText(card.ex, s)}` }, `Set ${k + 1} ✎`, h('b', {}, setText(card.ex, s))),
    );
    if (card.mode === 'run' || card.mode === 'pause') chips.push(h('div', { class: 'reel-set now' }, `Set ${n + 1}`, h('b', {}, setText(card.ex, card.next))));
    r.sets.replaceChildren(...(chips.length ? chips : [h('span', { class: 'reel-empty' }, 'No sets yet. Tap ▶ to start.')]));
    r.sets.scrollLeft = r.sets.scrollWidth;
    r.label.textContent = { idle: `Set ${n + 1} · ready`, run: `Set ${n + 1} · working`, pause: `Set ${n + 1} · paused`, rest: 'Rest' }[card.mode];
    paintClock(card);
    r.weight.textContent = weightText(card.ex, card.next.weightKg);
    r.reps.textContent = `${card.next.reps} reps`;
    r.main.replaceChildren(icon(card.mode === 'run' ? 'pause' : 'play'));
    r.main.setAttribute('aria-label', `${card.mode === 'run' ? 'Pause' : 'Start'} set of ${card.ex.name}`);
    r.stop.disabled = !(card.mode === 'run' || card.mode === 'pause');
    r.skip.disabled = card.mode !== 'rest';
    paintBars();
  };

  // ----- top bar -----
  const elapsed = h('span', { class: 'reel-elapsed', 'aria-label': 'Workout time' }, '00:00');
  const bars = h('span', { class: 'reel-bars', 'aria-hidden': 'true' }, ...cards.map(() => h('i', {})));
  const close = h('a', { href: '#/', class: 'reel-close', 'aria-label': 'Close workout (your sets are kept)' }, icon('close'));
  let current = 0;
  const paintBars = () => cards.forEach((c, k) => (bars.children[k].className = k === current ? 'now' : c.sets.length ? 'done' : ''));
  const paintElapsed = () => (elapsed.textContent = clock(workoutMs() / 1000));

  // ----- summary page -----
  const summaryList = h('ul', { class: 'reel-summary-list' });
  const summaryMeta = h('p', { class: 'reel-muscles' });
  const saveBtn = h('button', { type: 'button', class: 'reel-save' }, 'Save workout');
  const saveError = h('p', { class: 'error', role: 'alert' });
  const summary = h(
    'section',
    { class: 'reel-page reel-summary', 'aria-label': 'Finish workout' },
    h('h2', {}, day.name),
    summaryMeta,
    summaryList,
    h('a', { href: `#/log/${dayId}`, class: 'reel-list-link' }, 'Switch to list view'),
    saveError,
    saveBtn,
  );
  const paintSummary = () => {
    summaryList.replaceChildren(...cards.map((c) => h('li', {}, c.ex.name, h('span', {}, c.sets.length ? `${c.sets.length} ${c.sets.length === 1 ? 'set' : 'sets'}` : 'Skipped'))));
    const total = cards.reduce((n, c) => n + c.sets.length, 0);
    summaryMeta.textContent = `${total} ${total === 1 ? 'set' : 'sets'} logged`;
    saveBtn.disabled = total === 0;
  };
  saveBtn.addEventListener('click', async () => {
    const entries = draftToEntries(cards.map((c) => ({ exerciseId: c.ex.id, target: c.target, sets: c.sets })));
    if (!entries.length) return void (saveError.textContent = 'Log at least one set before saving.');
    saveBtn.disabled = true;
    const minutes = workoutMs() > 0 ? Math.round(clampNumber(workoutMs() / 60000, 0, 600, 0)) : restored?.durationMin ?? null;
    const log: WorkoutLog = {
      id: randomId(8),
      date: restored?.date && isISODate(restored.date) && restored.date <= ctx.today() ? restored.date : ctx.today(),
      dayId,
      entries,
      durationMin: minutes,
      notes: cleanText(restored?.notes ?? '', MAX_NOTES),
    };
    stopAll();
    await ctx.update((s) => s.workouts.push(log), { render: false });
    ctx.repo.setDraft(dayId, null);
    ctx.toast('Workout saved. Nice job!');
    ctx.navigate('/progress');
  });

  const feed = h('div', { class: 'reel-feed' }, ...cards.map(buildPage), summary);
  const root = h('main', { class: `reel${ctx.animate() ? '' : ' no-motion'}` }, h('div', { class: 'reel-top' }, close, elapsed, bars), feed, scrim, sheet);
  cards.forEach(paint);
  paintSummary();
  if (resumedAt !== null) persist();

  const pages = [...feed.children] as HTMLElement[];
  feed.addEventListener('scroll', () => {
    const k = Math.round(feed.scrollTop / Math.max(1, feed.clientHeight));
    if (k !== current) {
      current = Math.min(k, pages.length - 1);
      paintBars();
    }
  }, { passive: true });

  // A sideways swipe flips the page; up and down are left to the browser's scrolling.
  let start: { x: number; y: number } | null = null;
  feed.addEventListener('pointerdown', (ev) => (start = { x: ev.clientX, y: ev.clientY }));
  feed.addEventListener('pointercancel', () => (start = null));
  feed.addEventListener('pointerup', (ev) => {
    if (!start) return;
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;
    start = null;
    const page = (ev.target as Element).closest<HTMLElement>('.reel-page');
    if (page && !page.classList.contains('reel-summary') && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) flip(page, dx < 0 ? 1 : -1);
  });

  const onKey = (ev: KeyboardEvent) => {
    if (!root.isConnected) return stopAll();
    if (editing) {
      if (ev.key === 'Escape') closeSheet();
      return;
    }
    if ((ev.target as Element | null)?.closest?.('input, textarea, select')) return;
    const page = pages[current];
    if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && !page.classList.contains('reel-summary')) {
      ev.preventDefault();
      flip(page, ev.key === 'ArrowLeft' ? -1 : 1);
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const k = Math.max(0, Math.min(pages.length - 1, current + (ev.key === 'ArrowDown' ? 1 : -1)));
      pages[k].scrollIntoView?.({ behavior: ctx.animate() ? 'smooth' : 'auto' });
    }
  };
  document.addEventListener('keydown', onKey);

  // Keeps the screen on while the workout is open, where the browser allows it.
  type Lock = { release(): Promise<void> };
  const wakeLock = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<Lock> } }).wakeLock;
  let lock: Lock | null = null;
  const requestLock = () => wakeLock?.request('screen').then((l) => (lock = l), () => undefined);
  const onVisible = () => {
    if (document.visibilityState === 'visible') root.isConnected && requestLock();
    else if (view === latestView) persist(); // the browser may close a hidden page; keep the clock as it is now
  };
  requestLock();
  document.addEventListener('visibilitychange', onVisible);

  // Leaving workout mode (✕, another page, closing the tab) pauses the workout clock.
  const pause = () => {
    if (resumedAt === null) return;
    activeMs += now() - resumedAt;
    resumedAt = null;
    persist();
  };
  const onLeave = () => {
    if (!location.hash.startsWith(`#/workout/`)) stopAll();
  };
  const onPageShow = () => {
    if (root.isConnected && activeMs > 0 && resumedAt === null) resumedAt = now();
  };
  window.addEventListener('hashchange', onLeave);
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', onPageShow);

  const tick = setInterval(() => {
    if (!root.isConnected) return stopAll();
    paintElapsed();
    for (const c of cards) {
      if (c.mode === 'run' || c.mode === 'pause') paintClock(c);
      else if (c.mode === 'rest') {
        if ((c.restEndsAt ?? 0) <= now()) {
          c.mode = 'idle';
          c.restEndsAt = null;
          paint(c);
          if (c === cards[current]) {
            ctx.toast('Rest is over. Start your next set.');
            navigator.vibrate?.(200);
          }
        } else paintClock(c);
      }
    }
  }, 500);
  let stopped = false;
  function stopAll() {
    if (stopped) return;
    stopped = true;
    if (view === latestView) pause();
    clearInterval(tick);
    window.removeEventListener('hashchange', onLeave);
    window.removeEventListener('pagehide', pause);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release().catch(() => undefined);
    lock = null;
  }
  paintElapsed();
  return root;
}
