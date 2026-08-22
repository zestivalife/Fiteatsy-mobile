import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getIdentityScopedStorageKey } from '../src/utils/identityScopedStorage';
import {
  assertCanonicalIdentity,
  createClientBootstrapState,
  isCanonicalNoData,
  settleClientBootstrap
} from '../src/state/canonicalClientDataContract';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), 'utf8');

test('FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT: canonical identity binds user and client', () => {
  assert.deepEqual(assertCanonicalIdentity({
    authenticatedUserId: 'user-qa',
    sessionUserId: 'user-qa',
    clientId: 'client-qa'
  }), { userId: 'user-qa', clientId: 'client-qa' });
  assert.throws(() => assertCanonicalIdentity({
    authenticatedUserId: 'user-a',
    sessionUserId: 'user-b',
    clientId: 'client-a'
  }), /CANONICAL_IDENTITY_MISMATCH/);
});

test('FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT: only authoritative not-found means no data', () => {
  assert.equal(isCanonicalNoData({ code: 'NOT_FOUND', status: 404 }), true);
  assert.equal(isCanonicalNoData({ code: 'NETWORK_ERROR' }), false);
  assert.equal(isCanonicalNoData({ code: 'SERVER_ERROR', status: 500 }), false);
});

test('FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT: resource errors block a release-ready bootstrap', () => {
  const initial = createClientBootstrapState();
  const ready = settleClientBootstrap({
    ...initial,
    profile: { status: 'READY', errorCode: null },
    nutrition: { status: 'NO_DATA', errorCode: null }
  });
  assert.equal(ready.status, 'READY');
  const failed = settleClientBootstrap({
    ...ready,
    nutrition: { status: 'ERROR', errorCode: 'NETWORK_ERROR' }
  });
  assert.equal(failed.status, 'ERROR');
});

test('FITEATSY_CANONICAL_CLIENT_DATA_CONTRACT: session restore and user switch remain isolated', () => {
  const first = getIdentityScopedStorageKey('profile', { userId: 'user-a', clientId: 'client-a' });
  const second = getIdentityScopedStorageKey('profile', { userId: 'user-b', clientId: 'client-b' });
  assert.notEqual(first, second);
  assert.equal(getIdentityScopedStorageKey('profile', null), null);
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

  assert.match(appContext, /canonicalProfile/);
  assert.match(appContext, /publishedNutritionPlan/);
  assert.match(appContext, /STORAGE_KEYS\.medications/);
  assert.match(profile, /canonicalProfile\.nutrition\.completionPercent/);
  assert.doesNotMatch(profile, /Member Since<\/Text>.*onboarding\?\.createdAtISO/);
  assert.match(nutritionHub, /ACTIVE_PUBLISHED/);
  assert.match(nutritionHub, /Promise\.allSettled/);
  assert.match(consultantRoutes, /requireConsultantAccount/);
  assert.match(authMiddleware, /senior_consultant/);
  assert.match(medicationService, /Asia\/Kolkata/);
  assert.match(navigation, /FoodPreferences/);
  assert.match(navigation, /OnboardingAssessment/);
  assert.match(splash, /zestiva\.life\/assets\/Fiteatsy\.mp4/);
});
