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
    expect(source).toContain('duration: 620');
    expect(source).toContain('toValue: clampedScore');
    expect(source).toContain('animation.stop()');
    expect(source).toContain("selectedScore == null ? '--/100' : `${selectedScore}/100`");
  });

  test('keeps ambient perimeter motion active for pending scores without fake progress', () => {
    expect(source).toContain('STAR_ORB_MOTION_DURATION_MS = 3500');
    expect(source).toContain('Animated.loop(');
    expect(source).toContain('<StarOrbSurface reduceMotion={reduceMotion} />');
    expect(source).toContain('{selectedScore != null ? (');
    expect(source).toContain("case 'METHODOLOGY_PENDING': return 'Methodology pending'");
    expect(source).not.toContain('HOME_RECOVERY_UI_FIXTURE');
  });
});
