import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('logout and re-login routing contract', () => {
  const context = read('src/state/AppContext.tsx');
  const signIn = read('src/screens/auth/SignInScreen.tsx');
  const splash = read('src/screens/auth/SplashScreen.tsx');

  test('logout preserves identity-scoped completed-onboarding evidence', () => {
    const logout = context.slice(context.indexOf('const logout = useCallback'), context.indexOf('\n\n\n  useEffect', context.indexOf('const logout = useCallback')));
    expect(logout).toContain('setWearableSetupCompletedState(false)');
    expect(logout).not.toContain('setWearableSetupCompleted(false)');
    expect(logout).toContain('identity-scoped completion');
  });

  test('re-login restores only the authenticated account completion before navigation', () => {
    const completion = context.slice(context.indexOf('const completeAuthentication'), context.indexOf('\n\n  useEffect(() => {\n    registerAccessTokenProvider'));
    expect(completion).toContain('getSessionScopedKey(key, localSession)');
    expect(completion).toContain("storedWearableSetupCompleted === '1'");
    expect(completion).toContain('cachedCanonicalProfile?.profile.userId === localSession.accountId');
    expect(completion).toContain("setOnboardingStatus('COMPLETED')");
    expect(completion).toContain("AsyncStorage.setItem(completionKey, '1')");
  });

  test('remote reconciliation cannot downgrade established completion', () => {
    const completion = context.slice(context.indexOf('const completeAuthentication'), context.indexOf('\n\n  useEffect(() => {\n    registerAccessTokenProvider'));
    expect(completion).toMatch(/if \(!hasCompletedAppShell\) \{\s*const gate = deriveOnboardingGate\(remoteBundle\.profile\)/);
    expect(completion).toContain('isCanonicalNoData(error) && !hasCompletedAppShell');
  });

  test('login always resets navigation through the visible React splash', () => {
    expect(signIn).toContain("navigation.reset({ index: 0, routes: [{ name: 'Splash' }] })");
    expect(splash).toContain('SPLASH_MIN_DURATION_MS = 1_200');
    expect(splash).toContain("navigation.replace('Main')");
  });
});
