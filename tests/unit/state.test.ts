import { describe, expect, it } from 'vitest';
import { clampNumber, cleanText, createDefaultState, sanitizeState, workoutLog } from '../../src/core/state';

describe('createDefaultState', () => {
  it('creates a valid, not-yet-onboarded state', () => {
    const s = createDefaultState(new Date('2026-01-01T00:00:00Z'));
    expect(s.onboarded).toBe(false);
    expect(s.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(sanitizeState(s)).toEqual(s);
  });
});

describe('helpers', () => {
  it('clamps numbers', () => {
    expect(clampNumber(5, 0, 3, 1)).toBe(3);
    expect(clampNumber('2', 0, 3, 1)).toBe(2);
    expect(clampNumber('', 0, 3, 1)).toBe(1);
    expect(clampNumber('abc', 0, 3, 1)).toBe(1);
    expect(clampNumber(Infinity, 0, 3, 1)).toBe(1);
  });
  it('cleans text', () => {
    expect(cleanText('a\u0000b\u0007c', 10)).toBe('abc');
    expect(cleanText('line\nbreak', 20)).toBe('line\nbreak');
    expect(cleanText('abcdef', 3)).toBe('abc');
    expect(cleanText(42, 3)).toBe('');
  });
});

describe('sanitizeState', () => {
  it('rejects non-objects and unknown versions', () => {
    expect(() => sanitizeState(null)).toThrow('expected an object');
    expect(() => sanitizeState([])).toThrow('expected an object');
    expect(() => sanitizeState({ version: 2 })).toThrow('Unsupported');
  });

  it('fills defaults for missing sections', () => {
    const s = sanitizeState({ version: 1 });
    expect(s.goal).toBe('general-fitness');
    expect(s.routine.equipment).toContain('bodyweight');
    expect(s.settings.units).toBe('kg');
    expect(s.plan).toEqual([]);
  });

  it('drops invalid enum values, clamps numbers and strips unknown fields', () => {
    const s = sanitizeState({
      version: 1,
      goal: 'become-a-wizard',
      evil: '<script>',
      profile: { name: 'A'.repeat(200), experience: 'god', sex: 'x', age: 5, heightCm: '180', weightKg: 9999 },
      routine: { trainingDays: [0, 0, 9, 3, 'x'], minutesPerSession: 5000, equipment: ['barbell', 'laser'], activityLevel: 'zzz' },
      settings: { units: 'stone', animations: false, autoLockMinutes: 0 },
    });
    expect(s).not.toHaveProperty('evil');
    expect(s.goal).toBe('general-fitness');
    expect(s.profile.name).toHaveLength(60);
    expect(s.profile.experience).toBe('beginner');
    expect(s.profile.sex).toBe('unspecified');
    expect(s.profile.age).toBe(13);
    expect(s.profile.heightCm).toBe(180);
    expect(s.profile.weightKg).toBe(400);
    expect(s.routine.trainingDays).toEqual([0, 3]);
    expect(s.routine.minutesPerSession).toBe(180);
    expect(s.routine.equipment).toEqual(['bodyweight', 'barbell']);
    expect(s.routine.activityLevel).toBe('light');
    // Old backups may still carry autoLockMinutes; it is dropped now that there is no lock.
    expect(s.settings).toEqual({ units: 'kg', animations: false });
  });

  it('validates plan days and exercises', () => {
    const s = sanitizeState({
      version: 1,
      plan: [
        { id: 'd1', name: '', weekday: 9, muscleGroups: ['chest', 'chest', 'wings'], cardioMinutes: 10,
          exercises: [{ exerciseId: 'push-up', sets: 50, repsMin: 12, repsMax: 8, restSec: -1 }, { exerciseId: 'unknown' }] },
        { id: 'bad id!', name: 'x' },
        'garbage',
      ],
    });
    expect(s.plan).toHaveLength(1);
    expect(s.plan[0]).toMatchObject({ name: 'Workout', weekday: null, muscleGroups: ['chest'], cardioMinutes: 10 });
    expect(s.plan[0].exercises).toEqual([{ exerciseId: 'push-up', sets: 10, repsMin: 12, repsMax: 12, restSec: 0 }]);
  });

  it('validates workouts and dedupes body logs by date', () => {
    const s = sanitizeState({
      version: 1,
      workouts: [
        { id: 'w1', date: '2026-10-01', dayId: null, entries: [{ exerciseId: 'push-up', sets: [{ reps: 10, weightKg: 0 }, 'x'] }], notes: 'good', durationMin: 45 },
        { id: 'w2', date: 'yesterday', entries: [] },
      ],
      bodyLogs: [
        { date: '2026-10-02', weightKg: 80 },
        { date: '2026-10-01', weightKg: 81 },
        { date: '2026-10-02', weightKg: 79.5 },
        { date: '2026-10-03', weightKg: 5 },
      ],
    });
    expect(s.workouts).toHaveLength(1);
    expect(s.workouts[0].entries[0].sets).toEqual([{ reps: 10, weightKg: 0 }]);
    expect(s.bodyLogs).toEqual([{ date: '2026-10-01', weightKg: 81 }, { date: '2026-10-02', weightKg: 79.5 }]);
  });

  it('workoutLog rejects invalid input', () => {
    expect(workoutLog(null)).toBeNull();
    expect(workoutLog({ id: 'a', date: '2026-13-01' })).toBeNull();
    expect(workoutLog({ id: 'a', date: '2026-01-01' })).toMatchObject({ entries: [], durationMin: null, notes: '', dayId: null });
  });

  it('falls back to default createdAt when invalid', () => {
    expect(Number.isNaN(Date.parse(sanitizeState({ version: 1, createdAt: 'nope' }).createdAt))).toBe(false);
  });
});
