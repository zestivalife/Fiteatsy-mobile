jest.mock('../src/services/apiClient',()=>({
  ApiClientError:class ApiClientError extends Error{code:string;status?:number;constructor(code:string,message:string,status?:number){super(message);this.code=code;this.status=status;}},
  apiFetch:jest.fn(),apiBaseUrl:'https://example.test'
}));
jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn(),setItem:jest.fn(),removeItem:jest.fn(),multiGet:jest.fn(),multiSet:jest.fn()}));
jest.mock('@react-native-community/netinfo',()=>({addEventListener:jest.fn(()=>()=>{}),fetch:jest.fn()}));
jest.mock('expo-background-task',()=>({registerTaskAsync:jest.fn(),unregisterTaskAsync:jest.fn(),BackgroundTaskResult:{Success:'Success',Failed:'Failed'}}),{virtual:true});
jest.mock('expo-task-manager',()=>({defineTask:jest.fn(),isTaskDefined:jest.fn(()=>false),isTaskRegisteredAsync:jest.fn()}),{virtual:true});

import type { CandidateStarOrbValidation } from '../src/services/healthIntelligenceService';
import {
  candidateResponseToHomeSnapshot,
  mergeCandidateIntoCanonicalSnapshot,
  reconcileCandidateHomeSnapshot,
  resolveAuthoritativeHealthScore,
  shouldPreserveAccountScopedSnapshot
} from '../src/services/canonicalHealthSyncCoordinator';

const candidateScore = (healthDay: string, value: number | null, calculatedAt: string) => ({
  domain: 'recovery', score: value, status: value == null ? 'METHODOLOGY_PENDING' as const : 'CALCULATED' as const,
  methodologyId: 'STAR_ORB_V1', methodologyVersion: 'STAR_ORB_V1', healthDay, calculatedAt,
  confidence: 'HIGH' as const, inputFreshness: 'CURRENT', inputsUsed: [], inputsMissing: [],
  contributingFactors: [], explanation: 'test', activation: 'CANDIDATE_ONLY' as const, clinicalValidation: 'PENDING' as const
});
const response = (healthDay: string, value: number | null, calculatedAt: string): CandidateStarOrbValidation => {
  const recovery = candidateScore(healthDay, value, calculatedAt);
  return { activation: 'ISOLATED_VALIDATION_ONLY', methodologyVersion: 'STAR_ORB_V1', sourceCoverage: {}, days: [{
    healthDay, activity: { ...recovery, domain: 'activity' }, sleep: { ...recovery, domain: 'sleep' },
    nourishment: { ...recovery, domain: 'nourishment' }, calm: { ...recovery, domain: 'calm' },
    mind: { ...recovery, domain: 'mind' }, recovery,
    proposals: {
      everydayNourishment: { score: null, status: 'UNAVAILABLE', version: 'proposal' },
      selfReportedMindWellness: { score: null, status: 'UNAVAILABLE', version: 'proposal' }
    }
  }] };
};

test('an older asynchronous response cannot replace a newer calculated snapshot', () => {
  const newer = candidateResponseToHomeSnapshot(response('2026-11-22', 62, '2026-11-22T10:05:00.000Z'));
  const older = candidateResponseToHomeSnapshot(response('2026-11-22', null, '2026-11-22T10:04:00.000Z'));
  expect(reconcileCandidateHomeSnapshot(newer, older)?.scores.recovery.score).toBe(62);
});

test('a newer confirmed invalidation replaces the old numerical score', () => {
  const calculated = candidateResponseToHomeSnapshot(response('2026-11-22', 62, '2026-11-22T10:04:00.000Z'));
  const invalidated = candidateResponseToHomeSnapshot(response('2026-11-22', null, '2026-11-22T10:05:00.000Z'));
  const result = reconcileCandidateHomeSnapshot(calculated, invalidated);
  expect(result?.scores.recovery.score).toBeNull();
  expect(result?.scores.recovery.status).toBe('METHODOLOGY_PENDING');
});

test('partial same-methodology history is merged by health day using latest daily evidence', () => {
  const first = candidateResponseToHomeSnapshot(response('2026-11-21', 60, '2026-11-21T10:00:00.000Z'));
  const second = candidateResponseToHomeSnapshot(response('2026-11-22', 62, '2026-11-22T10:00:00.000Z'));
  expect(reconcileCandidateHomeSnapshot(first, second)?.recoveryTrend.map((day) => [day.dayKey, day.score])).toEqual([
    ['2026-11-21', 60], ['2026-11-22', 62]
  ]);
});

test('hydration preserves data only for the identical account scope', () => {
  expect(shouldPreserveAccountScopedSnapshot('account:a:apple', 'account:a:apple')).toBe(true);
  expect(shouldPreserveAccountScopedSnapshot('account:a:apple', 'account:b:apple')).toBe(false);
  expect(shouldPreserveAccountScopedSnapshot('account:a:apple', null)).toBe(false);
});

