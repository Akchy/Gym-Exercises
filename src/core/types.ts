export const GOALS = [
  'gain-muscle',
  'gain-weight',
  'lose-weight',
  'lose-muscle',
  'gain-strength',
  'endurance',
  'general-fitness',
] as const;
export type Goal = (typeof GOALS)[number];

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'glutes',
  'calves',
  'core',
  'cardio',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT = ['bodyweight', 'dumbbell', 'barbell', 'machine', 'cable', 'kettlebell', 'band'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EXPERIENCE = ['beginner', 'intermediate', 'advanced'] as const;
export type Experience = (typeof EXPERIENCE)[number];

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very-active'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const PREFERRED_TIMES = ['morning', 'afternoon', 'evening', 'flexible'] as const;
export type PreferredTime = (typeof PREFERRED_TIMES)[number];

export const SEXES = ['male', 'female', 'unspecified'] as const;
export type Sex = (typeof SEXES)[number];

/** 0 = Monday ... 6 = Sunday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export interface Profile {
  name: string;
  experience: Experience;
  sex: Sex;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
}

export interface Routine {
  trainingDays: Weekday[];
  minutesPerSession: number;
  preferredTime: PreferredTime;
  activityLevel: ActivityLevel;
  equipment: Equipment[];
}

export interface PlannedExercise {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
}

export interface PlanDay {
  id: string;
  name: string;
  weekday: Weekday | null;
  muscleGroups: MuscleGroup[];
  exercises: PlannedExercise[];
  cardioMinutes: number;
}

export interface LoggedSet {
  reps: number;
  weightKg: number;
}

export interface LoggedExercise {
  exerciseId: string;
  sets: LoggedSet[];
}

export interface WorkoutLog {
  id: string;
  date: string; // YYYY-MM-DD
  dayId: string | null;
  entries: LoggedExercise[];
  durationMin: number | null;
  notes: string;
}

export interface BodyLog {
  date: string;
  weightKg: number;
}

export interface Settings {
  units: 'kg' | 'lb';
  animations: boolean;
  autoLockMinutes: number;
}

export interface AppState {
  version: 1;
  createdAt: string;
  onboarded: boolean;
  goal: Goal;
  profile: Profile;
  routine: Routine;
  plan: PlanDay[];
  workouts: WorkoutLog[];
  bodyLogs: BodyLog[];
  settings: Settings;
}
