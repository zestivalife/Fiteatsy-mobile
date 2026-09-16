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
    expect(source).toContain("key: 'recovery'");
    expect(source).toContain("key: 'activity'");
    expect(source).toContain("key: 'nourishment'");
    expect(source).toContain("key: 'sleep'");
    expect(source).toContain("key: 'calm'");
    expect(source).not.toContain("key: 'cycleWellness'");
  });

  test('places Star Orb domains on one stable radial ring', () => {
    const source = read('src/screens/home/HomeScreen.tsx');
    expect(source).toContain("recovery: {\n    left: '50%',\n    top: '16%'");
    expect(source).toContain("nourishment: {\n    left: '82%',\n    top: '40%',\n    transform: [{ translateY: SIDE_NODE_STEP }]");
    expect(source).toContain("sleep: {\n    left: '72%',\n    top: '74%',\n    transform: [{ translateY: LOWER_NODE_OFFSET }]");
    expect(source).toContain("calm: {\n    left: '28%',\n    top: '74%',\n    transform: [{ translateY: LOWER_NODE_OFFSET }]");
    expect(source).toContain("activity: {\n    left: '18%',\n    top: '40%',\n    transform: [{ translateY: SIDE_NODE_STEP }]");
    expect(source.match(/top: '51\.5%'/g)).toHaveLength(4);
    expect(source.match(/left: '50%'/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain("width: 96,\n    height: 70");
    expect(source).toContain('marginLeft: -48');
    expect(source).toContain('marginTop: -35');
    expect(source).toContain('<RecoveryStarAsset width="100%" height="100%" pointerEvents="none"');
    expect(source).not.toContain('preserveAspectRatio="none"');
    expect(source).toContain("top: '51.5%',\n    left: '50%',\n    width: 384,\n    height: 465.6,\n    marginTop: -232.8,\n    marginLeft: -192");
    expect(source).toContain('DONUT_ASSET_SIZE * ((DONUT_VIEWBOX_SIZE / 2 - DONUT_ART_CENTER) / DONUT_VIEWBOX_SIZE)');
    expect(source).toContain('marginTop: -(DONUT_ASSET_SIZE / 2) + DONUT_ART_CENTER_OFFSET');
    expect(source).toContain('marginLeft: -(DONUT_ASSET_SIZE / 2) + DONUT_ART_CENTER_OFFSET');
    expect(source).toContain('const SIDE_NODE_STEP = 70 * 0.1');
    expect(source).toContain('const LOWER_NODE_OFFSET = 70 * 0.4');
    expect(source).toContain('const CENTRAL_CIRCLE_OFFSET = DONUT_ASSET_SIZE * 0.05');
    expect(source.match(/transform: \[\{ translateY: CENTRAL_CIRCLE_OFFSET \}\]/g)).toHaveLength(3);
    expect(source).toContain("height: 320");
    expect(source).toContain("overflow: 'hidden'");
    expect(source).not.toContain('recoveryNodeSelected');
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
