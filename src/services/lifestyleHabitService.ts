import { queueHealthEvent } from './platformEventService';
import type { OnboardingProfile } from '../types';

export const LIFESTYLE_HABIT_CONTRACT_VERSION = 'LIFESTYLE_BALANCE_V1_PROPOSAL' as const;
export const LIFESTYLE_HABIT_TYPES = [
  'consistent_daily_routine',
  'recovery_rest_practice',
  'evening_screen_boundary',
  'outdoor_daylight_routine'
] as const;
export type LifestyleHabitType = typeof LIFESTYLE_HABIT_TYPES[number];

export const recordLifestyleHabit = (input: {
  userId:string; clientId?:string|null; onboarding:OnboardingProfile|null;
  healthDay:string; habitType:LifestyleHabitType; completed:boolean; revision:number;
}) => queueHealthEvent({
  eventType:'lifestyle_habit_recorded',eventSource:'mobile.tracker',userId:input.userId,
  clientId:input.clientId,onboarding:input.onboarding,shouldCreateTimelineEntry:false,
  eventPayload:{contractVersion:LIFESTYLE_HABIT_CONTRACT_VERSION,habitType:input.habitType,
    healthDay:input.healthDay,completed:input.completed,revision:input.revision,recordStatus:'active'}
});

export const revokeLifestyleHabit = (input: {
  userId:string; clientId?:string|null; onboarding:OnboardingProfile|null;
  healthDay:string; habitType:LifestyleHabitType; revision:number;
}) => queueHealthEvent({
  eventType:'lifestyle_habit_revoked',eventSource:'mobile.tracker',userId:input.userId,
  clientId:input.clientId,onboarding:input.onboarding,shouldCreateTimelineEntry:false,
  eventPayload:{contractVersion:LIFESTYLE_HABIT_CONTRACT_VERSION,habitType:input.habitType,
    healthDay:input.healthDay,revision:input.revision,recordStatus:'revoked'}
});
