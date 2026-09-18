import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('health score status contract', () => {
  it('preserves governed null-score statuses through persistence', () => {
    const canonical = source('backend/src/modules/intelligence/canonical-health-calculation-engine.ts');
    const repository = source('backend/src/modules/intelligence/health-scores.repository.ts');
    expect(canonical).toContain('scoreStatus: persistedStatus(value.status)');
    for (const status of ['no_data', 'insufficient_data', 'methodology_pending', 'not_applicable', 'stale', 'offline', 'error']) {
      expect(repository).toContain(`'${status}'`);
    }
  });

  it('presents framework states distinctly on Home', () => {
    const home = source('src/screens/home/HomeScreen.tsx');
    const shared = source('packages/health-intelligence/src/index.ts');
    expect(home).toContain("import { canonicalHealthStatusLabel } from '@fiteatsy/health-intelligence'");
    expect(home).toContain('frameworkStatusLabel = canonicalHealthStatusLabel');
    expect(shared).toContain("METHODOLOGY_PENDING:'Methodology pending'");
    expect(shared).toContain("NOT_APPLICABLE:'Not applicable'");
    expect(shared).toContain("INSUFFICIENT_DATA:'Not enough data'");
    expect(shared).toContain("NO_DATA:'No data yet'");
    expect(home).toContain('stateFromScore(selected.score, selectedFramework?.status)');
  });

  it('uses the same canonical status labels on Tracker', () => {
    const tracker = source('src/screens/home/TrackerScreen.tsx');
    expect(tracker).toContain("import { canonicalHealthStatusLabel } from '@fiteatsy/health-intelligence'");
    expect(tracker).toContain('canonicalHealthStatusLabel(result.status)');
    expect(tracker).toContain('scoreLabel(result.score, result.status)');
  });

  it('does not render legacy supporting scores as current numerics', () => {
    const tracker = source('src/screens/home/TrackerScreen.tsx');
    const consultant = source('backend/src/modules/consultants/consultants.service.ts');
    expect(tracker).toContain("['Energy Balance', null, 'Supporting insight only · Methodology pending']");
    expect(tracker).toContain("['Body & Biomarker Health', null, 'Supporting insight only · Methodology pending']");
    expect(consultant).toContain('bodySupportScore: null');
  });
});
