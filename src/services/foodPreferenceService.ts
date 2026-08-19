import { apiFetch, putJson } from './apiClient';

export type FoodPreferenceProfile = {
  dietType: 'vegetarian' | 'eggetarian' | 'non_vegetarian' | 'vegan' | 'jain' | null;
  proteins: string[];
  cuisines: string[];
  foodsLiked: string[];
  foodsDisliked: string[];
  foodsAvoided: string[];
  likedFoodIds: string[];
  dislikedFoodIds: string[];
  avoidedFoodIds: string[];
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
  likedFoodIds: [],
  dislikedFoodIds: [],
  avoidedFoodIds: [],
  restrictions: [],
  staplePreference: null,
  dairyPreference: null,
  practicality: []
});

export const getFoodPreferences = () => apiFetch<FoodPreferenceResponse>('/v1/platform/food-preferences');

export type FoodCatalogueItem = {
  id: string;
  canonicalName: string;
  displayName: string;
  category: string | null;
  dietaryClassification: string | null;
  cuisineTags: string[];
  allergenTags: string[];
};

export const searchFoodCatalogue = (query: string) =>
  apiFetch<{ items: FoodCatalogueItem[]; hasMore: boolean }>(`/v1/platform/food-catalogue?q=${encodeURIComponent(query)}&limit=30`);

export const saveFoodPreferences = (profile: FoodPreferenceProfile) =>
  putJson<FoodPreferenceResponse>('/v1/platform/food-preferences', profile);
