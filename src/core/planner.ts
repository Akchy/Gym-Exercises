/**
 * Turns a goal + daily routine into a weekly plan of training days and exercises.
 * Everything produced here is a suggestion: the user can edit every field afterwards.
 */
import { EXERCISES, getExercise, isAvailable, type Exercise } from '../data/exercises';
import { randomId } from './encoding';
import {
  EXPERIENCE,
  MUSCLE_GROUPS,
  type ActivityLevel,
  type Experience,
  type Goal,
  type MuscleGroup,
  type PlanDay,
  type PlannedExercise,
  type Profile,
  type Routine,
  type Weekday,
} from './types';

export interface GoalProfile {
  label: string;
  description: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
  cardioMinutes: number;
  focus: MuscleGroup[];
  tips: string[];
}

export const GOAL_PROFILES: Record<Goal, GoalProfile> = {
  'gain-muscle': {
    label: 'Build muscle',
    description: 'Grow muscle size with moderate weights and 8–12 reps.',
    sets: 3, repsMin: 8, repsMax: 12, restSec: 90, cardioMinutes: 0,
    focus: ['chest', 'back', 'legs', 'shoulders', 'biceps', 'triceps'],
    tips: [
      'Add a little weight or a rep each week (progressive overload).',
      'Eat enough protein and sleep 7–9 hours; muscle grows during recovery.',
    ],
  },
  'gain-weight': {
    label: 'Gain weight',
    description: 'Put on healthy body weight with heavy compound lifts and a calorie surplus.',
    sets: 4, repsMin: 6, repsMax: 10, restSec: 120, cardioMinutes: 0,
    focus: ['legs', 'back', 'chest', 'glutes', 'shoulders'],
    tips: [
      'Eat in a small calorie surplus every day; training alone will not add weight.',
      'Prioritise big lifts (squat, press, row) that use lots of muscle.',
    ],
  },
  'lose-weight': {
    label: 'Lose weight / fat',
    description: 'Burn fat with full-body circuits, short rests and cardio while keeping muscle.',
    sets: 3, repsMin: 12, repsMax: 15, restSec: 45, cardioMinutes: 20,
    focus: ['legs', 'back', 'chest', 'cardio', 'core'],
    tips: [
      'A moderate calorie deficit does most of the work; training keeps muscle on.',
      'Aim for 8,000–10,000 steps a day on top of your workouts.',
    ],
  },
  'lose-muscle': {
    label: 'Slim down / reduce bulk',
    description: 'Lean out and reduce muscle size: light weights, high reps, more cardio.',
    sets: 2, repsMin: 15, repsMax: 20, restSec: 30, cardioMinutes: 30,
    focus: ['cardio', 'core', 'legs'],
    tips: [
      'Lower training volume and avoid lifting to failure.',
      'Favour endurance cardio (running, cycling, rowing) over heavy lifting.',
    ],
  },
  'gain-strength': {
    label: 'Get stronger (without bulking)',
    description: 'Lift heavier with low reps and long rests, keeping muscle growth minimal.',
    sets: 5, repsMin: 3, repsMax: 5, restSec: 180, cardioMinutes: 0,
    focus: ['legs', 'back', 'chest', 'shoulders', 'core'],
    tips: [
      'Keep calories around maintenance so strength rises without much size.',
      'Few exercises, heavy and crisp: stop each set 1–2 reps short of failure.',
    ],
  },
  endurance: {
    label: 'Improve stamina',
    description: 'Build endurance with circuits, high reps and steady cardio.',
    sets: 2, repsMin: 15, repsMax: 25, restSec: 30, cardioMinutes: 25,
    focus: ['cardio', 'legs', 'core'],
    tips: ['Increase cardio time by about 10% per week.', 'Mix steady sessions with short intervals.'],
  },
  'general-fitness': {
    label: 'Stay fit & healthy',
    description: 'A balanced routine for overall health, strength and mobility.',
    sets: 3, repsMin: 10, repsMax: 12, restSec: 60, cardioMinutes: 15,
    focus: ['legs', 'back', 'chest', 'core', 'cardio'],
    tips: ['Consistency beats intensity: a workout you enjoy is one you will repeat.'],
  },
};

