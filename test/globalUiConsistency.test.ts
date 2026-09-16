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
    expect(source).toContain("recovery: {\n    left: '50%',\n    top: '13%'");
    expect(source).toContain("nourishment: {\n    left: '85%',\n    top: '39%'");
    expect(source).toContain("sleep: {\n    left: '71%',\n    top: '76%'");
    expect(source).toContain("calm: {\n    left: '29%',\n    top: '76%'");
    expect(source).toContain("activity: {\n    left: '15%',\n    top: '39%'");
    expect(source).toContain('marginLeft: -52');
    expect(source).toContain('marginTop: -35');
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
