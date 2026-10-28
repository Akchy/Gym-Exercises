import { describe, expect, it } from 'vitest';
import {
  GOAL_PROFILES,
  candidatesFor,
  chooseSplit,
  estimateCalories,
  exerciseCount,
  generatePlan,
  minutesPerExercise,
  pickExercises,
  prescription,
  refillDay,
  reshuffleDay,
  routineAdvice,
  suggestFocus,
} from '../../src/core/planner';
import { GOALS, type PlanDay, type Routine, type Profile } from '../../src/core/types';
import { getExercise, isAvailable } from '../../src/data/exercises';

const routine: Routine = {
  trainingDays: [0, 2, 4],
  minutesPerSession: 60,
  preferredTime: 'flexible',
  activityLevel: 'moderate',
  equipment: ['bodyweight', 'dumbbell'],
};

const profile: Profile = { name: '', experience: 'intermediate', sex: 'male', age: 30, heightCm: 180, weightKg: 80 };

describe('GOAL_PROFILES', () => {
  it('covers every goal with sensible rep ranges', () => {
    for (const g of GOALS) {
      const p = GOAL_PROFILES[g];
      expect(p.repsMin).toBeLessThanOrEqual(p.repsMax);
      expect(p.sets).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });
  it('makes strength low-rep and slimming high-rep', () => {
    expect(GOAL_PROFILES['gain-strength'].repsMax).toBeLessThanOrEqual(5);
    expect(GOAL_PROFILES['lose-muscle'].repsMin).toBeGreaterThanOrEqual(15);
    expect(GOAL_PROFILES['lose-weight'].cardioMinutes).toBeGreaterThan(0);
  });
});

describe('chooseSplit', () => {
  it('returns one day per training day (clamped 1-7)', () => {
    for (let n = 1; n <= 7; n++) expect(chooseSplit(n, 'gain-muscle', 'intermediate')).toHaveLength(n);
    expect(chooseSplit(0, 'gain-muscle', 'beginner')).toHaveLength(1);
    expect(chooseSplit(10, 'gain-muscle', 'beginner')).toHaveLength(7);
  });
  it('uses full body for beginners on 3 days and PPL for intermediates', () => {
    expect(chooseSplit(3, 'gain-muscle', 'beginner').every((d) => d.name.startsWith('Full Body'))).toBe(true);
    expect(chooseSplit(3, 'gain-muscle', 'intermediate').map((d) => d.name)).toEqual([
      'Push (Chest, Shoulders, Triceps)', 'Pull (Back, Biceps)', 'Legs',
    ]);
  });
  it('uses circuits and cardio for fat loss / endurance goals', () => {
    const split = chooseSplit(4, 'lose-weight', 'beginner');
    expect(split.some((d) => d.cardioOnly)).toBe(true);
    expect(split.every((d) => d.muscleGroups.includes('cardio'))).toBe(true);
    expect(chooseSplit(2, 'endurance', 'beginner').map((d) => d.name)).toEqual(['Full-Body Circuit', 'Full-Body Circuit B']);
  });
  it('mixes cardio into general fitness with 4+ days', () => {
    expect(chooseSplit(6, 'general-fitness', 'intermediate').filter((d) => d.cardioOnly)).toHaveLength(2);
  });
});

describe('prescription', () => {
  const bench = getExercise('dumbbell-bench-press')!;
  it('follows the goal', () => {
    expect(prescription('gain-muscle', 'intermediate', bench)).toEqual({ sets: 3, repsMin: 8, repsMax: 12, restSec: 90 });
    expect(prescription('gain-strength', 'intermediate', bench)).toMatchObject({ repsMin: 3, repsMax: 5, restSec: 180 });
  });
  it('adjusts sets by experience', () => {
    expect(prescription('gain-muscle', 'beginner', bench).sets).toBe(2);
    expect(prescription('gain-muscle', 'advanced', bench).sets).toBe(4);
  });
  it('uses high reps for core/cardio and light accessories for strength', () => {
    expect(prescription('gain-strength', 'advanced', getExercise('plank')!)).toMatchObject({ repsMin: 15, restSec: 30 });
    expect(prescription('gain-strength', 'intermediate', getExercise('lateral-raise')!)).toEqual({ sets: 2, repsMin: 8, repsMax: 12, restSec: 90 });
  });
});

describe('time budgeting', () => {
  it('computes minutes per exercise', () => {
    expect(minutesPerExercise({ sets: 3, restSec: 75 })).toBe(6);
  });
  it('fits more exercises into longer sessions, within bounds', () => {
    const short = exerciseCount(20, 'gain-muscle', 'intermediate');
    const long = exerciseCount(90, 'gain-muscle', 'intermediate');
    expect(short).toBe(2);
    expect(long).toBeGreaterThan(short);
    expect(exerciseCount(500, 'gain-muscle', 'intermediate')).toBe(8);
    expect(exerciseCount(10, 'endurance', 'beginner', true)).toBe(3);
  });
});

describe('exercise selection', () => {
  it('only offers exercises the user has equipment for', () => {
    for (const ex of candidatesFor('chest', ['bodyweight'], 'advanced')) expect(isAvailable(ex, ['bodyweight'])).toBe(true);
  });
  it('prefers compound movements and respects experience', () => {
    const c = candidatesFor('back', ['bodyweight', 'dumbbell', 'barbell', 'machine', 'cable'], 'beginner');
    expect(c[0].compound).toBe(true);
    expect(c.every((x) => x.level === 'beginner')).toBe(true);
  });
  it('falls back to harder exercises when nothing suitable exists', () => {
    // Only advanced/intermediate pulling options without equipment
    expect(candidatesFor('back', ['bodyweight'], 'beginner').length).toBeGreaterThan(0);
  });
  it('picks unique exercises across groups, up to the count', () => {
    const picked = pickExercises(['chest', 'back', 'legs'], 5, routine, 'intermediate');
    expect(picked).toHaveLength(5);
    expect(new Set(picked.map((p) => p.id)).size).toBe(5);
    expect(picked.slice(0, 3).map((p) => p.primary)).toEqual(['chest', 'back', 'legs']);
  });
  it('stops when groups run out of exercises', () => {
    expect(pickExercises(['calves'], 8, { equipment: ['bodyweight'] }, 'beginner')).toHaveLength(1);
    expect(pickExercises([], 4, routine, 'beginner')).toEqual([]);
  });
  it('varies picks between variants', () => {
    const a = pickExercises(['chest'], 1, { equipment: ['bodyweight', 'dumbbell', 'barbell', 'machine'] }, 'advanced', 0);
    const b = pickExercises(['chest'], 1, { equipment: ['bodyweight', 'dumbbell', 'barbell', 'machine'] }, 'advanced', 1);
    expect(a[0].id).not.toBe(b[0].id);
  });
});

describe('generatePlan', () => {
  it('creates one day per training weekday with valid exercises', () => {
    const plan = generatePlan('gain-muscle', routine, profile);
    expect(plan.map((d) => d.weekday)).toEqual([0, 2, 4]);
    for (const d of plan) {
      expect(d.id).toMatch(/^[0-9a-f]{16}$/);
      expect(d.exercises.length).toBeGreaterThanOrEqual(2);
      for (const pe of d.exercises) expect(isAvailable(getExercise(pe.exerciseId)!, routine.equipment)).toBe(true);
    }
  });
  it('defaults to 3 days when none are chosen and dedupes days', () => {
    expect(generatePlan('gain-muscle', { ...routine, trainingDays: [] }, profile)).toHaveLength(3);
    expect(generatePlan('gain-muscle', { ...routine, trainingDays: [4, 1, 1] }, profile).map((d) => d.weekday)).toEqual([1, 4]);
  });
  it('adds cardio for weight loss', () => {
    const plan = generatePlan('lose-weight', routine, profile);
    expect(plan.every((d) => d.cardioMinutes >= 15)).toBe(true);
  });
  it('works for every goal and day count', () => {
    for (const g of GOALS) {
      for (let n = 1; n <= 7; n++) {
        const days = Array.from({ length: n }, (_, i) => i) as Routine['trainingDays'];
        const plan = generatePlan(g, { ...routine, trainingDays: days }, profile);
        expect(plan).toHaveLength(n);
        expect(plan.every((d) => d.exercises.length > 0)).toBe(true);
      }
    }
  });
});

describe('refillDay', () => {
  it('rebuilds exercises from the chosen muscle groups', () => {
    const [day] = generatePlan('gain-muscle', routine, profile);
    const refilled = refillDay({ ...day, muscleGroups: ['biceps'] }, 'gain-muscle', routine, 'intermediate');
    expect(refilled.id).toBe(day.id);
    expect(refilled.exercises.every((e) => getExercise(e.exerciseId)!.primary === 'biceps')).toBe(true);
  });
  it('treats cardio/core-only days as cardio days', () => {
    const [day] = generatePlan('gain-muscle', routine, profile);
    const r = refillDay({ ...day, muscleGroups: ['cardio'] }, 'gain-muscle', routine, 'beginner');
    expect(r.exercises.length).toBeGreaterThanOrEqual(3);
  });
});

describe('primary-group weighting', () => {
  const gym: Routine = { ...routine, equipment: ['bodyweight', 'dumbbell', 'barbell', 'machine', 'kettlebell'] };
  it('lets legs dominate a cardio + core + legs day', () => {
    const picked = pickExercises(['cardio', 'core', 'legs'], 5, gym, 'intermediate').map((x) => x.primary);
    expect(picked).toHaveLength(5);
    expect(picked.filter((g) => g === 'core')).toHaveLength(1);
    expect(picked.filter((g) => g === 'cardio')).toHaveLength(0);
    expect(picked.filter((g) => ['legs', 'glutes', 'calves'].includes(g)).length).toBe(4);
  });
  it('adds one cardio exercise only on long days', () => {
    const picked = pickExercises(['cardio', 'core', 'chest', 'back'], 7, gym, 'intermediate').map((x) => x.primary);
    expect(picked.filter((g) => g === 'cardio')).toHaveLength(1);
    expect(picked.filter((g) => g === 'core')).toHaveLength(1);
  });
  it('ignores the order the groups were ticked in', () => {
    const ids = (gs: Parameters<typeof pickExercises>[0]) => pickExercises(gs, 6, gym, 'intermediate').map((x) => x.id);
    expect(ids(['legs', 'core', 'cardio', 'chest'])).toEqual(ids(['cardio', 'chest', 'core', 'legs']));
  });
  it('keeps cardio/core-only days as before', () => {
    const picked = pickExercises(['cardio', 'core'], 4, gym, 'intermediate').map((x) => x.primary);
    expect(picked).toEqual(['core', 'cardio', 'core', 'cardio']);
  });
  it('draws glutes and calves into a legs day', () => {
    const picked = pickExercises(['legs'], 5, { equipment: ['bodyweight'] }, 'intermediate').map((x) => x.primary);
    expect(picked).toContain('glutes');
    expect(picked).toContain('calves');
    expect(picked[0]).toBe('legs');
  });
});

describe('reshuffleDay', () => {
  const gym: Routine = { ...routine, equipment: ['bodyweight', 'dumbbell', 'barbell', 'machine', 'kettlebell'] };
  const legDay = (): PlanDay => {
    const day = generatePlan('gain-muscle', { ...gym, trainingDays: [0, 2, 4] }, { experience: 'intermediate' })[2];
    expect(day.name).toBe('Legs');
    day.exercises[0] = { ...day.exercises[0], sets: 7, repsMin: 4, repsMax: 6, restSec: 200 };
    return day;
  };
  const ids = (d: PlanDay) => d.exercises.map((e) => e.exerciseId);
  it('keeps the anchor lift with its numbers and swaps the rest', () => {
    const day = legDay();
    const next = reshuffleDay(day, 'gain-muscle', gym, 'intermediate');
    expect(next.id).toBe(day.id);
    expect(next.muscleGroups).toEqual(day.muscleGroups);
    expect(next.exercises).toHaveLength(day.exercises.length);
    expect(next.exercises[0]).toEqual(day.exercises[0]);
    const before = new Set(ids(day));
    const fresh = ids(next).slice(1).filter((id) => !before.has(id));
    expect(fresh.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids(next)).size).toBe(next.exercises.length);
  });
  it('produces a different set on every press until the pool cycles', () => {
    let day = legDay();
    const seen = [ids(day).join()];
    for (let i = 0; i < 3; i++) {
      day = reshuffleDay(day, 'gain-muscle', gym, 'intermediate');
      expect(seen).not.toContain(ids(day).join());
      seen.push(ids(day).join());
    }
  });
  it('anchors on the first main compound lift, not core or cardio', () => {
    const day: PlanDay = {
      id: 'd', name: 'Mix', weekday: null, muscleGroups: ['core', 'legs'], cardioMinutes: 0,
      exercises: ['mountain-climber', 'leg-extension', 'goblet-squat', 'lunge'].map((exerciseId) => ({ exerciseId, sets: 3, repsMin: 10, repsMax: 12, restSec: 60 })),
    };
    const next = reshuffleDay(day, 'general-fitness', gym, 'intermediate');
    expect(next.exercises[2]).toEqual(day.exercises[2]);
    expect(next.exercises).toHaveLength(4);
  });
  it('leaves empty days alone', () => {
    const day: PlanDay = { id: 'd', name: 'x', weekday: null, muscleGroups: ['legs'], exercises: [], cardioMinutes: 0 };
    expect(reshuffleDay(day, 'gain-muscle', gym, 'beginner').exercises).toEqual([]);
  });
});