interface DayTemplate {
  name: string;
  muscleGroups: MuscleGroup[];
  cardioOnly?: boolean;
}

const FULL: DayTemplate = { name: 'Full Body', muscleGroups: ['legs', 'chest', 'back', 'shoulders', 'core'] };
const FULL_B: DayTemplate = { name: 'Full Body B', muscleGroups: ['glutes', 'back', 'chest', 'biceps', 'triceps', 'core'] };
const UPPER: DayTemplate = { name: 'Upper Body', muscleGroups: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] };
const LOWER: DayTemplate = { name: 'Lower Body', muscleGroups: ['legs', 'glutes', 'calves', 'core'] };
const PUSH: DayTemplate = { name: 'Push (Chest, Shoulders, Triceps)', muscleGroups: ['chest', 'shoulders', 'triceps'] };
const PULL: DayTemplate = { name: 'Pull (Back, Biceps)', muscleGroups: ['back', 'biceps', 'core'] };
const LEGS: DayTemplate = { name: 'Legs', muscleGroups: ['legs', 'glutes', 'calves', 'core'] };
const CIRCUIT: DayTemplate = { name: 'Full-Body Circuit', muscleGroups: ['legs', 'chest', 'back', 'core', 'cardio'] };
const CARDIO: DayTemplate = { name: 'Cardio & Core', muscleGroups: ['cardio', 'core'], cardioOnly: true };
const RECOVERY: DayTemplate = { name: 'Active Recovery', muscleGroups: ['cardio', 'core'], cardioOnly: true };

const CONDITIONING_GOALS: Goal[] = ['lose-weight', 'lose-muscle', 'endurance'];

export function chooseSplit(days: number, goal: Goal, experience: Experience): DayTemplate[] {
  const n = Math.max(1, Math.min(7, Math.round(days)));
  if (CONDITIONING_GOALS.includes(goal)) {
    const pattern = [CIRCUIT, CARDIO, { ...CIRCUIT, name: 'Full-Body Circuit B', muscleGroups: FULL_B.muscleGroups.concat('cardio') }, CARDIO];
    return Array.from({ length: n }, (_, i) => (n <= 2 ? [CIRCUIT, { ...CIRCUIT, name: 'Full-Body Circuit B' }][i] : pattern[i % pattern.length]));
  }
  const splits: Record<number, DayTemplate[]> = {
    1: [FULL],
    2: [FULL, FULL_B],
    3: experience === 'beginner' || goal === 'gain-strength' || goal === 'general-fitness' ? [FULL, FULL_B, FULL] : [PUSH, PULL, LEGS],
    4: [UPPER, LOWER, UPPER, LOWER],
    5: [PUSH, PULL, LEGS, UPPER, LOWER],
    6: [PUSH, PULL, LEGS, PUSH, PULL, LEGS],
    7: [PUSH, PULL, LEGS, RECOVERY, UPPER, LOWER, RECOVERY],
  };
  if (goal === 'general-fitness' && n >= 4) splits[n] = splits[n].map((d, i) => (i % 3 === 2 ? CARDIO : d));
  return splits[n];
}

function levelRank(level: Experience): number {
  return EXPERIENCE.indexOf(level);
}

export function prescription(goal: Goal, experience: Experience, ex: Exercise): Omit<PlannedExercise, 'exerciseId'> {
  const g = GOAL_PROFILES[goal];
  let sets = g.sets + (experience === 'beginner' ? -1 : experience === 'advanced' ? 1 : 0);
  sets = Math.max(2, Math.min(6, sets));
  if (ex.primary === 'cardio' || ex.primary === 'core' || ex.primary === 'calves') {
    return { sets: Math.min(sets, 3), repsMin: 15, repsMax: 30, restSec: 30 };
  }
  if (goal === 'gain-strength' && !ex.compound) {
    // Accessory work stays light so it does not add bulk.
    return { sets: 2, repsMin: 8, repsMax: 12, restSec: 90 };
  }
  return { sets, repsMin: g.repsMin, repsMax: g.repsMax, restSec: g.restSec };
}

