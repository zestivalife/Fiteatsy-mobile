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
    const runner = read('scripts/run-l4-xcuitest.sh');
    expect(runner).toContain('-configuration Release');
    expect(runner).toContain('ENTRY_FILE="node_modules/expo/AppEntry.js"');
  });

  it('protects the governed QA boundary and physical ruler interactions', () => {
    const uiTest = read('ios/FiteatsyUITests/FiteatsyUITests.swift');
    expect(uiTest).toContain('FITEATSY_GOVERNED_QA_TEST_READY');
    expect(uiTest).toContain('BLOCKED — GOVERNED QA_TEST SESSION REQUIRED');
    expect(uiTest).toContain('thenDragTo');
    expect(uiTest).toContain('height.ruler');
    expect(uiTest).toContain('weight.ruler');
  });

  it('keeps the real onboarding interaction matrix behind the governed identity gate', () => {
    const uiTest = read('ios/FiteatsyUITests/FiteatsyUITests.swift');
    [
      'food.diet.non_vegetarian',
      'food.cuisine.maharashtrian',
      'food.cuisine.international_other',
      'food.staple.both', 'food.dairy.limited',
      'food.avoid.mode.disliked', 'food.avoid.search', 'food.save',
    ].forEach(identifier => expect(uiTest).toContain(identifier));
    expect(uiTest).toContain('exerciseMetric(prefix: "height"');
    expect(uiTest).toContain('exerciseMetric(prefix: "weight"');
    [
      '.input', '.value', '.plus', '.minus',
      '.unit.imperial', '.unit.metric',
    ].forEach(identifier => expect(uiTest).toContain(identifier));
    expect(uiTest).toContain('assertKeyboardAndContinueRemainUsable');
    expect(uiTest).toContain('save.doubleTap()');
    expect(uiTest).toContain('app.terminate()');
    expect(uiTest.indexOf('FITEATSY_GOVERNED_QA_TEST_READY'))
      .toBeLessThan(uiTest.indexOf('exerciseMetric(prefix: "height"'));
  });

  it('permanently covers safe authenticated navigation and lifecycle recovery', () => {
    const uiTest = read('ios/FiteatsyUITests/FiteatsyUITests.swift');
    [
      'testReadOnlyBottomNavigationAndLifecycle',
      'testTrackerHierarchyAndMissingDataTruthfulness',
      'testReportsV2ReadOnlyUploadSheetAndPickerCancellation',
      'testMedicationReadOnlyLeaveAndReturn',
      'testHomeRecoveryCoreTruthfulness',
    ].forEach(testName => expect(uiTest).toContain(testName));
    ['Journey', 'Tracker', 'Nutrition', 'Care', 'Profile'].forEach(tab =>
      expect(uiTest).toContain(`tapTab("${tab}"`),
    );
    expect(uiTest).toContain('XCUIDevice.shared.press(.home)');
    expect(uiTest).toContain('app.terminate()');
    expect(uiTest).toContain('for attempt in 1...3');
    expect(uiTest).toContain('System document picker did not expose a safe Cancel action');
    expect(uiTest).toContain('No script URL provided');
  });

  it('does not present missing Recovery Core data as a fabricated score', () => {
    const home = read('src/screens/home/HomeScreen.tsx');
    const uiTest = read('ios/FiteatsyUITests/FiteatsyUITests.swift');
    expect(home).toContain("selectedScore == null ? 'Calibrating'");
    expect(home).not.toContain("selectedScore == null ? '--/100'");
    expect(uiTest).toContain('Missing Recovery Core data must not render --/100');
    expect(uiTest).toContain('Missing Recovery Score was coerced to zero');
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
      'src/screens/home/ConsultantBookingScreen.tsx',
      'src/screens/home/ProfileScreen.tsx',
      'src/screens/medication/MedicationCalendarScreen.tsx',
    ].map(read).join('\n');

    [
      'onboarding.back', 'onboarding.continue', 'onboarding.progress',
      'food.loading', 'food.error', 'food.retry',
      'food.save', 'food.edit', 'healthConnect.root', 'ready.root',
      'home.recoveryCore', 'tracker.health', 'tracker.wellness',
      'reports.root', 'reports.upload', 'nutrition.root', 'medication.root',
      'care.root', 'profile.root',
    ].forEach(identifier => expect(sources).toContain(identifier));
    expect(sources).toContain('`${testIDPrefix}.ruler`');
    expect(sources).toContain("? 'height' : 'weight'");
  });
});
