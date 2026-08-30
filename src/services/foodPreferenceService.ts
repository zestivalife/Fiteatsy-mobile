import { ApiClientError, apiFetch, putJson } from './apiClient';

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

const sorted = (values: string[]) => [...values].sort((left, right) => left.localeCompare(right));

export const foodPreferencesMatch = (left: FoodPreferenceProfile, right: FoodPreferenceProfile) =>
  left.dietType === right.dietType
  && left.staplePreference === right.staplePreference
  && left.dairyPreference === right.dairyPreference
  && JSON.stringify(sorted(left.proteins)) === JSON.stringify(sorted(right.proteins))
  && JSON.stringify(sorted(left.cuisines)) === JSON.stringify(sorted(right.cuisines))
  && JSON.stringify(sorted(left.foodsLiked)) === JSON.stringify(sorted(right.foodsLiked))
  && JSON.stringify(sorted(left.foodsDisliked)) === JSON.stringify(sorted(right.foodsDisliked))
  && JSON.stringify(sorted(left.foodsAvoided)) === JSON.stringify(sorted(right.foodsAvoided))
  && JSON.stringify(sorted(left.likedFoodIds)) === JSON.stringify(sorted(right.likedFoodIds))
  && JSON.stringify(sorted(left.dislikedFoodIds)) === JSON.stringify(sorted(right.dislikedFoodIds))
  && JSON.stringify(sorted(left.avoidedFoodIds)) === JSON.stringify(sorted(right.avoidedFoodIds))
  && JSON.stringify(sorted(left.restrictions)) === JSON.stringify(sorted(right.restrictions))
  && JSON.stringify(sorted(left.practicality)) === JSON.stringify(sorted(right.practicality));

const isAmbiguousSaveFailure = (error: unknown) =>
  error instanceof ApiClientError
  && (error.code === 'TIMEOUT'
    || error.code === 'NETWORK_ERROR'
    || error.code === 'SERVER_ERROR'
    || error.code === 'CONFLICT');

export const saveFoodPreferences = async (profile: FoodPreferenceProfile) => {
  try {
    return await putJson<FoodPreferenceResponse>('/v1/platform/food-preferences', profile);
  } catch (error) {
    if (!isAmbiguousSaveFailure(error)) throw error;
    try {
      const canonical = await getFoodPreferences();
      if (foodPreferencesMatch(canonical.profile, profile)) return canonical;
    } catch {
      // Preserve the original failure if canonical reconciliation is unavailable.
    }
    throw error;
  }
};
