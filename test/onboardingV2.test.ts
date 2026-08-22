import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('Onboarding V2 contract', () => {
  it('uses one shared phase shell and canonical phases', () => {
    const shell = read('src/components/onboarding/OnboardingShell.tsx');
    expect(shell).toContain("'BASICS' | 'LIFESTYLE' | 'RECOVERY' | 'CONNECT' | 'READY'");
    expect(shell).toContain('isReduceMotionEnabled');
    expect(shell).toContain('accessibilityLabel="Go back"');
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
