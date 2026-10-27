/**
 * Default state + strict validation. Everything loaded from storage or imported from a
 * backup goes through sanitizeState(), so malformed or tampered data cannot inject
 * unexpected shapes into the app.
 */
import { getExercise } from '../data/exercises';
import { isISODate } from './dates';
import {
  ACTIVITY_LEVELS,
  EQUIPMENT,
  EXPERIENCE,
  GOALS,
  MUSCLE_GROUPS,
  PREFERRED_TIMES,
  SEXES,
  type AppState,
  type BodyLog,
  type LoggedExercise,
  type PlanDay,
  type PlannedExercise,
  type Weekday,
  type WorkoutLog,
} from './types';

export const MAX_NAME = 60;
export const MAX_NOTES = 1000;
export const MAX_WORKOUTS = 5000;

export function createDefaultState(now = new Date()): AppState {
  return {
    version: 1,
    createdAt: now.toISOString(),
    onboarded: false,
    goal: 'general-fitness',
    profile: { name: '', experience: 'beginner', sex: 'unspecified', age: null, heightCm: null, weightKg: null },
    routine: {
      trainingDays: [0, 2, 4],
      minutesPerSession: 45,
      preferredTime: 'flexible',
      activityLevel: 'light',
      equipment: ['bodyweight', 'dumbbell'],
    },
    plan: [],
    workouts: [],
    bodyLogs: [],
    settings: { units: 'kg', animations: true },
  };
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

function oneOf<T extends string>(allowed: readonly T[], v: unknown, fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function optionalNumber(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = clampNumber(v, min, max, NaN);
  return Number.isNaN(n) ? null : n;
}

export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // Strip control characters; text is always rendered via textContent, never as HTML.
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
}

function cleanId(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

function uniqueList<T extends string>(allowed: readonly T[], v: unknown): T[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is T => allowed.includes(x as T)))] : [];
}

function weekdays(v: unknown): Weekday[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is Weekday => Number.isInteger(x) && x >= 0 && x <= 6))].sort((a, b) => a - b);
}

function plannedExercise(v: unknown): PlannedExercise | null {
  if (!isObj(v) || typeof v.exerciseId !== 'string' || !getExercise(v.exerciseId)) return null;
  const repsMin = Math.round(clampNumber(v.repsMin, 1, 100, 8));
  return {
    exerciseId: v.exerciseId,
    sets: Math.round(clampNumber(v.sets, 1, 10, 3)),
    repsMin,
    repsMax: Math.max(repsMin, Math.round(clampNumber(v.repsMax, 1, 100, 12))),
    restSec: Math.round(clampNumber(v.restSec, 0, 600, 60)),
  };
}

function planDay(v: unknown): PlanDay | null {
  if (!isObj(v)) return null;
  const id = cleanId(v.id);
  if (!id) return null;
  const wd = v.weekday;
  return {
    id,
    name: cleanText(v.name, MAX_NAME) || 'Workout',
    weekday: Number.isInteger(wd) && (wd as number) >= 0 && (wd as number) <= 6 ? (wd as Weekday) : null,
    muscleGroups: uniqueList(MUSCLE_GROUPS, v.muscleGroups),
    exercises: (Array.isArray(v.exercises) ? v.exercises : [])
      .slice(0, 30)
      .map(plannedExercise)
      .filter((x): x is PlannedExercise => x !== null),
    cardioMinutes: Math.round(clampNumber(v.cardioMinutes, 0, 180, 0)),
  };
}

function loggedExercise(v: unknown): LoggedExercise | null {
  if (!isObj(v) || typeof v.exerciseId !== 'string' || !getExercise(v.exerciseId)) return null;
  const sets = (Array.isArray(v.sets) ? v.sets : [])
    .slice(0, 20)
    .filter(isObj)
    .map((s) => ({
      reps: Math.round(clampNumber(s.reps, 0, 1000, 0)),
      weightKg: clampNumber(s.weightKg, 0, 1000, 0),
    }));
  return { exerciseId: v.exerciseId, sets };
}

export function workoutLog(v: unknown): WorkoutLog | null {
  if (!isObj(v)) return null;
  const id = cleanId(v.id);
  if (!id || !isISODate(v.date)) return null;
  return {
    id,
    date: v.date,
    dayId: cleanId(v.dayId),
    entries: (Array.isArray(v.entries) ? v.entries : [])
      .slice(0, 40)
      .map(loggedExercise)
      .filter((x): x is LoggedExercise => x !== null),
    durationMin: optionalNumber(v.durationMin, 0, 600),
    notes: cleanText(v.notes, MAX_NOTES),
  };
}

function bodyLog(v: unknown): BodyLog | null {
  if (!isObj(v) || !isISODate(v.date)) return null;
  // Out-of-range measurements are dropped rather than clamped into a false value.
  const w = typeof v.weightKg === 'number' && Number.isFinite(v.weightKg) ? v.weightKg : NaN;
  return w >= 20 && w <= 400 ? { date: v.date, weightKg: w } : null;
}

/** Validates arbitrary input into a well-formed AppState (unknown fields are dropped). */
export function sanitizeState(input: unknown): AppState {
  if (!isObj(input)) throw new Error('Invalid data: expected an object');
  if (input.version !== 1) throw new Error('Unsupported data version');
  const d = createDefaultState();
  const profile = isObj(input.profile) ? input.profile : {};
  const routine = isObj(input.routine) ? input.routine : {};
  const settings = isObj(input.settings) ? input.settings : {};
  const equipment = uniqueList(EQUIPMENT, routine.equipment);
  const bodyLogsByDate = new Map<string, BodyLog>();
  for (const b of (Array.isArray(input.bodyLogs) ? input.bodyLogs : []).map(bodyLog)) {
    if (b) bodyLogsByDate.set(b.date, b);
  }
  return {
    version: 1,
    createdAt: typeof input.createdAt === 'string' && !Number.isNaN(Date.parse(input.createdAt)) ? input.createdAt : d.createdAt,
    onboarded: input.onboarded === true,
    goal: oneOf(GOALS, input.goal, d.goal),
    profile: {
      name: cleanText(profile.name, MAX_NAME),
      experience: oneOf(EXPERIENCE, profile.experience, d.profile.experience),
      sex: oneOf(SEXES, profile.sex, 'unspecified'),
      age: optionalNumber(profile.age, 13, 110),
      heightCm: optionalNumber(profile.heightCm, 100, 250),
      weightKg: optionalNumber(profile.weightKg, 20, 400),
    },
    routine: {
      trainingDays: weekdays(routine.trainingDays),
      minutesPerSession: Math.round(clampNumber(routine.minutesPerSession, 10, 180, d.routine.minutesPerSession)),
      preferredTime: oneOf(PREFERRED_TIMES, routine.preferredTime, d.routine.preferredTime),
      activityLevel: oneOf(ACTIVITY_LEVELS, routine.activityLevel, d.routine.activityLevel),
      equipment: equipment.includes('bodyweight') ? equipment : ['bodyweight', ...equipment],
    },
    plan: (Array.isArray(input.plan) ? input.plan : []).slice(0, 14).map(planDay).filter((x): x is PlanDay => x !== null),
    workouts: (Array.isArray(input.workouts) ? input.workouts : [])
      .slice(-MAX_WORKOUTS)
      .map(workoutLog)
      .filter((x): x is WorkoutLog => x !== null),
    bodyLogs: [...bodyLogsByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    settings: {
      units: oneOf(['kg', 'lb'] as const, settings.units, 'kg'),
      animations: settings.animations !== false,
    },
  };
}
