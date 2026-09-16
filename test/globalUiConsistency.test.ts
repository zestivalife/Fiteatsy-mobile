import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Journey and Tracker UI consistency', () => {
  test('uses the governed recovery trend title and seven responsive columns', () => {
    const source = read('src/screens/home/HomeScreen.tsx');
    expect(source).toContain('Your 7-Day Recovery Trend');
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

  test('uses shared segmented control and compact Tracker categories', () => {
    const source = read('src/screens/home/TrackerScreen.tsx');
    expect(source).toContain("import { SegmentedTabs } from '../../components/SegmentedTabs'");
    expect(source).toContain("label: 'Health'");
    expect(source).toContain("label: 'Wellness'");
    expect(source).toContain("height: 310");
    expect(source).not.toContain('Your 7 day’s Recovery Trend');
  });

  test('bottom navigation reserves a stable visible surface without vertical translation', () => {
    const source = read('src/components/FloatingTabBar.tsx');
    expect(source).toContain("backgroundColor: '#0D1013'");
    expect(source).toContain('minHeight: 58');
    expect(source).not.toContain('translateY: 8');
  });
});
