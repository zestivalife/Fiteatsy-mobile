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

export const classifyNutritionLoadError = (error: unknown): Exclude<NutritionLoadState, 'LOADING' | 'READY' | 'NO_ACTIVE_PLAN'> => {
  if (error instanceof ApiClientError) {
    if (error.code === 'TIMEOUT') return 'TIMEOUT';
    if (error.code === 'NETWORK_ERROR') return 'NETWORK_ERROR';
    if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN') return 'AUTH_ERROR';
    if (error.code === 'VALIDATION_ERROR') return 'MALFORMED_PLAN';
  }
  return 'SERVER_ERROR';
};
