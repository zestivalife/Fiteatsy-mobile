import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Journey recovery star canonical data contract', () => {
  const source = readFileSync(join(process.cwd(), 'src/screens/home/HomeScreen.tsx'), 'utf8');

  it('loads the same backend health-score summary and recovery history exposed to Consultant workspace', () => {
    expect(source).toContain('getHealthScoreSummary()');
    expect(source).toContain("getHealthScoreHistory('recovery')");
    expect(source).toContain('healthSummary?.recoveryScore');
    expect(source).toContain('healthSummary?.healthIntelligenceScore');
    expect(source).toContain('healthSummary?.activityScore');
    expect(source).toContain('healthSummary?.sleepScore');
    expect(source).toContain('healthSummary?.calmScore');
    expect(source).toContain('healthSummary?.cycleScore');
  });

  it('maps Nourishment only to the canonical Nutrition framework score', () => {
    expect(source).toContain('healthSummary?.nutritionScore');
    expect(source).not.toContain('HOME_RECOVERY_UI_FIXTURE');
    expect(source).not.toContain('ENABLE_HOME_RECOVERY_UI_FIXTURE');
    expect(source).not.toContain('scoreForHomeUi');
  });

  it('shows no score when the backend reports insufficient data', () => {
    expect(source).toContain("selectedScore == null ? '--/100'");
    expect(source).toContain("if (score == null) return { label: 'No data' }");
  });
});