/** Minutes one exercise takes: each set ~45 s of work plus the rest period. */
export function minutesPerExercise(p: Pick<PlannedExercise, 'sets' | 'restSec'>): number {
  return (p.sets * (45 + p.restSec)) / 60;
}

export function exerciseCount(minutes: number, goal: Goal, experience: Experience, cardioOnly = false): number {
  const g = GOAL_PROFILES[goal];
  const warmup = 8;
  const cardio = cardioOnly ? 0 : g.cardioMinutes;
  const per = minutesPerExercise({ sets: Math.max(2, g.sets + (experience === 'beginner' ? -1 : 0)), restSec: g.restSec });
  const count = Math.floor((minutes - warmup - cardio) / per);
  return Math.max(cardioOnly ? 3 : 2, Math.min(cardioOnly ? 5 : 8, count));
}

export function candidatesFor(group: MuscleGroup, equipment: Routine['equipment'], experience: Experience): Exercise[] {
  const available = EXERCISES.filter((x) => x.primary === group && isAvailable(x, equipment));
  const suitable = available.filter((x) => levelRank(x.level) <= levelRank(experience));
  const pool = suitable.length ? suitable : available;
  // Compound movements first: they give the most benefit per minute.
  return [...pool].sort((a, b) => Number(b.compound) - Number(a.compound));
}

const SECONDARY: readonly MuscleGroup[] = ['core', 'cardio'];

/** Candidates for one group; "legs" also draws on glutes and calves unless those were ticked themselves. */
function poolFor(group: MuscleGroup, groups: readonly MuscleGroup[], equipment: Routine['equipment'], experience: Experience): Exercise[] {
  const family = group === 'legs' ? (['glutes', 'calves'] as const).filter((g) => !groups.includes(g)) : [];
  const pool = [group, ...family].flatMap((g) => candidatesFor(g, equipment, experience));
  return pool.sort((a, b) => Number(b.compound) - Number(a.compound));
}

type Chooser = (pool: Exercise[], round: number, used: ReadonlySet<string>) => Exercise | undefined;

/**
 * Fills a day: the main (non-cardio/core) groups take the slots round-robin, then one core
 * exercise, then one cardio exercise only if there is room (the day has its own cardio minutes).
 * Group order is normalised, so the order muscles were ticked in doesn't matter.
 */
function selectFor(
  groups: readonly MuscleGroup[],
  count: number,
  equipment: Routine['equipment'],
  experience: Experience,
  choose: Chooser,
  seed: Exercise[] = [],
): Exercise[] {
  const sorted = MUSCLE_GROUPS.filter((g) => groups.includes(g));
  const primary = sorted.filter((g) => !SECONDARY.includes(g));
  const pools = (gs: readonly MuscleGroup[]) => gs.map((g) => poolFor(g, sorted, equipment, experience));
  const chosen = [...seed];
  const used = new Set(seed.map((x) => x.id));
  const fill = (from: Exercise[][], upTo: number) => {
    for (let round = 0; chosen.length < upTo; round++) {
      let added = false;
      for (const pool of from) {
        if (chosen.length >= upTo) break;
        const pick = choose(pool, round, used);
        if (!pick) continue;
        used.add(pick.id);
        chosen.push(pick);
        added = true;
      }
      if (!added) break;
    }
  };
  if (!primary.length) {
    fill(pools(sorted), count);
    return chosen;
  }
  const secondary = sorted.filter((g) => SECONDARY.includes(g));
  const reserve = (sorted.includes('core') ? 1 : 0) + (sorted.includes('cardio') && count >= 6 ? 1 : 0);
  const target = Math.min(count, Math.max(1, count - reserve));
  fill(pools(primary), target);
  const short = chosen.length < target;
  for (const g of secondary) fill(pools([g]), Math.min(count, chosen.length + 1));
  // Only when the main groups ran out of exercises do core/cardio fill the gap.
  if (short) fill(pools(secondary), count);
  return chosen;
}

