import { apiFetch, putJson } from './apiClient';

export type FoodPreferenceProfile = {
  dietType: 'vegetarian' | 'eggetarian' | 'non_vegetarian' | 'vegan' | 'jain' | null;
  proteins: string[];
  cuisines: string[];
  foodsLiked: string[];
  foodsDisliked: string[];
  foodsAvoided: string[];
  restrictions: string[];
  staplePreference: 'roti' | 'rice' | 'both' | 'none' | null;
  dairyPreference: 'allowed' | 'limited' | 'avoid' | null;
  practicality: string[];
};

export type FoodPreferenceResponse = {
  clientId: string;
  profile: FoodPreferenceProfile;
  updatedBy: string | null;
  updatedAtISO: string | null;
};

export const emptyFoodPreferenceProfile = (): FoodPreferenceProfile => ({
  dietType: null,
  proteins: [],
  cuisines: [],
  foodsLiked: [],
  foodsDisliked: [],
  foodsAvoided: [],
  restrictions: [],
  staplePreference: null,
  dairyPreference: null,
  practicality: []
});

export const getFoodPreferences = () => apiFetch<FoodPreferenceResponse>('/v1/platform/food-preferences');

export const saveFoodPreferences = (profile: FoodPreferenceProfile) =>
  putJson<FoodPreferenceResponse>('/v1/platform/food-preferences', profile);
