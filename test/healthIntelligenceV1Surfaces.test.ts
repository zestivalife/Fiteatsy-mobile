import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(__dirname, '..');
const read = (value: string) => fs.readFileSync(path.join(root, value), 'utf8');

describe('Health Intelligence V1 canonical surfaces', () => {
  test('Star Orb uses canonical framework scores and names', () => {
    const home = read('src/screens/home/HomeScreen.tsx');
    for (const key of ['healthIntelligence', 'recovery', 'activity', 'sleep', 'nutrition', 'calm']) {
      expect(home).toContain(`health.canonicalIntelligence?.scores.${key}.score`);
    }
    expect(home).not.toContain('health.canonicalIntelligence?.scores.cycle.score');
    expect(home).toContain("label: 'Nourishment'");
    expect(home).not.toContain("label: 'Active Performance'");
  });

  test('Tracker consumes canonical histories and keeps supporting scores non-numeric', () => {
    const tracker = read('src/screens/home/TrackerScreen.tsx');
    expect(tracker).toContain('getHealthIntelligenceV1');
    expect(tracker).toContain('getHealthScoreHistory()');
    expect(tracker).toContain('Promise.allSettled');
    expect(tracker).toContain("['Energy Balance', null, 'Supporting insight only · Methodology pending']");
    expect(tracker).toContain("['Body & Biomarker Health', null, 'Supporting insight only · Methodology pending']");
    expect(tracker).not.toContain('Physical Ease');
    expect(tracker).not.toContain('const stepTarget = 5000');
  });

  test('mobile and backend use the shared V1 authority', () => {
    expect(read('src/services/localHealthIntelligence.ts')).toContain("from '@fiteatsy/health-intelligence'");
    const routes = read('backend/src/modules/intelligence/intelligence.routes.ts');
    const consultant = read('backend/src/modules/consultants/consultants.service.ts');
    expect(routes).toContain("intelligenceRouter.get('/v1'");
    expect(consultant).toContain("calculationVersion: 'HEALTH_INTELLIGENCE_V1'");
  });
});
