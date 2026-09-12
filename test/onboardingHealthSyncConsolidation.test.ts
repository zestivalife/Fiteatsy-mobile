import fs from 'node:fs';
import path from 'node:path';
import { deriveOnboardingGate } from '../src/utils/onboardingGate';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('returning-user bootstrap and canonical Health Data Sync', () => {
  test('legacy materially complete profiles backfill onboarding completion', () => {
    expect(deriveOnboardingGate({
      dateOfBirthISO: '1990-01-01', gender: 'Female', heightCm: 165, currentWeightKg: 62
    })).toEqual({ status: 'COMPLETED', resumeStep: null });
  });

  test('incomplete and absent profiles remain explicitly classified', () => {
    expect(deriveOnboardingGate(null)).toEqual({ status: 'NOT_STARTED', resumeStep: 'basics' });
    expect(deriveOnboardingGate({
      dateOfBirthISO: '1990-01-01', gender: 'Female', heightCm: null, currentWeightKg: 62
    })).toEqual({ status: 'IN_PROGRESS', resumeStep: 'anthropometrics' });
  });

  test('completed users ignore stale onboarding runtime progress', () => {
    const splash = read('src/screens/auth/SplashScreen.tsx');
    expect(splash).toContain("onboardingStatus === 'COMPLETED'\n      ? null");
    expect(splash).toContain("onboardingStatus !== 'COMPLETED' && progress?.phase === 'connect'");
    expect(splash).toContain("isAuthenticated && onboardingStatus === 'UNKNOWN'");
  });

  test('all navigation entries use the one canonical screen', () => {
    const navigation = read('src/navigation/AppNavigation.tsx');
    const assessment = read('src/screens/onboarding/OnboardingAssessmentScreen.tsx');
    const routing = read('src/services/healthSyncRouting.ts');
    const canonical = read('src/screens/sync/HealthDataSyncScreen.tsx');
    expect(navigation).toContain('<Stack.Screen name="HealthDataSync" component={HealthDataSyncScreen} />');
    expect(navigation).not.toContain('<Stack.Screen name="SyncWearable"');
    expect(assessment).toContain("navigation.navigate('HealthDataSync', { entryContext: 'ONBOARDING' })");
    expect(routing).not.toContain("'SyncWearable'");
    expect(canonical).toContain("import { HealthDataSyncExperience } from './SyncWearableScreen'");
    expect(canonical).toContain("entryContext==='ONBOARDING'||(!loading&&!connected)");
  });

  test('setup later is governed by entry context, not connection state', () => {
    const experience = read('src/screens/sync/SyncWearableScreen.tsx');
    expect(experience).toContain("const entryContext = route.params?.entryContext ?? 'HOME'");
    expect(experience).toContain("const isOnboardingEntry = entryContext === 'ONBOARDING'");
    expect(experience).toContain('if (isOnboardingEntry)');
    expect(experience).toContain('setWearableSetupCompleted(true)');
    expect(experience).toContain('clearOnboardingRuntimeProgress');
  });
});
