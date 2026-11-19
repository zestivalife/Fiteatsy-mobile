import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/screens/home/HomeScreen.tsx'), 'utf8');

describe('original Star Orb visual and animation contract', () => {
  test('uses the accepted five SVG icon pairs', () => {
    for (const asset of [
      'activity-inactive.svg', 'activity-selected.svg',
      'nutrition-inactive.svg', 'nutrition-selected.svg',
      'mind-inactive.svg', 'mind-selected.svg',
      'sleep-inactive.svg', 'sleep-selected.svg',
      'calm-inactive.svg', 'calm-selected.svg'
    ]) expect(source).toContain(asset);
    expect(source).not.toContain('metric.icon');
  });

  test('preserves score selection animation and the xx/100 presentation', () => {
    expect(source).toContain('ProgressDonutChartAsset');
    expect(source).toContain('Animated.delay(350)');
    expect(source).toContain('duration: 1600');
    expect(source).toContain('selectedMetric, selectedScore]);');
    expect(source).toContain('Easing.out(Easing.cubic)');
    expect(source).toContain('toValue: clampedScore');
    expect(source).toContain('animation.stop()');
    expect(source).toContain('recovery-score-track');
    expect(source).toContain('recovery-score-progress');
    expect(source).toContain('const SCORE_ARC_RADIUS = 80');
    expect(source).toContain("selectedScore == null ? '--/100' : `${selectedScore}/100`");
  });

  test('fills the selected score ring without tinting the accepted star surface', () => {
    expect(source).toContain('scoreArcProgress.setValue(0)');
    expect(source).toContain('<StarOrbSurface selectedColor={selectedColor} />');
    expect(source).toContain('star-orb-selection-border');
    expect(source).toContain('strokeWidth={1}');
    expect(source).not.toContain('star-orb-shaped-glow');
    expect(source).not.toContain('star-orb-background-glow');
    expect(source).not.toContain("outputRange: ['0deg', '360deg']");
    expect(source).toContain('testID="recovery-score-track"');
    expect(source).toContain('{selectedScore != null ? <>');
    expect(source).toContain("case 'METHODOLOGY_PENDING': return 'Methodology pending'");
    expect(source).not.toContain('HOME_RECOVERY_UI_FIXTURE');
  });
});
