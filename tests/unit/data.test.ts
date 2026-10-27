import { describe, expect, it } from 'vitest';
import { EXERCISES, filterExercises, getExercise, isAvailable } from '../../src/data/exercises';
import { MOTIONS, getMotion, type Pose } from '../../src/data/motions';
import { EQUIPMENT, MUSCLE_GROUPS } from '../../src/core/types';

describe('exercise library', () => {
  it('has unique, URL-safe ids', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('has complete, valid entries', () => {
    for (const ex of EXERCISES) {
      expect(MUSCLE_GROUPS).toContain(ex.primary);
      for (const g of ex.secondary) expect(MUSCLE_GROUPS).toContain(g);
      expect(ex.equipment.length).toBeGreaterThan(0);
      for (const eq of ex.equipment) expect(EQUIPMENT).toContain(eq);
      expect(MOTIONS).toHaveProperty(ex.motion);
      expect(ex.steps.length).toBeGreaterThanOrEqual(2);
      expect(ex.tip.length).toBeGreaterThan(0);
    }
  });

  it('covers every muscle group with at least one bodyweight option', () => {
    for (const g of MUSCLE_GROUPS) {
      expect(EXERCISES.some((e) => e.primary === g && e.equipment.includes('bodyweight'))).toBe(true);
    }
  });

  it('looks up by id', () => {
    expect(getExercise('push-up')?.name).toBe('Push-up');
    expect(getExercise('nope')).toBeUndefined();
  });

  it('checks equipment availability (bodyweight always available)', () => {
    expect(isAvailable(getExercise('push-up')!, [])).toBe(true);
    expect(isAvailable(getExercise('bench-press')!, ['dumbbell'])).toBe(false);
    expect(isAvailable(getExercise('bench-press')!, ['barbell'])).toBe(true);
  });

  it('filters by muscle (primary or secondary), equipment and search query', () => {
    expect(filterExercises({ muscle: 'triceps' }).some((e) => e.id === 'bench-press')).toBe(true);
    expect(filterExercises({ muscle: 'all' })).toHaveLength(EXERCISES.length);
    expect(filterExercises({ equipment: ['bodyweight'] }).every((e) => isAvailable(e, ['bodyweight']))).toBe(true);
    expect(filterExercises({ query: '  SQUAT ' }).every((e) => e.name.toLowerCase().includes('squat'))).toBe(true);
    expect(filterExercises({ query: 'cardio' }).length).toBeGreaterThan(0);
    expect(filterExercises({ query: 'zzzz' })).toEqual([]);
  });
});

describe('motions', () => {
  const inBounds = (p: Pose) => Object.values(p).every(([x, y]) => x >= 0 && x <= 200 && y >= 0 && y <= 200);
  it('keeps every pose inside the 200x200 canvas', () => {
    for (const [id, m] of Object.entries(MOTIONS)) {
      expect(inBounds(m.a), `${id}.a`).toBe(true);
      expect(inBounds(m.b), `${id}.b`).toBe(true);
      expect(m.durationSec).toBeGreaterThan(0);
    }
  });
  it('defines the same optional limbs in both poses', () => {
    for (const [id, m] of Object.entries(MOTIONS)) {
      for (const k of ['el2', 'ha2', 'kn2', 'ft2'] as const) expect(k in m.a, `${id}.${k}`).toBe(k in m.b);
    }
  });
  it('actually moves between poses', () => {
    for (const [id, m] of Object.entries(MOTIONS)) expect(JSON.stringify(m.a), id).not.toBe(JSON.stringify(m.b));
  });
  it('getMotion returns the motion', () => {
    expect(getMotion('squat')).toBe(MOTIONS.squat);
  });
});