export function pickExercises(
  groups: MuscleGroup[],
  count: number,
  routine: Pick<Routine, 'equipment'>,
  experience: Experience,
  variant = 0,
): Exercise[] {
  return selectFor(groups, count, routine.equipment, experience, (pool, round, used) => {
    const remaining = pool.filter((x) => !used.has(x.id));
    return remaining.length ? remaining[(variant + round) % remaining.length] : undefined;
  });
}

export const DEFAULT_TRAINING_DAYS: Weekday[] = [0, 2, 4];

export function generatePlan(goal: Goal, routine: Routine, profile: Pick<Profile, 'experience'>): PlanDay[] {
  const weekdays = [...new Set(routine.trainingDays.length ? routine.trainingDays : DEFAULT_TRAINING_DAYS)].sort(
    (a, b) => a - b,
  );
  const split = chooseSplit(weekdays.length, goal, profile.experience);
  const seen = new Map<string, number>();
  return split.map((tpl, i) => {
    const variant = seen.get(tpl.name) ?? 0;
    seen.set(tpl.name, variant + 1);
    const count = exerciseCount(routine.minutesPerSession, goal, profile.experience, tpl.cardioOnly);
    const exercises = pickExercises(tpl.muscleGroups, count, routine, profile.experience, variant).map((ex) => ({
      exerciseId: ex.id,
      ...prescription(goal, profile.experience, ex),
    }));
    return {
      id: randomId(8),
      name: tpl.name,
      weekday: weekdays[i],
      muscleGroups: [...tpl.muscleGroups],
      exercises,
      cardioMinutes: tpl.cardioOnly ? Math.max(15, GOAL_PROFILES[goal].cardioMinutes) : GOAL_PROFILES[goal].cardioMinutes,
    };
  });
}

/** Rebuilds the exercise list of a single day after the user changed its muscle groups. */
export function refillDay(day: PlanDay, goal: Goal, routine: Routine, experience: Experience): PlanDay {
  const count = exerciseCount(routine.minutesPerSession, goal, experience, day.muscleGroups.every((g) => g === 'cardio' || g === 'core'));
  const exercises = pickExercises(day.muscleGroups, count, routine, experience).map((ex) => ({
    exerciseId: ex.id,
    ...prescription(goal, experience, ex),
  }));
  return { ...day, exercises };
}

/**
 * Swaps a day's exercises for a fresh set (same muscles, same count). The first main compound
 * lift stays put with the user's sets/reps/rest; every other slot moves on to the exercises after
 * the current ones in each pool, so repeated presses walk through the whole pool before repeating.
 */
export function reshuffleDay(day: PlanDay, goal: Goal, routine: Pick<Routine, 'equipment'>, experience: Experience): PlanDay {
  const current = new Set(day.exercises.map((pe) => pe.exerciseId));
  const secondaryOnly = day.muscleGroups.every((g) => SECONDARY.includes(g));
  const anchorAt = secondaryOnly
    ? -1
    : day.exercises.findIndex((pe) => {
        const ex = getExercise(pe.exerciseId);
        return !!ex?.compound && !SECONDARY.includes(ex.primary) && (day.muscleGroups.includes(ex.primary) || (day.muscleGroups.includes('legs') && (ex.primary === 'glutes' || ex.primary === 'calves')));
      });
  const anchor = anchorAt >= 0 ? getExercise(day.exercises[anchorAt].exerciseId) : undefined;
  const picked = selectFor(day.muscleGroups, day.exercises.length, routine.equipment, experience, (pool, _round, used) => {
    // Start right after the last current exercise of this pool; skip current ones while possible.
    const start = pool.reduce((at, x, i) => (current.has(x.id) ? i + 1 : at), 0);
    const order = pool.map((_, i) => pool[(start + i) % pool.length]).filter((x) => !used.has(x.id));
    return order.find((x) => !current.has(x.id)) ?? order[0];
  }, anchor ? [anchor] : []);
  const exercises = picked.slice(anchor ? 1 : 0).map((ex) => ({ exerciseId: ex.id, ...prescription(goal, experience, ex) }));
  if (anchor) exercises.splice(anchorAt, 0, day.exercises[anchorAt]);
  return { ...day, exercises };
}

