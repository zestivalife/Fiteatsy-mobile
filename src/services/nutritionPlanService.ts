import { apiFetch } from './apiClient';
import { PublishedNutritionPlan } from '../types';

export const getPublishedNutritionPlan = () =>
  apiFetch<PublishedNutritionPlan>('/v1/platform/nutrition-plan');

export const getTodayNutritionPlan = () =>
  apiFetch<PublishedNutritionPlan['today'] & {
    clientId: string;
    planId: string;
    versionId: string;
    publishedAtISO: string | null;
  }>('/v1/platform/nutrition-plan/today');
