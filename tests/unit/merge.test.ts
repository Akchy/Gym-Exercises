import { describe, expect, it } from 'vitest';
import { mergeVersions } from '../../src/core/merge';
import type { AppState, WorkoutLog } from '../../src/core/types';
import { onboardedState } from './helpers';

const workout = (id: string, date = '2026-10-20'): WorkoutLog => ({
  id,
  date,
  dayId: null,
  entries: [{ exerciseId: 'push-up', sets: [{ reps: 10, weightKg: 0 }] }],
  durationMin: null,
  notes: '',
});

function version(updatedAt: string, edit: (s: AppState) => void) {
  const state = onboardedState();
  edit(state);
  return { state, updatedAt };
}

describe('mergeVersions', () => {
  it('keeps workouts logged on either device', () => {
    const phone = version('2026-10-27T10:00:00Z', (s) => (s.workouts = [workout('a'), workout('phone', '2026-10-27')]));
    const pc = version('2026-10-27T11:00:00Z', (s) => (s.workouts = [workout('a'), workout('pc', '2026-10-26')]));
    expect(mergeVersions(phone, pc).workouts.map((w) => w.id)).toEqual(['a', 'pc', 'phone']);
  });

  it('does not bring back a workout deleted on either device', () => {
    const kept = version('2026-10-27T10:00:00Z', (s) => (s.workouts = [workout('a'), workout('b')]));
    const deleted = version('2026-10-27T09:00:00Z', (s) => {
      s.workouts = [workout('b')];
      s.deletedWorkoutIds = ['a'];
    });
    const merged = mergeVersions(kept, deleted);
    expect(merged.workouts.map((w) => w.id)).toEqual(['b']);
    expect(merged.deletedWorkoutIds).toEqual(['a']);
  });

  it('uses the newer copy of a workout edited on both devices', () => {
    const older = version('2026-10-27T09:00:00Z', (s) => (s.workouts = [{ ...workout('a'), notes: 'old' }]));
    const newer = version('2026-10-27T10:00:00Z', (s) => (s.workouts = [{ ...workout('a'), notes: 'new' }]));
    expect(mergeVersions(older, newer).workouts[0].notes).toBe('new');
    expect(mergeVersions(newer, older).workouts[0].notes).toBe('new');
  });

  it('combines body-weight entries by date (newer wins on the same date) and updates the profile weight', () => {
    const older = version('2026-10-27T09:00:00Z', (s) => (s.bodyLogs = [{ date: '2026-10-01', weightKg: 80 }, { date: '2026-10-03', weightKg: 79 }]));
    const newer = version('2026-10-27T10:00:00Z', (s) => (s.bodyLogs = [{ date: '2026-10-01', weightKg: 81 }, { date: '2026-10-02', weightKg: 80.5 }]));
    const merged = mergeVersions(older, newer);
    expect(merged.bodyLogs).toEqual([
      { date: '2026-10-01', weightKg: 81 },
      { date: '2026-10-02', weightKg: 80.5 },
      { date: '2026-10-03', weightKg: 79 },
    ]);
    expect(merged.profile.weightKg).toBe(79);
  });

  it('takes plan and settings from the newer copy', () => {
    const older = version('2026-10-27T09:00:00Z', (s) => (s.settings.units = 'lb'));
    const newer = version('2026-10-27T10:00:00Z', (s) => {
      s.goal = 'endurance';
      s.plan = s.plan.slice(0, 1);
    });
    const merged = mergeVersions(older, newer);
    expect(merged.settings.units).toBe('kg');
    expect(merged.goal).toBe('endurance');
    expect(merged.plan).toHaveLength(1);
  });
});
