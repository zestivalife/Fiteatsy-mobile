import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Journey recovery star canonical data contract', () => {
  const source = readFileSync(join(process.cwd(), 'src/screens/home/HomeScreen.tsx'), 'utf8');

  it('loads the account-scoped canonical snapshot and canonical recovery history', () => {
    expect(source).toContain("getHealthScoreHistory('recovery')");
    expect(source).toContain('health.canonicalIntelligence?.scores.recovery.score');
    expect(source).toContain('health.canonicalIntelligence?.scores.healthIntelligence.score');
    expect(source).toContain('health.canonicalIntelligence?.scores.activity.score');
    expect(source).toContain('health.canonicalIntelligence?.scores.sleep.score');
    expect(source).toContain('health.canonicalIntelligence?.scores.calm.score');
    expect(source).toContain('health.canonicalIntelligence?.scores.cycle.score');
  });

  it('maps Nourishment only to the canonical Nutrition framework score', () => {
    expect(source).toContain('health.canonicalIntelligence?.scores.nutrition.score');
    expect(source).not.toContain('HOME_RECOVERY_UI_FIXTURE');
    expect(source).not.toContain('ENABLE_HOME_RECOVERY_UI_FIXTURE');
    expect(source).not.toContain('scoreForHomeUi');
  });

  it('shows no score when the backend reports insufficient data', () => {
    expect(source).toContain("selectedScore == null ? '--/100'");
    expect(source).toContain("case 'METHODOLOGY_PENDING': return 'Methodology pending'");
    expect(source).toContain("case 'NOT_APPLICABLE': return 'Not applicable'");
    expect(source).toContain('stateFromScore(selected.score, selectedFramework?.status)');
  });
});
