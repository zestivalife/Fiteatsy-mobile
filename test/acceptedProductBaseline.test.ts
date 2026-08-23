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

  it('FITEATSY_SPLASH_CONTRACT keeps the approved video-first cold-launch experience', () => {
    const splash = read('src/screens/auth/SplashScreen.tsx');
    const config = JSON.parse(read('app.json'));

    expect(splash).toContain('https://zestiva.life/assets/Fiteatsy.mp4');
    expect(splash).toMatch(/rgba\(0,\s*0,\s*0,\s*0\.70?\)/);
    expect(splash).toContain('SPLASH_MAX_DURATION_MS = 10_000');
    expect(config.expo.runtimeVersion).toBe('1.0.0-native-20260823-video');
  });

  it('FITEATSY_NUTRITION_CONTRACT exposes only the canonical published lifecycle', () => {
    const nutrition = read('src/screens/home/NutritionHubScreen.tsx');
    const delivery = read('backend/src/modules/nutrition/nutrition.service.ts');

    expect(nutrition).toContain('ACTIVE_PUBLISHED');
    expect(delivery).toContain("return 'ACTIVE_PUBLISHED' as const");
    expect(delivery).toContain("if (deliveryLifecycle === 'ACTIVE_PUBLISHED' && publishedVersion)");
  });

  it('FITEATSY_PHONE_IDENTITY_CONTRACT keeps one digits-only operational identity', () => {
    const mobilePhone = read('src/utils/phone.ts');
    const backendPhone = read('backend/src/utils/phone.ts');
    const migration = read('backend/src/db/migrations/0038_canonical_operational_phone_identity.sql');

    expect(mobilePhone).toContain('normalizePhoneNumber');
    expect(backendPhone).toContain('normalizePhoneNumber');
    expect(migration).toContain('users_mobile_number_normalized_digits_only');
  });

  it('FITEATSY_DIET_REVIEW_WORKFLOW_CONTRACT preserves submit, review, approval, and publish gating', () => {
    const routes = read('backend/src/modules/nutrition/nutrition.routes.ts');
    const service = read('backend/src/modules/nutrition/nutrition.service.ts');
    const migration = read('backend/src/db/migrations/0034_simple_consultant_approval_workflow.sql');

    expect(routes).toContain("'/clients/:clientId/diet-plans/:dietPlanId/submit-review'");
    expect(service).toContain("assertLifecycleTransition(version.lifecycleStatus, 'submitted_for_review')");
    expect(migration).toContain("'submitted_for_review', 'changes_requested', 'resubmitted', 'approved', 'published'");
  });

  it('FITEATSY_HEALTH_DATA_SYNC_CONTRACT retains native permissions and user-scoped ingestion', () => {
    const config = read('app.json');
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const service = read('src/services/healthConnectService.ts');

    expect(config).toContain('react-native-health-connect');
    expect(manifest).toContain('android.permission.health.READ_STEPS');
    expect(manifest).toContain('android.permission.health.READ_SLEEP');
    expect(service).toContain('syncFromHealthConnect');
  });

  it('keeps canonical profile and Stress Test ownership', () => {
    const profile = read('src/screens/home/ProfileScreen.tsx');
    const tracker = read('src/screens/home/TrackerScreen.tsx');

    expect(profile).toContain('canonicalProfile');
    expect(tracker).toContain('Stress Test');
    expect(tracker).not.toContain('PSS-10');
  });
});
