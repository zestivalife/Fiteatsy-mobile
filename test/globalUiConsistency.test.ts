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
    expect(source).toContain('<StarOrbSurface reduceMotion={reduceMotion} />');
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

  test('uses one Star Orb path for a one-pixel, slower, muted moving perimeter and reduced-motion fallback', () => {
    const source = read('src/screens/home/HomeScreen.tsx');
    expect(source).toContain('export const STAR_ORB_PATH =');
    expect(source.match(/d=\{STAR_ORB_PATH\}/g)).toHaveLength(3);
    expect(source).toContain('const STAR_ORB_PERIMETER_WIDTH = 1');
    expect(source).toContain('const STAR_ORB_MOTION_DURATION_MS = 7000');
    expect(source).toContain('const STAR_ORB_MOTION_OPACITY = 0.4');
    expect(source).toContain('strokeOpacity={STAR_ORB_MOTION_OPACITY}');
    expect(source).toContain('strokeLinejoin="round"');
    for (const color of ['#39F3FF', '#4D7CFF', '#FF4FD8', '#A970FF', '#7CFF00', '#7B61FF']) {
      expect(source).toContain(color);
    }
    expect(source).toContain("AccessibilityInfo.addEventListener('reduceMotionChanged'");
    expect(source).toContain('strokeOpacity={reduceMotion ? 0.68 : 0.3}');
  });

  test('keeps only notifications and profile in the Journey header', () => {
    const source = read('src/screens/home/HomeScreen.tsx');
    expect(source).not.toContain('<HeaderIcon icon="search-outline"');
    expect(source).not.toContain('<HeaderIcon icon="trophy-outline"');
    expect(source).toContain('<HeaderIcon icon="notifications-outline"');
    expect(source).toContain('accessibilityLabel="Open profile"');
  });

  test('uses the canonical four-tab navigation while retaining stack Profile access', () => {
    const navigation = read('src/navigation/AppNavigation.tsx');
    const tabRoutes = [...navigation.matchAll(/<Tab\.Screen name="([^"]+)"/g)].map((match) => match[1]);
    expect(tabRoutes).toEqual(['Journey', 'Tracker', 'Nutrition', 'Care']);
    expect(navigation).toContain('<Stack.Screen name="Profile" component={ProfileScreen} />');

    const floatingTabBar = read('src/components/FloatingTabBar.tsx');
    expect(floatingTabBar).not.toContain("Profile: 'person-circle-outline'");
    expect(floatingTabBar).not.toContain("Profile: 'person-circle'");
  });

  test('shares one canonical blue authority between Nutrition and plan selection CTAs', () => {
    const tokens = read('src/design/tokens.ts');
    const nutrition = read('src/screens/home/NutritionExperienceScreen.tsx');
    const plans = read('src/screens/home/SubscriptionPlansScreen.tsx');
    expect(tokens).toContain("primary: '#43C4FA'");
    expect(nutrition).toContain('blue: nutritionActionColors.primary');
    expect(plans).toContain('backgroundColor: nutritionActionColors.primary');
  });

  test('animates selected-node glow without changing the locked node geometry', () => {
    const source = read('src/screens/home/HomeScreen.tsx');
    expect(source).toContain('testID={`selected-node-glow-${metric.key}`}');
    expect(source).toContain('toValue: 1, duration: 900');
    expect(source).toContain('toValue: 0.55, duration: 900');
    expect(source).not.toContain('recoveryNodeSelected');
    expect(source).not.toContain('selectedNodeScale');
  });

  test('removes the Tracker dark core while retaining the particle visualization', () => {
    const source = read('src/screens/home/TrackerScreen.tsx');
    expect(source).not.toContain('particleCoreGlow');
    expect(source).not.toContain('<Circle cx={160} cy={160} r={118}');
    expect(source).toContain('{particlePoints.map((particle) => (');
    expect(source).toContain('style={styles.particleMetricCenter}');
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
