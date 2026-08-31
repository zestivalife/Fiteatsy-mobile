import { ApiClientError } from './apiClient';

export type NutritionLoadState =
  | 'LOADING'
  | 'READY'
  | 'NO_ACTIVE_PLAN'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'SERVER_ERROR'
  | 'MALFORMED_PLAN';

export const classifyNutritionLoadError = (error: unknown): Exclude<NutritionLoadState, 'LOADING' | 'READY'> => {
  if (error instanceof ApiClientError) {
    if (error.code === 'TIMEOUT') return 'TIMEOUT';
    if (error.code === 'NETWORK_ERROR') return 'NETWORK_ERROR';
    if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN') return 'AUTH_ERROR';
    if (error.code === 'NOT_FOUND' && error.serverCode === 'DIET_PLAN_NOT_FOUND') return 'NO_ACTIVE_PLAN';
    if (error.code === 'VALIDATION_ERROR') return 'MALFORMED_PLAN';
  }
  return 'SERVER_ERROR';
};

export const nutritionLoadCopy = (state: Exclude<NutritionLoadState, 'LOADING' | 'READY'>) => {
  switch (state) {
    case 'NO_ACTIVE_PLAN':
      return {
        title: 'Your nutrition plan is being prepared',
        message: 'Your Consultant has not published a nutrition plan for you yet.',
        retryable: false,
      };
    case 'TIMEOUT':
      return {
        title: 'Nutrition is taking longer than expected',
        message: 'Check your connection and try again.',
        retryable: true,
      };
    case 'NETWORK_ERROR':
      return {
        title: "Nutrition couldn't be loaded",
        message: 'Unable to reach Fiteatsy. Check your connection and try again.',
        retryable: true,
      };
    case 'AUTH_ERROR':
      return {
        title: 'Sign in again to view Nutrition',
        message: 'Your session is no longer authorised to load this plan.',
        retryable: false,
      };
    case 'MALFORMED_PLAN':
      return {
        title: "Nutrition couldn't be loaded",
        message: 'The published plan could not be displayed safely. Please try again later.',
        retryable: true,
      };
    case 'SERVER_ERROR':
      return {
        title: "Nutrition couldn't be loaded",
        message: 'Fiteatsy is temporarily unavailable. Please try again.',
        retryable: true,
      };
  }
};
