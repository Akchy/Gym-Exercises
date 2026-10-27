import type { ActivityLevel, Equipment, Experience, MuscleGroup, PreferredTime } from '../core/types';

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  legs: 'Legs', glutes: 'Glutes', calves: 'Calves', core: 'Core / Abs', cardio: 'Cardio',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  bodyweight: 'Bodyweight only', dumbbell: 'Dumbbells', barbell: 'Barbell & rack', machine: 'Gym machines',
  cable: 'Cable station', kettlebell: 'Kettlebell', band: 'Resistance bands',
};

export const EXPERIENCE_LABELS: Record<Experience, string> = {
  beginner: 'Beginner (new or returning)', intermediate: 'Intermediate (6+ months)', advanced: 'Advanced (2+ years)',
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Mostly sitting (desk job, little walking)',
  light: 'Lightly active (some walking)',
  moderate: 'Moderately active (on my feet a lot)',
  active: 'Active (physical job)',
  'very-active': 'Very active (heavy physical work)',
};

export const TIME_LABELS: Record<PreferredTime, string> = {
  morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', flexible: 'It varies',
};
