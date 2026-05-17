export const hydrationProgress = (currentLiters: number, goalLiters: number): number => {
  if (goalLiters <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, currentLiters / goalLiters));
};

export const remainingHydration = (currentLiters: number, goalLiters: number): number => {
  return Math.max(0, Number((goalLiters - currentLiters).toFixed(2)));
};
