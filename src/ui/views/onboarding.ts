import { GOAL_PROFILES, estimateCalories, generatePlan, refillDay, routineAdvice, suggestFocus } from '../../core/planner';
import { clampNumber, cleanText, MAX_NAME } from '../../core/state';
import {
  ACTIVITY_LEVELS,
  EQUIPMENT,
  EXPERIENCE,
  GOALS,
  MUSCLE_GROUPS,
  PREFERRED_TIMES,
  WEEKDAY_NAMES,
  type AppState,
  type PlanDay,
  type Weekday,
} from '../../core/types';
import { fromDisplayWeight, round, toDisplayWeight } from '../../core/units';
import { getExercise } from '../../data/exercises';
import type { ViewContext } from '../context';
import { choiceGroup, clear, field, h } from '../dom';
import { ACTIVITY_LABELS, EQUIPMENT_LABELS, EXPERIENCE_LABELS, MUSCLE_LABELS, TIME_LABELS } from '../labels';

type Draft = Pick<AppState, 'goal' | 'profile' | 'routine'> & { plan: PlanDay[] };

const STEPS = ['Your goal', 'Your routine', 'About you (optional)', 'Your plan'] as const;
const ABOUT_STEP = 2;
const PLAN_STEP = 3;

export function renderOnboarding(ctx: ViewContext): HTMLElement {
  const units = ctx.state.settings.units;
  const draft: Draft = structuredClone({
    goal: ctx.state.goal,
    profile: ctx.state.profile,
    routine: ctx.state.routine,
    plan: [],
  });
  let step = 0;
  let customising = false;
  const body = h('div', { class: 'wizard-body' });
  const progress = h('ol', { class: 'steps', 'aria-label': 'Setup progress' });
  const root = h('main', { class: 'container' }, h('h1', {}, ctx.state.onboarded ? 'Update goal & routine' : "Let's set you up"), progress, body);

  function goalStep(): HTMLElement {
    return h(
      'section',
      {},
      h('h2', {}, 'What do you want to achieve?'),
      choiceGroup({
        name: 'goal',
        legend: 'Goal',
        layout: 'cards',
        options: GOALS.map((g) => [g, GOAL_PROFILES[g].label, GOAL_PROFILES[g].description] as const),
        value: draft.goal,
        onChange: (v) => (draft.goal = v),
      }),
    );
  }

  function routineStep(): HTMLElement {
    const days = h('div', { class: 'chips', role: 'group', 'aria-label': 'Training days' });
    WEEKDAY_NAMES.forEach((name, i) => {
      const cb = h('input', { type: 'checkbox', id: `day-${i}`, class: 'visually-hidden', checked: draft.routine.trainingDays.includes(i as Weekday) });
      cb.addEventListener('change', () => {
        const set = new Set(draft.routine.trainingDays);
        if (cb.checked) set.add(i as Weekday);
        else set.delete(i as Weekday);
        draft.routine.trainingDays = [...set].sort((a, b) => a - b);
      });
      days.appendChild(h('label', { class: 'chip', for: `day-${i}` }, cb, name.slice(0, 3)));
    });
    const equipment = h('div', { class: 'chips', role: 'group', 'aria-label': 'Equipment' });
    for (const eq of EQUIPMENT) {
      const cb = h('input', { type: 'checkbox', id: `eq-${eq}`, class: 'visually-hidden', checked: draft.routine.equipment.includes(eq), disabled: eq === 'bodyweight' });
      cb.addEventListener('change', () => {
        const set = new Set(draft.routine.equipment);
        if (cb.checked) set.add(eq);
        else set.delete(eq);
        draft.routine.equipment = [...set];
      });
      equipment.appendChild(h('label', { class: 'chip', for: `eq-${eq}` }, cb, EQUIPMENT_LABELS[eq]));
    }
    return h(
      'section',
      {},
      h('h2', {}, 'What does your week look like?'),
      h('fieldset', {}, h('legend', {}, 'Which days can you train?'), days),
      choiceGroup({
        name: 'minutes',
        legend: 'How long can each session be?',
        options: [20, 30, 45, 60, 75, 90, 120].map((m) => [String(m), `${m} min`] as const),
        value: String(draft.routine.minutesPerSession),
        onChange: (v) => (draft.routine.minutesPerSession = Number(v)),
      }),
      choiceGroup({
        name: 'time',
        legend: 'When do you usually train?',
        options: PREFERRED_TIMES.map((t) => [t, TIME_LABELS[t]] as const),
        value: draft.routine.preferredTime,
        onChange: (v) => (draft.routine.preferredTime = v),
      }),
      choiceGroup({
        name: 'activity',
        legend: 'How active is the rest of your day?',
        layout: 'cards',
        options: ACTIVITY_LEVELS.map((a) => [a, ACTIVITY_LABELS[a]] as const),
        value: draft.routine.activityLevel,
        onChange: (v) => (draft.routine.activityLevel = v),
      }),
      choiceGroup({
        name: 'experience',
        legend: 'How experienced are you with training?',
        layout: 'cards',
        options: EXPERIENCE.map((x) => [x, EXPERIENCE_LABELS[x]] as const),
        value: draft.profile.experience,
        onChange: (v) => (draft.profile.experience = v),
      }),
      h('fieldset', {}, h('legend', {}, 'What equipment do you have access to?'), equipment),
    );
  }

  function aboutStep(): HTMLElement {
    const p = draft.profile;
    const name = h('input', { type: 'text', id: 'name', maxlength: MAX_NAME, value: p.name, autocomplete: 'nickname' });
    name.addEventListener('change', () => (p.name = cleanText(name.value, MAX_NAME)));
    const num = (id: string, value: number | null, min: number, max: number, onSet: (v: number | null) => void) => {
      const input = h('input', { type: 'number', id, min, max, step: 'any', inputmode: 'decimal', value: value ?? '' });
      input.addEventListener('change', () => onSet(input.value === '' ? null : clampNumber(input.value, min, max, min)));
      return input;
    };
    return h(
      'section',
      {},
      h('h2', {}, 'A little about you'),
      h(
        'p',
        { class: 'card note' },
        h('strong', {}, 'This step is optional: you can skip it. '),
        'Everything here is encrypted on your device. Age, sex, height and weight are only used to estimate your daily calories.',
      ),
      field('Nickname', name),
      choiceGroup({
        name: 'sex',
        legend: 'Sex (for the calorie estimate)',
        options: [
          ['unspecified', 'Prefer not to say'],
          ['female', 'Female'],
          ['male', 'Male'],
        ],
        value: p.sex,
        onChange: (v) => (p.sex = v),
      }),
      h(
        'div',
        { class: 'grid-3' },
        field('Age', num('age', p.age, 13, 110, (v) => (p.age = v === null ? null : Math.round(v)))),
        field('Height (cm)', num('height', p.heightCm, 100, 250, (v) => (p.heightCm = v))),
        field(
          `Body weight (${units})`,
          num('weight', p.weightKg === null ? null : toDisplayWeight(p.weightKg, units), 20, units === 'kg' ? 400 : 880, (v) =>
            (p.weightKg = v === null ? null : round(fromDisplayWeight(v, units), 2))),
        ),
      ),
    );
  }

  function planStep(): HTMLElement {
    if (!draft.plan.length) draft.plan = generatePlan(draft.goal, draft.routine, draft.profile);
    const focus = suggestFocus(draft.goal);
    const calories = estimateCalories(draft.profile, draft.routine.activityLevel, draft.goal);
    const days = h('div', { class: 'stack' });
    const renderDays = () => {
      clear(days);
      draft.plan.forEach((day, di) => {
        let chips: HTMLElement | null = null;
        if (customising) {
          chips = h('div', { class: 'chips', role: 'group', 'aria-label': `${day.name} muscle groups` });
          for (const g of MUSCLE_GROUPS) {
            const id = `pd-${di}-${g}`;
            const cb = h('input', { type: 'checkbox', id, class: 'visually-hidden', checked: day.muscleGroups.includes(g) });
            cb.addEventListener('change', () => {
              const groups = cb.checked ? [...day.muscleGroups, g] : day.muscleGroups.filter((x) => x !== g);
              draft.plan[di] = refillDay({ ...day, muscleGroups: groups }, draft.goal, draft.routine, draft.profile.experience);
              renderDays();
            });
            chips.appendChild(h('label', { class: 'chip small', for: id }, cb, MUSCLE_LABELS[g]));
          }
        }
        days.appendChild(
          h(
            'article',
            { class: 'card' },
            h('h3', {}, `${day.weekday === null ? 'Any day' : WEEKDAY_NAMES[day.weekday]}: ${day.name}`),
            chips ?? h('p', { class: 'muted' }, day.muscleGroups.map((g) => MUSCLE_LABELS[g]).join(' · ')),
            h('p', {}, day.exercises.map((e) => getExercise(e.exerciseId)?.name).join(', '), day.cardioMinutes ? ` + ${day.cardioMinutes} min cardio` : ''),
          ),
        );
      });
    };
    renderDays();
    const customise = h('button', { type: 'button', class: 'link', 'aria-pressed': String(customising) }, customising ? 'Done customising' : 'Customise muscle groups');
    customise.addEventListener('click', () => {
      customising = !customising;
      render();
    });
    return h(
      'section',
      {},
      h('h2', {}, `Suggested plan: ${GOAL_PROFILES[draft.goal].label}`),
      h('p', {}, 'Focus on: ', focus.map((f) => MUSCLE_LABELS[f.group]).join(', '), '.'),
      h('ul', { class: 'tips' }, ...routineAdvice(draft.goal, draft.routine).map((t) => h('li', {}, t))),
      calories
        ? h('p', { class: 'card note' }, `Estimated daily energy: about ${calories.target} kcal and ${calories.proteinG} g protein (maintenance ≈ ${calories.maintenance} kcal). This is an estimate, not medical advice.`)
        : null,
      days,
      customise,
    );
  }

  const builders = [goalStep, routineStep, aboutStep, planStep];

  async function save(next: HTMLButtonElement) {
    next.disabled = true;
    await ctx.update((s) => {
      s.goal = draft.goal;
      s.profile = draft.profile;
      s.routine = draft.routine;
      s.plan = draft.plan;
      s.onboarded = true;
      if (draft.profile.weightKg && !s.bodyLogs.some((b) => b.date === ctx.today())) {
        s.bodyLogs.push({ date: ctx.today(), weightKg: draft.profile.weightKg });
      }
    }, { render: false });
    ctx.toast('Your plan is saved.');
    ctx.navigate('/');
  }

  function render() {
    clear(progress);
    STEPS.forEach((s, i) => progress.appendChild(h('li', { class: i === step ? 'current' : i < step ? 'done' : '', 'aria-current': i === step ? 'step' : null }, s)));
    clear(body);
    const back = h('button', { type: 'button', class: 'secondary', disabled: step === 0 }, 'Back');
    back.addEventListener('click', () => {
      if (step === PLAN_STEP) {
        draft.plan = [];
        customising = false;
      }
      step--;
      render();
    });
    const last = step === STEPS.length - 1;
    const next = h('button', { type: 'button', class: 'primary' }, last ? 'Save my plan' : 'Next');
    const error = h('p', { class: 'error', role: 'alert' });
    next.addEventListener('click', async () => {
      if (step === 1 && draft.routine.trainingDays.length === 0) {
        error.textContent = 'Pick at least one training day.';
        return;
      }
      if (last) return save(next);
      step++;
      render();
    });
    let skip: HTMLButtonElement | null = null;
    if (step === ABOUT_STEP) {
      skip = h('button', { type: 'button', class: 'link' }, 'Skip this step');
      skip.addEventListener('click', () => {
        step++;
        render();
      });
    }
    body.append(builders[step](), error, h('div', { class: 'actions' }, back, next, skip));
  }
  render();
  return root;
}
