import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('Onboarding V2 contract', () => {
  it('uses one shared phase shell and canonical phases', () => {
    const shell = read('src/components/onboarding/OnboardingShell.tsx');
    expect(shell).toContain("'BASICS' | 'LIFESTYLE' | 'RECOVERY' | 'CONNECT' | 'READY'");
    expect(shell).toContain('isReduceMotionEnabled');
    expect(shell).toContain('accessibilityLabel="Go back"');
    expect(shell).toContain("content: { flex: 1, width: '100%', paddingHorizontal: spacing.md }");
    expect(shell).toContain('paddingHorizontal: spacing.md');
    expect(shell).not.toContain('paddingHorizontal: spacing.lg');
  });

  it('preserves canonical profile and assessment writes', () => {
    const basics = read('src/screens/onboarding/OnboardingBasicsScreen.tsx');
    const assessment = read('src/screens/onboarding/OnboardingAssessmentScreen.tsx');
    expect(basics).toContain('normalizeOnboardingProfile');
    expect(basics).toContain('primaryConditions: selectedConditions');
    expect(basics).toContain('healthGoals: selectedGoals');
    expect(assessment).toContain('setAssessment({');
    expect(assessment).toContain('heightCm, currentWeightKg: weightKg');
    expect(assessment).toContain('void submitCheckIn');
    expect(assessment).toContain("navigation.navigate('FoodPreferences'");
    expect(basics).toContain("navigation.navigate('OnboardingAssessment'");
  });

  it('captures nutrition preferences in the lifestyle phase through the canonical API', () => {
    const screen = read('src/screens/onboarding/FoodPreferencesScreen.tsx');
    const flow = read('src/screens/onboarding/OnboardingFoodPreferencesFlow.tsx');
    expect(screen).toContain('saveFoodPreferences(profile)');
    expect(screen).toContain('OnboardingFoodPreferencesFlow');
    expect(screen).toContain("navigation.push('OnboardingAssessment', { startPhase: 'recovery'");
    expect(screen).toContain("phase: 'recovery', step: 1");
    expect(flow).toContain('initialStep');
    expect(flow).toContain('onProgress(step, profile)');
    expect(flow).toContain('phase="LIFESTYLE"');
    expect(flow).toContain('total={4}');
    expect(flow).toContain("update('dietType'");
    expect(flow).toContain("update('cuisines'");
    expect(flow).toContain("update('staplePreference'");
    expect(flow).toContain("update('dairyPreference'");
    expect(flow).toContain("update('proteins'");
    expect(flow).toContain('Foods to avoid');
    expect(flow).toContain('None selected');
    expect(flow).toContain("saveFailed ? 'Try again'");
    expect(screen).toContain("We couldn't save your preferences.");
    expect(screen).toContain('Your selections are still here. Please try again.');
  });

  it('resumes the client-scoped canonical onboarding phase and step', () => {
    const progress = read('src/services/onboardingRuntimeProgress.ts');
    const splash = read('src/screens/auth/SplashScreen.tsx');
    const assessment = read('src/screens/onboarding/OnboardingAssessmentScreen.tsx');
    const ready = read('src/screens/onboarding/OnboardingReadyScreen.tsx');
    expect(progress).toContain('fiteatsy.onboarding.runtime.v2:${clientId}');
    expect(splash).toContain("progress?.phase === 'food'");
    expect(splash).toContain("progress?.phase === 'recovery'");
    expect(splash).toContain("progress?.phase === 'connect'");
    expect(assessment).toContain("phase: step <= 4 ? 'lifestyle' : 'recovery'");
    expect(ready).toContain('clearOnboardingRuntimeProgress');
  });

  it('keeps platform connectivity and consultant readiness truthful', () => {
    const sync = read('src/screens/sync/SyncWearableScreen.tsx');
    const ready = read('src/screens/onboarding/OnboardingReadyScreen.tsx');
    expect(sync).toContain("Platform.OS === 'android'");
    expect(sync).toContain('Apple Health is not available in this build');
    expect(ready).toContain("Boolean(onboarding?.assignedConsultantId)");
    expect(ready).toContain("consultantReady ? 'Ready' : 'Pending'");
  });
});
