import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/screens/home/TrackerScreen.tsx'), 'utf8');

test('Tracker Overview initiates a fresh platform sync without changing the other tab renderers', () => {
  expect(source).toContain("activeTab !== 'health' || activeHealthTab !== 'overview'");
  expect(source).toContain('void health.syncLocalMetrics({ liveOnly: true });');
});

test('Tracker Overview consumes production Star Orb scores and preserves missing recovery days as gaps', () => {
  expect(source).toContain('const displayScores = resolveTrackerScoreProjection(');
  expect(source).toContain('health.candidateIntelligence?.scores');
  expect(source).toContain("['Recovery', displayScores.recovery]");
  expect(source).toContain("['Activity', displayScores.activity]");
  expect(source).toContain("['Sleep', displayScores.sleep]");
  expect(source).toContain("['Calm', displayScores.calm]");
  expect(source).toContain("['Mind', displayScores.mind]");
  expect(source).toContain("['Nourishment', displayScores.nutrition]");
  expect(source).toContain('const activityScoreValue = displayScores?.activity.score ?? null;');
  expect(source).toContain("key={`${index}-${value ?? 'missing'}`}");
});

test('Tracker Overview renders its animated particles at the approved doubled radius', () => {
  expect(source).toContain('const size = 0.7 + 1.7 * (1 - q) + (index % 7) * 0.06;');
  expect(source).not.toContain('const size = (0.7 + 1.7 * (1 - q) + (index % 7) * 0.06) * 0.5;');
});
