import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('Apple-style member experience', () => {
  it('keeps the home header focused on greeting and profile', () => {
    const home = read('src/screens/home/HomeScreen.tsx');
    expect(home).not.toContain('onSearch={() =>');
    expect(home).not.toContain('onAdd={() =>');
    expect(home).not.toContain('onNotifications={() =>');
    expect(home).toContain('accessibilityLabel="Open profile"');
  });

  it('provides explicit back navigation on profile food preferences', () => {
    const food = read('src/screens/onboarding/FoodPreferencesScreen.tsx');
    expect(food).toContain('<AppBackButton onPress={() => navigation.goBack()} />');
  });

  it('groups profile, wellness, and care content into clear native-style sections', () => {
    const profile = read('src/screens/home/ProfileScreen.tsx');
    const tracker = read('src/screens/home/TrackerScreen.tsx');
    const care = read('src/screens/home/ConsultantBookingScreen.tsx');

    expect(profile).toContain('HEALTH SUMMARY');
    expect(profile).toContain('CONNECTED HEALTH');
    expect(profile).toContain('SETTINGS');
    expect(tracker).not.toContain('>Wellness</Text>');
    expect(tracker).not.toContain('<Card style={[styles.summaryCard');
    expect(tracker).toContain('curvedTabActive');
    expect(care).toContain('<PageHeader title="Care"');
    expect(care).toContain('YOUR CONSULTANT');
    expect(care).toContain('BOOK A SESSION');
  });

  it('uses live health and nutrition sources for tracker metrics', () => {
    const tracker = read('src/screens/home/TrackerScreen.tsx');
    const profile = read('src/screens/home/ProfileScreen.tsx');
    const appleHealth = read('src/services/appleHealthService.ts');

    expect(profile).not.toContain('Set dark theme');
    expect(profile).not.toContain('Set light theme');
    expect(tracker).toContain('readCurrentHealthData()');
    expect(tracker).toContain('getNutritionExperience()');
    expect(tracker).toContain('buildSevenDayHealthHistory(latestSync)');
    expect(tracker).toContain('buildSleepRecommendation(sevenDayHealthHistory)');
    expect(tracker).toContain('nutritionHydrationLiters');
    expect(appleHealth).toContain("'sleep_deep_minutes'");
    expect(appleHealth).toContain("'sleep_rem_minutes'");
  });

  it('exposes comprehensive Health Data and a grouped Daily Wellness experience', () => {
    const healthData = read('src/screens/sync/HealthDataScreen.tsx');
    const tracker = read('src/screens/home/TrackerScreen.tsx');
    const appleHealth = read('src/services/appleHealthService.ts');

    ['Exercise', 'Workouts', 'Core Sleep', 'Deep Sleep', 'REM Sleep', 'Blood Oxygen', 'Respiratory Rate', 'Mindful Minutes']
      .forEach((label) => expect(healthData).toContain(label));
    expect(appleHealth).toContain('HKQuantityTypeIdentifierOxygenSaturation');
    expect(appleHealth).toContain('HKQuantityTypeIdentifierRespiratoryRate');
    expect(appleHealth).toContain('HKCategoryTypeIdentifierMindfulSession');
    expect(tracker).toContain('Today’s Wellness');
    expect(tracker).toContain('Building your baseline');
    expect(tracker).not.toContain('<MetricSparkCard');
    expect(tracker).not.toContain('<MetricBarsCard');
  });
});
