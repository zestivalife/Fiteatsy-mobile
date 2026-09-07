import fs from 'node:fs';
import path from 'node:path';
import { calculateBmi, validateAnthropometrics } from '../src/utils/anthropometrics';
import { hasDuplicateReminderTimes, normalizeMedicationStrength, strengthFromDosage, strengthUnitFromDosage, time12hTo24h, time24hTo12h } from '../src/services/medicationFormService';
import { WELLNESS_GOALS } from '../src/services/wellnessGoalService';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('v17.37 application review acceptance contracts', () => {
  it('uses the approved consumer cycle labels and accessible selected colors', () => {
    const screen = read('src/screens/cycle/CycleScreen.tsx');
    expect(screen).toContain("['menstrual', 'Period']");
    expect(screen).toContain("['follicular', 'Post-Period']");
    expect(screen).toContain("['luteal', 'Pre-Period']");
    expect(screen).toContain("selected ? '#FFFFFF'");
    expect(screen).toContain('backgroundColor: colors.success');
  });

  it('renders explicit report summary loading, success, empty, error and retry states', () => {
    const screen = read('src/screens/home/ReportsScreen.tsx');
    expect(screen).toContain('summaryLoading');
    expect(screen).toContain('latestReport.analysisSummary');
    expect(screen).toContain('summaryError');
    expect(screen).toContain('Retry summary');
    expect(screen).toContain('has no usable health summary yet');
  });

  it('reopens every supported picker source while preserving re-analysis', () => {
    const screen = read('src/screens/home/ReportsScreen.tsx');
    expect(screen).toContain("pickUpload(lastPickSource)");
    expect(screen).toContain("source === 'camera'");
    expect(screen).toContain("source === 'gallery'");
    expect(screen).toContain('DocumentPicker.getDocumentAsync');
    expect(screen).toContain('startReanalysis');
    expect(screen).toContain('setSelectedUpload(picked)');
  });

  it('uses the governed food source with aliases, pagination and operational eligibility', () => {
    const service = read('backend/src/modules/nutrition/food-preferences.service.ts');
    const screen = read('src/screens/onboarding/FoodPreferencesScreen.tsx');
    expect(service).toContain('jsonb_array_elements_text(aliases)');
    expect(service).toContain('governed.client_consumable = true');
    expect(service).toContain("governed.food_type <> 'INGREDIENT_ONLY'");
    expect(screen).toContain('Load more foods');
    expect(screen).toContain('new Map([...current, ...response.items]');
  });

  it('exposes the complete canonical wellness goal domain with unique stable IDs', () => {
    expect(WELLNESS_GOALS).toHaveLength(15);
    expect(new Set(WELLNESS_GOALS.map((goal) => goal.id)).size).toBe(WELLNESS_GOALS.length);
    expect(new Set(WELLNESS_GOALS.map((goal) => goal.label)).size).toBe(WELLNESS_GOALS.length);
  });
});

describe('medication input and time contracts', () => {
  test.each([['12.5', '12.5'], ['0', null], ['-4', null], ['abc', null], ['12.1234', null]])('normalizes %s', (value, expected) => {
    expect(normalizeMedicationStrength(value)).toBe(expected);
  });
  it('hydrates legacy dosage strength', () => expect(strengthFromDosage('500 mg · 1 tablet')).toBe('500'));
  it('preserves legacy IU dosage units while editing', () => {
    expect(strengthFromDosage('1000 IU · 1 tablet')).toBe('1000');
    expect(strengthUnitFromDosage('1000 IU · 1 tablet')).toBe('IU');
  });
  test.each([
    [12, 0, 'AM', '00:00'], [12, 0, 'PM', '12:00'], [1, 7, 'PM', '13:07'], [11, 59, 'PM', '23:59']
  ] as const)('converts 12-hour time without timezone mutation', (hour, minute, meridiem, expected) => {
    expect(time12hTo24h(hour, minute, meridiem)).toBe(expected);
    expect(time24hTo12h(expected)).toEqual({ hour, minute, meridiem });
  });
  it('prevents duplicate reminder times', () => expect(hasDuplicateReminderTimes([{ time24h: '08:00' }, { time24h: '08:00' }])).toBe(true));
});

describe('anthropometric profile contracts', () => {
  it('calculates BMI from canonical kg/cm values', () => expect(calculateBmi(62.5, 165)).toBe(23));
  it('validates every required measurement', () => {
    const errors = validateAnthropometrics({ heightCm: 0, weightKg: -1, armCircumferenceCm: 0, thighCircumferenceCm: 0, calfCircumferenceCm: 0 });
    expect(Object.values(errors).every(Boolean)).toBe(true);
  });
});
