import { describe, expect, it } from 'vitest';
import {
  entryVolume,
  estimateOneRepMax,
  exerciseSeries,
  loggedExerciseIds,
  muscleGroupCounts,
  personalRecords,
  totalReps,
  weekStreak,
  weightChange,
  workoutVolume,
  workoutsInWeek,
} from '../../src/core/progress';
import type { WorkoutLog } from '../../src/core/types';

const w = (id: string, date: string, entries: WorkoutLog['entries']): WorkoutLog => ({ id, date, dayId: null, entries, durationMin: null, notes: '' });

const workouts: WorkoutLog[] = [
  w('a', '2026-10-05', [{ exerciseId: 'dumbbell-bench-press', sets: [{ reps: 10, weightKg: 20 }, { reps: 8, weightKg: 22 }] }]),
  w('b', '2026-10-12', [{ exerciseId: 'dumbbell-bench-press', sets: [{ reps: 5, weightKg: 26 }] }, { exerciseId: 'push-up', sets: [{ reps: 20, weightKg: 0 }] }]),
  w('c', '2026-10-26', [{ exerciseId: 'push-up', sets: [{ reps: 25, weightKg: 0 }, { reps: 0, weightKg: 0 }] }, { exerciseId: 'plank', sets: [] }]),
];

describe('volume and reps', () => {
  it('estimates one-rep max (Epley)', () => {
    expect(estimateOneRepMax({ reps: 1, weightKg: 100 })).toBe(100);
    expect(estimateOneRepMax({ reps: 10, weightKg: 60 })).toBe(80);
    expect(estimateOneRepMax({ reps: 0, weightKg: 60 })).toBe(0);
    expect(estimateOneRepMax({ reps: 10, weightKg: 0 })).toBe(0);
  });
  it('sums volume and reps', () => {
    expect(entryVolume(workouts[0].entries[0])).toBe(376);
    expect(workoutVolume(workouts[1])).toBe(130);
    expect(totalReps(workouts[1])).toBe(25);
  });
});

describe('personalRecords', () => {
  it('tracks best weight, reps and 1RM per exercise', () => {
    const prs = personalRecords(workouts);
    const bench = prs.find((p) => p.exerciseId === 'dumbbell-bench-press')!;
    expect(bench.bestWeightKg).toBe(26);
    expect(bench.bestReps).toBe(10);
    expect(bench.bestOneRepMax).toBeCloseTo(30.33, 1);
    expect(bench.date).toBe('2026-10-12');
    const push = prs.find((p) => p.exerciseId === 'push-up')!;
    expect(push.bestReps).toBe(25);
    expect(push.date).toBe('2026-10-26');
    expect(prs.find((p) => p.exerciseId === 'plank')).toBeUndefined();
    expect(prs[0].date >= prs[prs.length - 1].date).toBe(true);
  });
});

describe('exerciseSeries', () => {
  it('uses estimated 1RM for weighted exercises', () => {
    expect(exerciseSeries(workouts, 'dumbbell-bench-press')).toEqual([
      { date: '2026-10-05', value: 27.9 },
      { date: '2026-10-12', value: 30.3 },
    ]);
  });
  it('uses best reps for bodyweight exercises', () => {
    expect(exerciseSeries(workouts, 'push-up')).toEqual([
      { date: '2026-10-12', value: 20 },
      { date: '2026-10-26', value: 25 },
    ]);
  });
  it('lists exercises that have logged sets', () => {
    expect(loggedExerciseIds(workouts).sort()).toEqual(['dumbbell-bench-press', 'push-up']);
  });
});

describe('weekly stats', () => {
  it('counts workouts this week (Mon-Sun)', () => {
    expect(workoutsInWeek(workouts, '2026-10-27')).toBe(1);
    expect(workoutsInWeek(workouts, '2026-10-18')).toBe(1);
    expect(workoutsInWeek(workouts, '2026-10-21')).toBe(0);
  });
  it('computes week streaks', () => {
    expect(weekStreak(workouts, '2026-10-27')).toBe(1); // week of 19th is empty
    expect(weekStreak(workouts, '2026-10-14')).toBe(2);
    expect(weekStreak(workouts, '2026-10-20')).toBe(2); // this week empty -> count from last week
    expect(weekStreak([], '2026-10-20')).toBe(0);
  });
  it('counts sets per muscle group in a window', () => {
    expect(muscleGroupCounts(workouts, '2026-10-27')).toEqual({ chest: 5 });
    expect(muscleGroupCounts(workouts, '2026-10-27', 7)).toEqual({ chest: 1 }); // 0-rep sets are ignored
    expect(muscleGroupCounts(workouts, '2026-10-01')).toEqual({});
  });
});

describe('weightChange', () => {
  it('compares first and latest entries', () => {
    expect(weightChange([{ date: '2026-10-10', weightKg: 79.4 }, { date: '2026-10-01', weightKg: 80 }])).toEqual({
      first: { date: '2026-10-01', weightKg: 80 },
      latest: { date: '2026-10-10', weightKg: 79.4 },
      changeKg: -0.6,
    });
    expect(weightChange([])).toBeNull();
  });
});