describe('advice and focus', () => {
  it('tailors advice to the routine', () => {
    const tips = routineAdvice('lose-weight', { ...routine, activityLevel: 'sedentary', minutesPerSession: 20, preferredTime: 'morning', trainingDays: [0] });
    expect(tips.join(' ')).toMatch(/sit a lot/);
    expect(tips.join(' ')).toMatch(/supersets/);
    expect(tips.join(' ')).toMatch(/warming up/);
    expect(tips.join(' ')).toMatch(/full-body/);
    const many = routineAdvice('gain-muscle', { ...routine, preferredTime: 'evening', trainingDays: [0, 1, 2, 3, 4, 5] });
    expect(many.join(' ')).toMatch(/easy day/);
    expect(many.join(' ')).toMatch(/before bed/);
  });
  it('suggests focus groups with reasons', () => {
    const f = suggestFocus('lose-muscle');
    expect(f.map((x) => x.group)).toEqual(['cardio', 'core', 'legs']);
    expect(f.every((x) => x.reason.length > 0)).toBe(true);
  });
});

describe('estimateCalories', () => {
  it('uses Mifflin-St Jeor', () => {
    const e = estimateCalories(profile, 'sedentary', 'general-fitness')!;
    expect(e.bmr).toBe(1780); // 800 + 1125 - 150 + 5
    expect(e.maintenance).toBe(2136);
    expect(e.target).toBe(2136);
    expect(e.proteinG).toBe(96);
  });
  it('applies goal adjustments and sex offsets', () => {
    const female = { ...profile, sex: 'female' as const };
    expect(estimateCalories(female, 'sedentary', 'general-fitness')!.bmr).toBe(1614);
    expect(estimateCalories({ ...profile, sex: 'unspecified' }, 'sedentary', 'general-fitness')!.bmr).toBe(1697);
    const cut = estimateCalories(profile, 'moderate', 'lose-weight')!;
    expect(cut.target).toBeLessThan(cut.maintenance);
    const bulk = estimateCalories(profile, 'moderate', 'gain-weight')!;
    expect(bulk.target).toBeGreaterThan(bulk.maintenance);
  });
  it('returns null without age/height/weight', () => {
    expect(estimateCalories({ ...profile, age: null }, 'light', 'gain-muscle')).toBeNull();
  });
});
