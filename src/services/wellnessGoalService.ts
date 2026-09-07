import type { HealthGoal } from '../types';

export type WellnessGoalDefinition = { id: string; label: HealthGoal };

// Canonical goals already approved by the HealthGoal domain. IDs are stable analytics keys.
export const WELLNESS_GOALS: readonly WellnessGoalDefinition[] = [
  { id: 'sugar_control', label: 'Sugar Control' },
  { id: 'weight_loss', label: 'Weight Loss' },
  { id: 'weight_gain', label: 'Weight Gain' },
  { id: 'muscle_building', label: 'Muscle Building' },
  { id: 'diabetes_management', label: 'Diabetes Management' },
  { id: 'pcos_management', label: 'PCOS Management' },
  { id: 'general_wellness', label: 'General Wellness' },
  { id: 'fitness_improvement', label: 'Fitness Improvement' },
  { id: 'recovery', label: 'Recovery' },
  { id: 'hormone_balance', label: 'Hormone Balance' },
  { id: 'bp_control', label: 'BP Control' },
  { id: 'gut_relief', label: 'Gut Relief' },
  { id: 'better_energy', label: 'Better Energy' },
  { id: 'better_sleep', label: 'Better Sleep' },
  { id: 'sustainable_habits', label: 'Sustainable Habits' }
] as const;

export const wellnessGoalIdForLabel = (label: HealthGoal) => WELLNESS_GOALS.find((goal) => goal.label === label)?.id ?? null;
