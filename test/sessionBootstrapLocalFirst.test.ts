import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('local-first session and bootstrap contract', () => {
  test('authentication requests are bounded and abortable', () => {
    const auth = read('src/services/authService.ts');
    expect(auth).toContain('AUTH_REQUEST_TIMEOUT_MS = 15_000');
    expect(auth).toContain('const controller = new AbortController()');
    expect(auth).toContain("new AuthServiceError('TIMEOUT'");
    expect(auth).toContain("callerSignal?.addEventListener('abort'");
  });

  test('successful credential persistence is the end of the blocking login transaction', () => {
    const context = read('src/state/AppContext.tsx');
    const completion = context.slice(
      context.indexOf('const completeAuthentication'),
      context.indexOf('useEffect(() => {\n    registerAccessTokenProvider')
    );
    expect(completion).toContain('await persistAuthSession(localSession)');
    expect(completion).toContain('void (async () => {');
    expect(completion.indexOf('await persistAuthSession(localSession)')).toBeLessThan(completion.indexOf('getCurrentAuthSession'));
  });

  test('local session restore precedes notification and remote domain work', () => {
    const context = read('src/state/AppContext.tsx');
    const bootstrap = context.slice(context.indexOf('const bootstrap = async () =>'));
    expect(bootstrap.indexOf('readPersistedAuthSession()')).toBeLessThan(bootstrap.indexOf('initMedicationNotifications()'));
    expect(bootstrap.indexOf('setBootstrapped(true)')).toBeLessThan(bootstrap.indexOf('getCurrentAuthSession(sessionForStorage.sessionToken)'));
    expect(bootstrap.indexOf('setBootstrapped(true)')).toBeLessThan(bootstrap.indexOf('getPlatformHealthProfile(sessionForStorage.sessionToken)'));
    expect(bootstrap.indexOf('setBootstrapped(true)')).toBeLessThan(bootstrap.indexOf('getPublishedNutritionPlan()'));
  });

  test('returning-user UNKNOWN onboarding state routes to the authenticated shell', () => {
    const splash = read('src/screens/auth/SplashScreen.tsx');
    expect(splash).toContain("if (onboardingStatus === 'UNKNOWN')");
    expect(splash).toContain("navigation.replace('Main')");
    expect(splash).not.toContain("if (isAuthenticated && onboardingStatus === 'UNKNOWN') return");
  });

  test('generic transport and domain failures cannot clear authentication', () => {
    const context = read('src/state/AppContext.tsx');
    expect(context).toContain("serverCode === 'SESSION_REVOKED'");
    expect(context).toContain("serverCode === 'ACCOUNT_DISABLED'");
    expect(context).toContain("serverCode === 'SESSION_EXPIRED'");
    expect(context).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*clearPersistedAuth/);
  });

  test('session and cached domains remain identity-scoped', () => {
    const context = read('src/state/AppContext.tsx');
    expect(context).toContain('getIdentityScopedStorageKey');
    expect(context).toContain('userId: session.accountId');
    expect(context).toContain('clientId: session.client.fiteatsyClientId');
    expect(context).toContain('CANONICAL_IDENTITY_MISMATCH');
  });

  test('PIN login allows only one active request and cancels it on unmount', () => {
    const signIn = read('src/screens/auth/SignInScreen.tsx');
    expect(signIn).toContain('if (loading || loginRequestRef.current) return;');
    expect(signIn).toContain('loginRequestRef.current?.abort();');
    expect(signIn).toContain('{ signal: requestController.signal }');
  });

  test('the token-bearing session has one secure persisted authority with legacy migration', () => {
    const store = read('src/services/authSessionStore.ts');
    const context = read('src/state/AppContext.tsx');
    expect(store).toContain("import * as SecureStore from 'expo-secure-store'");
    expect(store).toContain('WHEN_UNLOCKED_THIS_DEVICE_ONLY');
    expect(store).toContain('One-time migration');
    expect(context).toContain('readPersistedAuthSession()');
    expect(context).toContain('writePersistedAuthSession(JSON.stringify(session))');
    expect(context).not.toContain('AsyncStorage.setItem(STORAGE_KEYS.auth');
  });
});
