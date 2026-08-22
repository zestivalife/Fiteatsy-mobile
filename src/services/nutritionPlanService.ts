import { apiFetch } from './apiClient';
import { NutritionMealConsumptionResult, PublishedNutritionPlan } from '../types';

export type NutritionPlanDeliveryStatus = {
  status: 'NO_PLAN' | 'PREPARING' | 'PENDING_APPROVAL' | 'APPROVED_NOT_PUBLISHED' | 'ACTIVE_PUBLISHED';
  plan: {
    id: string;
    versionId: string | null;
    planStatus: string;
    lifecycleStatus: string;
    approvedAtISO: string | null;
    publishedAtISO: string | null;
  } | null;
};

export const getNutritionPlanDeliveryStatus = () =>
  apiFetch<NutritionPlanDeliveryStatus>('/v1/platform/nutrition-plan/status');

export const getPublishedNutritionPlan = (sessionToken?: string) =>
  apiFetch<PublishedNutritionPlan>('/v1/platform/nutrition-plan', sessionToken ? {
    headers: { Authorization: `Bearer ${sessionToken}` }
  } : undefined);

export const getTodayNutritionPlan = () =>
  apiFetch<PublishedNutritionPlan['today'] & {
    clientId: string;
    planId: string;
    versionId: string;
    publishedAtISO: string | null;
  }>('/v1/platform/nutrition-plan/today');

export const markNutritionMealConsumed = (payload: {
  planId: string;
  versionId: string;
  mealKey: string;
  mealLabel: string;
  mealName: string | null;
  quantityLabel: string | null;
  consumedAtISO?: string;
  notes?: string | null;
}) =>
  apiFetch<NutritionMealConsumptionResult>('/v1/platform/nutrition-plan/consume', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