export function routineAdvice(goal: Goal, routine: Routine): string[] {
  const tips = [...GOAL_PROFILES[goal].tips];
  const days = routine.trainingDays.length;
  if (routine.activityLevel === 'sedentary') {
    tips.push('You sit a lot during the day: take a 5-minute walk every hour and aim for more daily steps.');
  }
  if (routine.minutesPerSession < 30) {
    tips.push('Short on time? Pair exercises back-to-back (supersets) to fit more into each session.');
  }
  if (days >= 6) tips.push('Training 6+ days: keep at least one easy day and listen to your body.');
  if (days <= 2) tips.push('With 1–2 days per week, full-body sessions give you the most results.');
  if (routine.preferredTime === 'morning') tips.push('Morning sessions: spend a few extra minutes warming up.');
  if (routine.preferredTime === 'evening') tips.push('Evening sessions: finish at least 1–2 hours before bed for better sleep.');
  return tips;
}

export interface FocusSuggestion {
  group: MuscleGroup;
  reason: string;
}

export function suggestFocus(goal: Goal): FocusSuggestion[] {
  const reasons: Partial<Record<MuscleGroup, string>> = {
    legs: 'Biggest muscles in the body: most calories burned and most strength gained.',
    back: 'Improves posture and balances pressing work.',
    chest: 'Key upper-body pushing strength.',
    shoulders: 'Overhead strength and wider-looking upper body.',
    biceps: 'Arm size and pulling strength.',
    triceps: 'Two-thirds of upper-arm size; helps every press.',
    glutes: 'Powerful hips protect the lower back.',
    core: 'Stability for every other lift and everyday life.',
    cardio: 'Heart health, stamina and extra calorie burn.',
    calves: 'Ankle stability and lower-leg shape.',
  };
  return GOAL_PROFILES[goal].focus.map((group) => ({ group, reason: reasons[group] ?? '' }));
}

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  'very-active': 1.9,
};

const CALORIE_ADJUST: Record<Goal, number> = {
  'gain-muscle': 0.1,
  'gain-weight': 0.15,
  'lose-weight': -0.2,
  'lose-muscle': -0.1,
  'gain-strength': 0,
  endurance: 0,
  'general-fitness': 0,
};

const PROTEIN_G_PER_KG: Record<Goal, number> = {
  'gain-muscle': 1.8,
  'gain-weight': 1.8,
  'lose-weight': 2.0,
  'lose-muscle': 1.4,
  'gain-strength': 1.8,
  endurance: 1.4,
  'general-fitness': 1.2,
};

export interface CalorieEstimate {
  bmr: number;
  maintenance: number;
  target: number;
  proteinG: number;
}

/** Mifflin–St Jeor estimate. Returns null if the user chose not to share age/height/weight. */
export function estimateCalories(profile: Profile, activity: ActivityLevel, goal: Goal): CalorieEstimate | null {
  const { age, heightCm, weightKg, sex } = profile;
  if (!age || !heightCm || !weightKg) return null;
  const sexOffset = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset;
  const maintenance = bmr * ACTIVITY_FACTORS[activity];
  return {
    bmr: Math.round(bmr),
    maintenance: Math.round(maintenance),
    target: Math.round(maintenance * (1 + CALORIE_ADJUST[goal])),
    proteinG: Math.round(weightKg * PROTEIN_G_PER_KG[goal]),
  };
}
