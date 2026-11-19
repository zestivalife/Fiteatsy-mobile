import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/screens/home/TrackerScreen.tsx'), 'utf8');

describe('Tracker Activity particle experience', () => {
  test('renders the reference-style animated grid in the Activity centre', () => {
    expect(source).toContain('const ActivityParticleMetric');
    expect(source).toContain('ACTIVITY_PARTICLE_GRID_SIZE = 17');
    expect(source).toContain('requestAnimationFrame(tick)');
    expect(source).toContain('Math.exp(-(delta * delta)');
    expect(source).toContain('ACTIVITY_PARTICLE_SPACING = 27');
    expect(source).toContain('ACTIVITY_PARTICLE_RADIUS_SCALE = 0.5');
    expect(source).toContain("width: '124%'");
    expect(source).toContain('style={styles.activityParticleSvg}');
    expect(source).toContain("activityParticleSvg: {\n    overflow: 'visible'");
    expect(source).toContain('<ActivityParticleMetric');
    expect(source).not.toContain('<ProgressRing value={activityScoreValue}');
  });

  test('binds only canonical platform measurements and the canonical Activity score', () => {
    expect(source).toContain("todayAggregate(['steps'])");
    expect(source).toContain("todayAggregate(['active_energy'])");
    expect(source).toContain("todayAggregate(['workout_minutes','active_minutes'])");
    expect(source).toContain('displayScores?.activity.score ?? null');
    expect(source).toContain('score={activityScoreValue}');
    expect(source).toContain('steps={stepsValue}');
    expect(source).toContain('workoutMinutes={workoutMinutesValue}');
    expect(source).toContain('activeCalories={caloriesValue}');
  });
});
