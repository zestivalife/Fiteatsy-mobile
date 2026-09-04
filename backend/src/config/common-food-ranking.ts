/** Canonical server-side rollout switch. Absence enables the accepted V3 policy; only explicit `false` restores V2. */
export const COMMON_FOOD_RANKING_V3_ENABLED=process.env.COMMON_FOOD_RANKING_V3!=='false';
