import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('permanent L4 XCUITest automation contract', () => {
  it('keeps the repository-owned UI test target and shared scheme', () => {
    const project = read('ios/Fiteatsy.xcodeproj/project.pbxproj');
    const scheme = read('ios/Fiteatsy.xcodeproj/xcshareddata/xcschemes/FiteatsyUITests.xcscheme');
    expect(project).toContain('FiteatsyUITests');
    expect(scheme).toContain('FiteatsyUITests');
    expect(scheme).toContain('Fiteatsy.app');
  });

  it('protects the governed QA boundary and physical ruler interactions', () => {
    const uiTest = read('ios/FiteatsyUITests/FiteatsyUITests.swift');
    expect(uiTest).toContain('FITEATSY_GOVERNED_QA_TEST_READY');
    expect(uiTest).toContain('BLOCKED — GOVERNED QA_TEST SESSION REQUIRED');
    expect(uiTest).toContain('thenDragTo');
    expect(uiTest).toContain('height.ruler');
    expect(uiTest).toContain('weight.ruler');
  });

  it('keeps stable identifiers for every release-critical surface', () => {
    const sources = [
      'src/components/onboarding/OnboardingShell.tsx',
      'src/screens/onboarding/OnboardingAssessmentScreen.tsx',
      'src/screens/onboarding/OnboardingFoodPreferencesFlow.tsx',
      'src/screens/onboarding/FoodPreferencesScreen.tsx',
      'src/screens/onboarding/OnboardingReadyScreen.tsx',
      'src/screens/sync/SyncWearableScreen.tsx',
      'src/screens/home/HomeScreen.tsx',
      'src/screens/home/TrackerScreen.tsx',
      'src/screens/home/ReportsScreen.tsx',
      'src/screens/home/NutritionExperienceScreen.tsx',
      'src/screens/medication/MedicationCalendarScreen.tsx',
    ].map(read).join('\n');

    [
      'onboarding.back', 'onboarding.continue', 'onboarding.progress',
      'food.loading', 'food.error', 'food.retry',
      'food.save', 'food.edit', 'healthConnect.root', 'ready.root',
      'home.recoveryCore', 'tracker.health', 'tracker.wellness',
      'reports.root', 'reports.upload', 'nutrition.root', 'medication.root',
    ].forEach(identifier => expect(sources).toContain(identifier));
    expect(sources).toContain('`${testIDPrefix}.ruler`');
    expect(sources).toContain("? 'height' : 'weight'");
  });
});