test('latest candidate scores are persisted into the account-scoped canonical launch snapshot', () => {
  const incoming = candidateResponseToHomeSnapshot(response('2026-11-22', 71, '2026-11-22T10:05:00.000Z'));
  const pending = candidateScore('2026-11-22', null, '2026-11-22T10:00:00.000Z');
  const current = {
    calculationVersion: 'HEALTH_INTELLIGENCE_V1',
    calculatedAt: '2026-11-22T10:00:00.000Z',
    inputWindow: { startAtISO: null, endAtISO: null },
    inputFreshness: 'CURRENT',
    source: 'CACHED_CANONICAL_SERVER',
    scores: {
      activity: pending, sleep: pending, nutrition: pending, calm: pending,
      stressRecovery: pending, recovery: pending, cycle: pending, mind: pending,
      healthIntelligence: pending
    }
  } as any;
  const merged = mergeCandidateIntoCanonicalSnapshot(current, incoming);
  expect(merged?.scores.recovery.score).toBe(71);
  expect(merged?.scores.activity.score).toBe(71);
  expect(merged?.scores.activity.calculationVersion).toBe('STAR_ORB_V1');
  expect(merged?.source).toBe('CACHED_RECONCILED_SCORES');
  expect(merged?.scores.healthIntelligence).toBe(current.scores.healthIntelligence);
  expect(merged?.calculatedAt).toBe('2026-11-22T10:05:00.000Z');
});

const authorityScore = (
  score: number | null,
  calculationVersion: string,
  calculatedAt: string,
  freshness: 'CURRENT' | 'STALE' | 'UNKNOWN' = 'CURRENT'
) => ({
  score,
  status: score == null ? 'METHODOLOGY_PENDING' as const : 'CALCULATED' as const,
  confidence: 'HIGH' as const,
  freshness,
  calculationVersion,
  calculatedAt
});
const authorityContext = (methodologyVersion: string | null = 'STAR_ORB_V1') => ({
  activation: 'ISOLATED_VALIDATION_ONLY' as const,
  methodologyVersion
});

test('same-methodology candidate newer than canonical is authoritative', () => {
  const candidate = authorityScore(72, 'STAR_ORB_V1', '2026-11-22T10:05:00.000Z');
  const canonical = authorityScore(68, 'STAR_ORB_V1', '2026-11-22T10:04:00.000Z');
  expect(resolveAuthoritativeHealthScore(candidate, canonical, authorityContext())).toBe(candidate);
});

test('same-methodology canonical newer than candidate is authoritative', () => {
  const candidate = authorityScore(68, 'STAR_ORB_V1', '2026-11-22T10:04:00.000Z');
  const canonical = authorityScore(72, 'STAR_ORB_V1', '2026-11-22T10:05:00.000Z');
  expect(resolveAuthoritativeHealthScore(candidate, canonical, authorityContext())).toBe(canonical);
});

test('eligible production Star Orb remains authoritative over an incompatible canonical methodology', () => {
  const candidate = authorityScore(68, 'STAR_ORB_V1', '2026-11-22T10:04:00.000Z');
  const canonical = authorityScore(72, 'HEALTH_INTELLIGENCE_V1', '2026-11-22T10:05:00.000Z');
  expect(resolveAuthoritativeHealthScore(candidate, canonical, authorityContext())).toBe(candidate);
});

test('invalid or incomparable candidate provenance falls back to canonical', () => {
  const canonical = authorityScore(72, 'HEALTH_INTELLIGENCE_V1', '2026-11-22T10:05:00.000Z');
  expect(resolveAuthoritativeHealthScore(
    authorityScore(68, 'STAR_ORB_V1', 'not-a-time'), canonical, authorityContext()
  )).toBe(canonical);
  expect(resolveAuthoritativeHealthScore(
    authorityScore(68, 'OTHER_VERSION', '2026-11-22T10:06:00.000Z'), canonical, authorityContext()
  )).toBe(canonical);
  expect(resolveAuthoritativeHealthScore(
    authorityScore(68, 'STAR_ORB_V1', '2026-11-22T10:06:00.000Z'), canonical, authorityContext(null)
  )).toBe(canonical);
});

test('newer confirmed invalidation wins inside the same methodology', () => {
  const invalidated = authorityScore(null, 'STAR_ORB_V1', '2026-11-22T10:06:00.000Z');
  const available = authorityScore(72, 'STAR_ORB_V1', '2026-11-22T10:05:00.000Z');
  expect(resolveAuthoritativeHealthScore(invalidated, available, authorityContext())).toBe(invalidated);
});

test('equal-methodology and equal-time scores use freshness as a deterministic tie-breaker', () => {
  const stale = authorityScore(68, 'STAR_ORB_V1', '2026-11-22T10:05:00.000Z', 'STALE');
  const current = authorityScore(72, 'STAR_ORB_V1', '2026-11-22T10:05:00.000Z', 'CURRENT');
  expect(resolveAuthoritativeHealthScore(stale, current, authorityContext())).toBe(current);
});
