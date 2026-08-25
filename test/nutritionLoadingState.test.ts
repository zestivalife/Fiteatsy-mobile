jest.mock('expo-constants', () => ({
  expoConfig: { extra: { apiBaseUrl: 'https://api.fiteatsy.test' } }
}));

import { ApiClientError } from '../src/services/apiClient';
import { classifyNutritionLoadError } from '../src/services/nutritionLoadState';

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
});
