import {
  calculateCanonicalHealthIntelligence,
  preferCanonicalHealthSnapshot,
  type LocalCanonicalHealthSnapshot
} from '../src/services/localHealthIntelligence';

const emptyInputs = {
  activity: {}, sleep: {}, nutrition: {}, calm: {}, stressRecovery: {}, recovery: {}, cycle: { applicable: false }
};

const calculatedServerSnapshot = (): LocalCanonicalHealthSnapshot => {
  const snapshot = calculateCanonicalHealthIntelligence({
    ...emptyInputs,
    activity: { steps: 8_000, stepGoal: 10_000, exerciseMinutes: 30, exerciseTarget: 30, balance: 70, freshness: 'CURRENT' }
  });
  return { ...snapshot, source: 'CACHED_CANONICAL_SERVER' };
};

describe('canonical health snapshot precedence', () => {
  test('a calculated canonical server snapshot replaces an uncalculated local placeholder', () => {
    const local = calculateCanonicalHealthIntelligence(emptyInputs);
    const server = calculatedServerSnapshot();
    expect(local.scores.activity.score).toBeNull();
    expect(server.scores.activity.score).not.toBeNull();
    expect(preferCanonicalHealthSnapshot(local, server)).toBe(server);
  });

  test('a calculated local snapshot remains authoritative over a delayed server response', () => {
    const local = { ...calculatedServerSnapshot(), source: 'LOCAL_CANONICAL_INPUTS' as const };
    const server = { ...calculateCanonicalHealthIntelligence(emptyInputs), source: 'CACHED_CANONICAL_SERVER' as const };
    expect(preferCanonicalHealthSnapshot(local, server)).toBe(local);
  });
});
