import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Journey recovery star canonical data contract', () => {
  const source = readFileSync(join(process.cwd(), 'src/screens/home/HomeScreen.tsx'), 'utf8');

  it('loads the same backend health-score summary and recovery history exposed to Consultant workspace', () => {
    expect(source).toContain('getHealthScoreSummary()');
    expect(source).toContain("getHealthScoreHistory('recovery')");
    expect(source).toContain('healthSummary?.recoveryScore');
    expect(source).toContain('healthSummary?.activePerformanceScore');
    expect(source).toContain('healthSummary?.energyBalanceScore');
    expect(source).toContain('healthSummary?.stressResilienceScore');
  });

  it('keeps Nutrition on the canonical daily projection and contains no presentation fixture', () => {
    expect(source).toContain('dailyNutrition?.nutritionScore');
    expect(source).not.toContain('HOME_RECOVERY_UI_FIXTURE');
    expect(source).not.toContain('ENABLE_HOME_RECOVERY_UI_FIXTURE');
    expect(source).not.toContain('scoreForHomeUi');
  });

  it('shows no score when the backend reports insufficient data', () => {
    expect(source).toContain("selectedScore == null ? 'Calibrating'");
    expect(source).not.toContain("selectedScore == null ? '--/100'");
    expect(source).toContain("if (score == null) return { label: 'No data' }");
  });
});
