jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.fiteatsy.test' } }
}));

import { ApiClientError } from '../src/services/apiClient';
import { classifyNutritionLoadError, nutritionLoadCopy } from '../src/services/nutritionLoadState';

describe('Nutrition bounded loading states', () => {
  it.each([
    ['TIMEOUT', 'TIMEOUT'],
    ['NETWORK_ERROR', 'NETWORK_ERROR'],
    ['UNAUTHORIZED', 'AUTH_ERROR'],
    ['FORBIDDEN', 'AUTH_ERROR'],
    ['VALIDATION_ERROR', 'MALFORMED_PLAN'],
    ['SERVER_ERROR', 'SERVER_ERROR']
  ] as const)('maps %s to %s', (code, expected) => {
    expect(classifyNutritionLoadError(new ApiClientError(code, code))).toBe(expected);
  });

  it('does not classify unknown errors as no-plan', () => {
    expect(classifyNutritionLoadError(new Error('unknown'))).toBe('SERVER_ERROR');
  });

  it('uses no-plan only for the explicit backend diet-plan contract', () => {
    expect(classifyNutritionLoadError(new ApiClientError('NOT_FOUND', 'Plan pending', 404, 'DIET_PLAN_NOT_FOUND'))).toBe('NO_ACTIVE_PLAN');
    expect(classifyNutritionLoadError(new ApiClientError('NOT_FOUND', 'Missing route', 404, 'NOT_FOUND'))).toBe('SERVER_ERROR');
  });

  it('presents the no-plan state as a truthful business state without a retry loop', () => {
    expect(nutritionLoadCopy('NO_ACTIVE_PLAN')).toEqual({
      title: 'Your nutrition plan is being prepared',
      message: 'Your Consultant has not published a nutrition plan for you yet.',
      retryable: false,
    });
  });

  it('keeps technical failures recoverable without exposing internal error codes', () => {
    for (const state of ['TIMEOUT', 'NETWORK_ERROR', 'MALFORMED_PLAN', 'SERVER_ERROR'] as const) {
      const copy = nutritionLoadCopy(state);
      expect(copy.retryable).toBe(true);
      expect(`${copy.title} ${copy.message}`).not.toMatch(/SERVER_ERROR|NETWORK_ERROR|TIMEOUT|MALFORMED_PLAN/);
    }
  });
});
