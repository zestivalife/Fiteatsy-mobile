const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const CUISINE_CONTEXTS: Record<string, string> = {
  northindian: 'north indian',
  southindian: 'south indian',
  chinese: 'chinese',
  continental: 'continental',
  indianfastfood: 'indian fast food',
  fastfood: 'indian fast food',
  streetfood: 'street food',
  cafebakery: 'cafe bakery',
  cafe: 'cafe bakery',
  other: 'other',
};

export const resolveGuidanceCuisine = (context: string) => CUISINE_CONTEXTS[normalize(context)] ?? null;

export const hasExplicitCuisineMapping = (tags: string[] | undefined, cuisine: string) =>
  (tags ?? []).some((tag) => normalize(tag) === normalize(cuisine));

export const hasExplicitGuidanceMapping = (tags: string[] | undefined, guidanceTag: string) =>
  (tags ?? []).some((tag) => normalize(tag) === normalize(guidanceTag));

