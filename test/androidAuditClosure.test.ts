import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('Android UX and reliability closure contract', () => {
  it('keeps Health Connect explicit, bounded and free of automatic/store detours', () => {
    const screen = read('src/screens/sync/SyncWearableScreen.tsx');
    const service = read('src/services/healthConnectService.ts');

    expect(screen).not.toContain('AppState.addEventListener');
    expect(screen).not.toContain('Google Fit');
    expect(screen).not.toContain("Linking.openURL('market:");
    expect(screen).toContain("title: 'Connected to Health Connect'");
    expect(screen).toContain("title: 'Connected — no recent health data found'");
    expect(screen).toContain("? 'Review permissions'");
    expect(screen).toContain("'Continue with available data'");
    expect(screen).toContain("'Last synced: '");
    expect(screen).toContain("'Last sync attempt: '");
    expect(screen).toContain("title=\"Set up later\"");
    expect(screen).toContain("setStatusBody('After installing or updating Health Connect, return here and tap Try again.')");
    expect(service).toContain('withHealthConnectTimeout(readRecords(');
    expect(service).toContain('withHealthConnectTimeout(getSdkStatus()');
    expect(service).toContain('withHealthConnectTimeout(initialize()');
    expect(service).toContain('withHealthConnectTimeout(getGrantedPermissions()');
    expect(service).not.toMatch(/sdkStatus = await getSdkStatus\(\)/);
    expect(service).not.toMatch(/initialized = await initialize\(\)/);
    expect(service).not.toMatch(/granted = \(await getGrantedPermissions\(\)\)/);
  });

  it('keeps preference saves single-flight, recoverable and selection preserving', () => {
    const screen = read('src/screens/onboarding/FoodPreferencesScreen.tsx');
    const flow = read('src/screens/onboarding/OnboardingFoodPreferencesFlow.tsx');
    const service = read('src/services/foodPreferenceService.ts');

    expect(screen).toContain('saveInFlight.current');
    expect(screen).toContain("setSaveState('saving')");
    expect(screen).toContain("setSaveState('success')");
    expect(screen).toContain("setSaveState('error_recoverable')");
    expect(screen).toContain('Your selections are still here. Please try again.');
    expect(flow).toContain("pointerEvents={saving ? 'none' : 'auto'}");
    expect(flow).toContain('disabled={saving || !profile.dietType}');
    expect(service).toContain('foodPreferencesMatch');
    for (const code of ['TIMEOUT', 'NETWORK_ERROR', 'SERVER_ERROR', 'CONFLICT']) {
      expect(service).toContain(`error.code === '${code}'`);
    }
    expect(service).not.toContain('putJson<FoodPreferenceResponse>(FOOD_PREFERENCES_PATH, profile);\n      return putJson');
  });

  it('keeps onboarding keyboard-safe, accessible and restart-aware', () => {
    const shell = read('src/components/onboarding/OnboardingShell.tsx');
    const assessment = read('src/screens/onboarding/OnboardingAssessmentScreen.tsx');
    const progress = read('src/services/onboardingRuntimeProgress.ts');
    const ready = read('src/screens/onboarding/OnboardingReadyScreen.tsx');

    expect(shell).toContain("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}");
    expect(shell).toContain('keyboardShouldPersistTaps="handled"');
    expect(shell).toContain('accessibilityLabel={`Step ${step} of ${total}`}');
    expect(assessment).toContain('keyboardType="decimal-pad"');
    expect(assessment).toContain('accessibilityRole="radio"');
    expect(assessment).toContain('Keyboard.dismiss()');
    expect(progress).toContain('fiteatsy.onboarding.runtime.v2:${clientId}');
    expect(ready).toContain('clearOnboardingRuntimeProgress');
  });
});
