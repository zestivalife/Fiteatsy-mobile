import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const ReactMock = require('react');
    const callbackRef = ReactMock.useRef(callback);
    callbackRef.current = callback;
    ReactMock.useEffect(() => callbackRef.current(), []);
  },
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
}));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Circle: 'Circle' }));
jest.mock('../src/components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const ReactMock = require('react');
    return ReactMock.createElement(require('react-native').View, null, children);
  },
}));
jest.mock('../src/state/AppContext', () => ({ useAppContext: () => ({ themeMode: 'dark' }) }));
jest.mock('../src/utils/nutritionDate', () => ({ nutritionDate: () => '2026-11-07', subscribeToNutritionDay: () => () => undefined }));
jest.mock('../src/services/nutritionLoadState', () => ({
  classifyNutritionLoadError: () => 'SERVER_ERROR',
  nutritionLoadCopy: () => ({ title: 'Unavailable', message: 'Unavailable', retryable: true }),
}));

const mockGetNutritionExperience = jest.fn();
const mockLogNutritionEvent = jest.fn();
const mockLogWater = jest.fn();
jest.mock('../src/services/nutritionExperienceService', () => ({
  getNutritionExperience: (...args: unknown[]) => mockGetNutritionExperience(...args),
  getNutritionPattern: jest.fn(), getCravingSuggestions: jest.fn(), getEatingOutSuggestions: jest.fn(),
  getWhatCanIEatNow: jest.fn(), logNutritionEvent: (...args: unknown[]) => mockLogNutritionEvent(...args),
  logWater: (...args: unknown[]) => mockLogWater(...args),
}));

test('mobile Nutrition renders exact consultant-published meals read-only', async () => {
  mockGetNutritionExperience.mockResolvedValue({
    delivery: { source: 'EXTERNAL_CONSULTANT', readOnly: true, publicationId: 'publication-7' },
    plan: { id: 'plan-1', templateVersion: 'EXTERNAL_DIET_PLAN_V1', planStatus: 'PUBLISHED', publishedAtISO: '2026-11-07T10:00:00Z' },
    version: { id: 'publication-7', versionNumber: 7, content: { nutritionSnapshot: { programmeName: 'Consultant plan' },
      dailyTargets: { calories: 1800, protein: 100, carbohydrates: null, fat: null, fibre: null, hydration: null }, supplementsAndClinicalNotes: [] } },
    meals: [
      { key: 'BREAKFAST', label: 'Breakfast', window: '08:00–09:00', state: 'PENDING', consumedAtISO: null, consumed: null,
        selectedOptionId: 'breakfast-1',
        options: [{ id: 'breakfast-1', slot: 1, meal: 'Poha + curd', portion: '1 bowl · 100 g', approxKcal: 320, proteinGrams: 14, carbsGrams: 48, fatGrams: 8, fibreGrams: 6 }] },
    ],
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }, remaining: { calories: 1800, protein: 100, carbs: null, fat: null, fibre: null },
    water: { litres: 0, targetLitres: null }, mealCount: 1, mealsFollowed: 0, outOfPlanCount: 0, skippedCount: 0, pendingCount: 1,
    plannedVsActual: { calories: { planned: 1800, actual: 0 }, mealsFollowed: { planned: 1, actual: 0 }, outOfPlan: 0, skipped: 0 },
    mealStates: [{ mealHeadId: 'BREAKFAST', mealHeadName: 'Breakfast', scheduledTime: '08:00–09:00', status: 'PENDING', loggedEventId: null, loggedOptionId: null, loggedFood: null, timestamp: null }],
    adherence: { percent: 0, label: 'Not tracked for consultant plan' }, nutritionScore: 0, selectedDate: '2026-11-07', consultantNote: null,
  });
  const screen = render(React.createElement(require('../src/screens/home/NutritionExperienceScreen').NutritionExperienceScreen));
  await waitFor(() => expect(mockGetNutritionExperience).toHaveBeenCalled());
  await waitFor(() => expect(screen.getAllByText('Consultant plan').length).toBeGreaterThan(0));
  expect(screen.getByText('Poha + curd')).toBeTruthy();
  expect(screen.getByText('Serving: 1 bowl · 100 g')).toBeTruthy();
  expect(screen.getByText('320 kcal · P 14g · C 48g · F 8g · Fibre 6g')).toBeTruthy();
  expect(screen.queryByText('My Pattern')).toBeNull();
  expect(screen.queryByText('What can I eat now?')).toBeNull();
  expect(mockLogNutritionEvent).not.toHaveBeenCalled();
  expect(mockLogWater).not.toHaveBeenCalled();
}, 15_000);
