import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('FITEATSY accepted product baseline regression contracts', () => {
  it('FITEATSY_ONBOARDING_V2_CONTRACT keeps the canonical V2 owner and phase order', () => {
    const navigation = read('src/navigation/AppNavigation.tsx');
    const shell = read('src/components/onboarding/OnboardingShell.tsx');
    const basics = read('src/screens/onboarding/OnboardingBasicsScreen.tsx');
    const food = read('src/screens/onboarding/FoodPreferencesScreen.tsx');
    const assessment = read('src/screens/onboarding/OnboardingAssessmentScreen.tsx');

    expect(navigation).toContain('OnboardingReadyScreen');
    expect(shell).toContain("'BASICS' | 'LIFESTYLE' | 'RECOVERY' | 'CONNECT' | 'READY'");
    expect(food).toContain('OnboardingFoodPreferencesFlow');
    expect(food).toContain("startPhase: 'recovery'");
    expect(assessment).toContain("navigation.navigate('FoodPreferences'");
    expect(basics).not.toContain('Quick Setup');
    expect(navigation).not.toContain('LegacyOnboarding');
  });

  it('FITEATSY_MEDICATION_UX_CONTRACT mounts the accepted tracker and current Foundation', () => {
    const navigation = read('src/navigation/AppNavigation.tsx');
    const medication = read('src/screens/medication/MedicationCalendarScreen.tsx');
    const medicationUtils = read('src/services/medicationUtils.ts');

    expect(navigation).toContain('component={MedicationCalendarScreen}');
    ['Medication Tracker', "Today's Progress", 'Take now', 'Snooze', 'Skip', "TODAY'S SCHEDULE", 'My Medications', 'History', '7 Days', '30 Days', 'DOSE LOG'].forEach((label) => expect(medication).toContain(label));
    expect(medication).toContain('PageHeader');
    expect(medication).toContain('SegmentedTabs');
    expect(medicationUtils).toContain("MEDICATION_TIME_ZONE = 'Asia/Kolkata'");
    expect(navigation).not.toContain('LegacyMedication');
  });

  it('FITEATSY_FOUNDATION_UI_CONTRACT keeps Exo and five canonical tabs', () => {
    const app = read('App.tsx');
    const navigation = read('src/navigation/AppNavigation.tsx');
    const tokens = read('src/design/tokens.ts');

    expect(app).toContain('Exo_400Regular');
    expect(tokens).toContain("fontFamily: 'Exo_");
    ['Journey', 'Tracker', 'Nutrition', 'Care', 'Profile'].forEach((tab) => expect(navigation).toContain(`<Tab.Screen name="${tab}"`));
  });

  it('keeps splash, canonical data, Nutrition, profile, stress, and phone ownership', () => {
    const splash = read('src/screens/auth/SplashScreen.tsx');
    const profile = read('src/screens/home/ProfileScreen.tsx');
    const nutrition = read('src/screens/home/NutritionHubScreen.tsx');
    const tracker = read('src/screens/home/TrackerScreen.tsx');
    const phone = read('src/utils/phone.ts');

    expect(splash).toContain('https://zestiva.life/assets/Fiteatsy.mp4');
    expect(splash).toMatch(/rgba\(0,\s*0,\s*0,\s*0\.70?\)/);
    expect(profile).toContain('canonicalProfile');
    expect(nutrition).toContain('ACTIVE_PUBLISHED');
    expect(tracker).toContain('Stress Test');
    expect(tracker).not.toContain('PSS-10');
    expect(phone).toContain('normalizePhoneNumber');
  });
});
