jest.mock('../src/services/apiClient', () => ({
  ApiClientError: class ApiClientError extends Error {
    code: string;
    status?: number;
    constructor(code: string, message: string, status?: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  apiFetch: jest.fn(),
  putJson: jest.fn()
}));

import { ApiClientError, apiFetch, putJson } from '../src/services/apiClient';
import {
  emptyFoodPreferenceProfile,
  foodPreferencesMatch,
  saveFoodPreferences,
  type FoodPreferenceProfile,
  type FoodPreferenceResponse
} from '../src/services/foodPreferenceService';

const mockApiFetch = apiFetch as jest.Mock;
const mockPutJson = putJson as jest.Mock;

const profile = (overrides: Partial<FoodPreferenceProfile> = {}): FoodPreferenceProfile => ({
  ...emptyFoodPreferenceProfile(),
  dietType: 'non_vegetarian',
  proteins: ['chicken', 'fish'],
  cuisines: ['maharashtrian'],
  dislikedFoodIds: ['food-2', 'food-1'],
  dairyPreference: 'limited',
  staplePreference: 'both',
  ...overrides
});

const response = (value: FoodPreferenceProfile): FoodPreferenceResponse => ({
  clientId: 'qa-client',
  profile: value,
  updatedBy: 'qa-client',
  updatedAtISO: '2026-08-30T12:00:00.000Z'
});

describe('food preference save recovery', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPutJson.mockReset();
  });

  it('treats a timed-out response as success when the canonical write persisted', async () => {
    const requested = profile();
    mockPutJson.mockRejectedValueOnce(new ApiClientError('TIMEOUT', 'timed out'));
    mockApiFetch.mockResolvedValueOnce(response(profile({ dislikedFoodIds: ['food-1', 'food-2'] })));

    await expect(saveFoodPreferences(requested)).resolves.toEqual(response(profile({ dislikedFoodIds: ['food-1', 'food-2'] })));
    expect(mockPutJson).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it.each(['NETWORK_ERROR', 'SERVER_ERROR'])('reconciles ambiguous %s failures after persistence', async (code) => {
    const requested = profile();
    mockPutJson.mockRejectedValueOnce(new ApiClientError(code as 'NETWORK_ERROR' | 'SERVER_ERROR', 'ambiguous'));
    mockApiFetch.mockResolvedValueOnce(response(requested));
    await expect(saveFoodPreferences(requested)).resolves.toEqual(response(requested));
  });

  it('preserves the original timeout and selections when the canonical write did not persist', async () => {
    const error = new ApiClientError('TIMEOUT', 'timed out');
    mockPutJson.mockRejectedValueOnce(error);
    mockApiFetch.mockResolvedValueOnce(response(profile({ cuisines: ['gujarati'] })));
    await expect(saveFoodPreferences(profile())).rejects.toBe(error);
    expect(mockPutJson).toHaveBeenCalledTimes(1);
  });

  it('does not reconcile definitive validation failures', async () => {
    const error = new ApiClientError('VALIDATION_ERROR', 'invalid', 422);
    mockPutJson.mockRejectedValueOnce(error);
    await expect(saveFoodPreferences(profile())).rejects.toBe(error);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('does not issue a verification read after an ordinary successful save', async () => {
    const saved = response(profile());
    mockPutJson.mockResolvedValueOnce(saved);
    await expect(saveFoodPreferences(profile())).resolves.toBe(saved);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('compares canonical set-like fields without depending on array order', () => {
    expect(foodPreferencesMatch(profile(), profile({ proteins: ['fish', 'chicken'], dislikedFoodIds: ['food-1', 'food-2'] }))).toBe(true);
  });
});
