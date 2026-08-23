import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getIdentityScopedStorageKey } from '../src/utils/identityScopedStorage';
import {
  assertCanonicalIdentity,
  createClientBootstrapState,
  isCanonicalNoData,
  settleClientBootstrap
} from '../src/state/canonicalClientDataContract';

const repositoryRoot = process.cwd();
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), 'utf8');

test('FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT: canonical identity binds user and client', () => {
  expect(assertCanonicalIdentity({
    authenticatedUserId: 'user-qa',
    sessionUserId: 'user-qa',
    clientId: 'client-qa'
  })).toEqual({ userId: 'user-qa', clientId: 'client-qa' });
  expect(() => assertCanonicalIdentity({
    authenticatedUserId: 'user-a',
    sessionUserId: 'user-b',
    clientId: 'client-a'
  })).toThrow(/CANONICAL_IDENTITY_MISMATCH/);
});

test('FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT: only authoritative not-found means no data', () => {
  expect(isCanonicalNoData({ code: 'NOT_FOUND', status: 404 })).toBe(true);
  expect(isCanonicalNoData({ code: 'NETWORK_ERROR' })).toBe(false);
  expect(isCanonicalNoData({ code: 'SERVER_ERROR', status: 500 })).toBe(false);
});

test('FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT: resource errors block a release-ready bootstrap', () => {
  const initial = createClientBootstrapState();
  const ready = settleClientBootstrap({
    ...initial,
    profile: { status: 'READY', errorCode: null },
    nutrition: { status: 'NO_DATA', errorCode: null }
  });
  expect(ready.status).toBe('READY');
  const failed = settleClientBootstrap({
    ...ready,
    nutrition: { status: 'ERROR', errorCode: 'NETWORK_ERROR' }
  });
  expect(failed.status).toBe('ERROR');
});

test('FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT: session restore and user switch remain isolated', () => {
  const first = getIdentityScopedStorageKey('profile', { userId: 'user-a', clientId: 'client-a' });
  const second = getIdentityScopedStorageKey('profile', { userId: 'user-b', clientId: 'client-b' });
  expect(first).not.toBe(second);
  expect(getIdentityScopedStorageKey('profile', null)).toBe(null);
});

test('FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT: release surfaces retain canonical contracts', () => {
  const appContext = source('src/state/AppContext.tsx');
  const nutritionHub = source('src/screens/home/NutritionHubScreen.tsx');
  const profile = source('src/screens/home/ProfileScreen.tsx');
  const consultantRoutes = source('backend/src/modules/consultants/consultants.routes.ts');
  const authMiddleware = source('backend/src/modules/auth/auth.middleware.ts');
  const medicationService = source('backend/src/modules/medications/medications.service.ts');
  const navigation = source('src/navigation/AppNavigation.tsx');
  const splash = source('src/screens/auth/SplashScreen.tsx');

  expect(appContext).toMatch(/canonicalProfile/);
  expect(appContext).toMatch(/publishedNutritionPlan/);
  expect(appContext).toMatch(/STORAGE_KEYS\.medications/);
  expect(profile).toMatch(/canonicalProfile\.nutrition\.completionPercent/);
  expect(profile).not.toMatch(/Member Since<\/Text>.*onboarding\?\.createdAtISO/);
  expect(nutritionHub).toMatch(/ACTIVE_PUBLISHED/);
  expect(nutritionHub).toMatch(/Promise\.allSettled/);
  expect(consultantRoutes).toMatch(/requireConsultantAccount/);
  expect(authMiddleware).toMatch(/senior_consultant/);
  expect(medicationService).toMatch(/Asia\/Kolkata/);
  expect(navigation).toMatch(/FoodPreferences/);
  expect(navigation).toMatch(/OnboardingAssessment/);
  expect(splash).toMatch(/zestiva\.life\/assets\/Fiteatsy\.mp4/);
});
