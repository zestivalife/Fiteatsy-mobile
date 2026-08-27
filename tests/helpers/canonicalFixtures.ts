const usedSyntheticPhoneIndexes = new Set<number>();

export const syntheticOperationalPhone = (fixtureIndex: number) => {
  if (!Number.isInteger(fixtureIndex) || fixtureIndex < 0 || fixtureIndex > 99_999) {
    throw new Error('Synthetic phone fixture index must be an integer between 0 and 99999.');
  }
  if (usedSyntheticPhoneIndexes.has(fixtureIndex)) {
    throw new Error(`Synthetic phone fixture index ${fixtureIndex} is already in use.`);
  }
  usedSyntheticPhoneIndexes.add(fixtureIndex);
  return `9190000${String(fixtureIndex).padStart(5, '0')}`;
};

export const canonicalCompleteHealthProfile = () => ({
  dateOfBirthISO: '1990-06-15T00:00:00.000Z',
  gender: 'Female',
  heightCm: 165,
  currentWeightKg: 62,
  goalWeightKg: 58,
  waistCm: 76,
  hipCm: 96,
  neckCm: 32,
  bodyFatPct: 24,
  occupation: 'Designer',
  workingHoursLabel: '9-6',
  shiftType: 'day',
  activityLevel: 'moderate',
  workMode: 'hybrid',
  travelFrequency: 'low',
  sleepHours: 7.5,
  sleepGoalHours: 8,
  sleepQualityLabel: 'good',
  smokingStatus: 'never',
  alcoholFrequency: 'never',
  exerciseFrequency: '3-4 times weekly',
  stressLevelLabel: 'moderate',
  wakeTime: '06:30',
  breakfastTime: '08:00',
  lunchTime: '13:00',
  dinnerTime: '20:00',
  sleepTime: '22:30',
  mealsPerDay: 3,
  waterIntakeLiters: 2.5,
  outsideFoodFrequency: 'weekly',
  cookingAtHome: 'yes',
  whoCooks: 'self',
  dietType: 'vegetarian',
  regionalCuisine: 'North Indian',
  preferredCuisines: ['North Indian'],
  foodsLiked: ['dal'],
  foodsDisliked: ['soda'],
  foodAllergies: ['peanut'],
  foodIntolerances: ['lactose'],
  currentSupplements: ['omega-3'],
  currentMedicines: ['none'],
  primaryConditions: ['Vitamin Deficiency'],
  previousConditions: ['none'],
  familyHistoryConditions: ['none'],
  wellnessGoals: ['Better Energy'],
  medicalNotes: 'No additional clinical notes.',
  pregnancyStatus: 'not_applicable',
  breastfeedingStatus: 'not_applicable',
  pcosStatus: 'not_applicable',
  thyroidStatus: 'none',
  diabetesStatus: 'none',
  hypertensionStatus: 'none',
  cholesterolStatus: 'none',
  heartConditionStatus: 'none',
  previousSurgeries: ['none'],
});
