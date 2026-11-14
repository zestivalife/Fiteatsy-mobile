import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Journey and Tracker UI consistency', () => {
  test('uses a compact recovery trend with seven responsive columns', () => {
    const source = read('src/screens/home/HomeScreen.tsx');
    expect(source).toContain('7-Day Recovery');
    expect(source).toContain('Waiting for data');
    expect(source).toContain('trendEmptyDot');
    expect(source).toContain("trendItem: {\n    flex: 1");
    expect(source).not.toContain('Your 7 day’s Recovery Trend');
  });

  test('keeps the canonical five-node Star Orb contract', () => {
    const source = read('src/screens/home/HomeScreen.tsx');
    expect(source).toContain("key: 'mind'");
    expect(source).toContain("key: 'activity'");
    expect(source).toContain("key: 'nourishment'");
    expect(source).toContain("key: 'sleep'");
    expect(source).toContain("key: 'calm'");
    expect(source).not.toContain("key: 'cycleWellness'");
  });

  test('places Star Orb domains on one stable radial ring', () => {
    const source = read('src/screens/home/HomeScreen.tsx');
    expect(source).toContain("top: {\n    top: 24,\n    left: 131");
    expect(source).toContain("left: {\n    top: 125,\n    left: 1");
    expect(source).toContain("right: {\n    top: 125,\n    right: 1");
    expect(source).toContain("bottomLeft: {\n    left: 52,\n    bottom: 17");
    expect(source).toContain("bottomRight: {\n    right: 52,\n    bottom: 17");
    expect(source).toContain("width: 104,\n    minHeight: 86");
    expect(source).toContain('<RecoveryStarAsset width="100%" height="100%" pointerEvents="none"');
    expect(source).not.toContain('preserveAspectRatio="none"');
    expect(source).toContain("top: -48,\n    left: -20,\n    width: 406,\n    height: 492");
    expect(source).toContain('top: STAR_CENTER_Y - DONUT_ASSET_VISUAL_CENTER + DONUT_VERTICAL_OFFSET');
    expect(source).toContain('left: STAR_CENTER_X - DONUT_ASSET_VISUAL_CENTER');
    expect(source).toContain("height: 371");
    expect(source).toContain("overflow: 'visible'");
    expect(source).toContain('recoveryNodeSelected');
  });

  test('uses shared segmented control and compact Tracker categories', () => {
    const source = read('src/screens/home/TrackerScreen.tsx');
    expect(source).toContain("import { SegmentedTabs } from '../../components/SegmentedTabs'");
    expect(source).toContain("label: 'Health'");
    expect(source).toContain("label: 'Wellness'");
    expect(source).toContain("height: 264");
    expect(source).toContain("if (score == null) return 'Waiting for data'");
    expect(source).toContain('Scores appear automatically when enough recent health data is available.');
    expect(source).not.toContain('Your 7 day’s Recovery Trend');
  });

  test('bottom navigation reserves a stable visible surface without vertical translation', () => {
    const source = read('src/components/FloatingTabBar.tsx');
    expect(source).toContain("backgroundColor: '#0D1013'");
    expect(source).toContain('minHeight: 52');
    expect(source).toContain('minHeight: 46');
    expect(source).not.toContain('translateY: 8');
  });
});
