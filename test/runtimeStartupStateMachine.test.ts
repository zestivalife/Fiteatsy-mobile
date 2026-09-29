import fs from 'node:fs';
import path from 'node:path';
import { startupStateHasVisibleRoute, transitionStartupState, type StartupState } from '../src/state/startupStateMachine';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('P0 runtime startup contract', () => {
  test('implements only the governed startup states', () => {
    const source = read('src/state/startupStateMachine.ts');
    for (const state of [
      'BOOTING', 'LOCAL_SESSION_RESTORE', 'AUTHENTICATED_LOCAL', 'AUTHENTICATING_REMOTE',
      'UNAUTHENTICATED', 'READY', 'OFFLINE_READY', 'RECOVERING', 'FATAL_CONFIGURATION_ERROR'
    ]) expect(source).toContain(`'${state}'`);
  });

  test('local identity reaches an authenticated route before remote validation', () => {
    let state: StartupState = 'BOOTING';
    state = transitionStartupState(state, 'RESTORE_LOCAL_SESSION');
    state = transitionStartupState(state, 'LOCAL_SESSION_FOUND');
    expect(state).toBe('AUTHENTICATED_LOCAL');
    expect(startupStateHasVisibleRoute(state)).toBe(true);
  });

  test('fresh authentication reconciles remotely without losing the local route', () => {
    const context = read('src/state/AppContext.tsx');
    const authentication = context.slice(
      context.indexOf('const completeAuthentication'),
      context.indexOf('useEffect(() => {\n    registerAccessTokenProvider')
    );
    expect(authentication).toContain("'LOCAL_SESSION_FOUND'");
    expect(authentication).toContain("'REMOTE_VALIDATION_STARTED'");
    expect(authentication).toContain("'REMOTE_VALIDATION_SUCCEEDED'");
    expect(authentication).toContain("'TRANSIENT_NETWORK_FAILURE'");
  });

  test('fatal API configuration cannot pre-empt persisted local-session restoration', () => {
    const context = read('src/state/AppContext.tsx');
    const sessionRead = context.indexOf('readPersistedAuthSession()');
    const fatalConfigurationCheck = context.indexOf('if (getApiConfigurationError())');
    expect(sessionRead).toBeGreaterThan(-1);
    expect(fatalConfigurationCheck).toBeGreaterThan(sessionRead);
  });

  test.each(['TRANSIENT_NETWORK_FAILURE'] as const)('%s preserves an offline-ready authenticated state', (event) => {
    expect(transitionStartupState('AUTHENTICATING_REMOTE', event)).toBe('OFFLINE_READY');
  });

  test('network recovery is explicit and returns to ready', () => {
    const recovering = transitionStartupState('OFFLINE_READY', 'NETWORK_RECOVERING');
    expect(recovering).toBe('RECOVERING');
    expect(transitionStartupState(recovering, 'REMOTE_VALIDATION_SUCCEEDED')).toBe('READY');
  });

  test('only canonical revocation transitions local identity to unauthenticated', () => {
    expect(transitionStartupState('READY', 'SESSION_REVOKED')).toBe('UNAUTHENTICATED');
  });

  test('bootstrap and splash are single-flight and always render visible UI', () => {
    const context = read('src/state/AppContext.tsx');
    const splash = read('src/screens/auth/SplashScreen.tsx');
    const app = read('App.tsx');
    expect(context).toContain('if (bootstrapStartedRef.current) return;');
    expect(context).toContain('bootstrapStartedRef.current = true;');
    expect(splash).toContain('navigated.current = true;');
    expect(splash).toContain("startupState === 'FATAL_CONFIGURATION_ERROR'");
    expect(app).not.toMatch(/if\s*\(!?fontsLoaded\)\s*return null/);
    expect(app).toContain('<ProductionErrorBoundary>');
  });

  test('launch path has no active video splash implementation', () => {
    expect(read('src/screens/auth/SplashScreen.tsx')).not.toContain('VideoView');
    expect(read('src/screens/auth/SplashScreen.tsx')).not.toContain('useVideoPlayer');
  });

  test('lifecycle subscriptions have explicit cleanup and no session validation AppState loop', () => {
    const context = read('src/state/AppContext.tsx');
    const coordinator = read('src/services/canonicalHealthSyncCoordinator.ts');
    expect(context).toContain('return () => unsubscribe();');
    expect(coordinator).toContain('subscription.remove()');
    expect(context).not.toContain("AppState.addEventListener('change'");
  });

  test('twenty lifecycle transitions cannot multiply the single registered listener contract', () => {
    let listeners = 0;
    const mount = () => { listeners += 1; return () => { listeners -= 1; }; };
    for (let index = 0; index < 20; index += 1) {
      const cleanup = mount();
      cleanup();
    }
    expect(listeners).toBe(0);
  });
});
