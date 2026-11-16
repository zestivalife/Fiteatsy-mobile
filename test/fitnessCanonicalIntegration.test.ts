import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('forward-only Fitness presentation integration', () => {
  const fitness = read('src/screens/fitness/FitnessScreen.tsx');
  const healthData = read('src/screens/sync/HealthDataScreen.tsx');

  test('keeps the locked Home entry and canonical HealthData route unchanged', () => {
    const home = read('src/screens/home/HomeScreen.tsx');
    const actions = read('src/components/HomeHealthActions.tsx');
    const navigation = read('src/navigation/AppNavigation.tsx');
    expect(actions).toContain('label="My Fitness"');
    expect(home).toContain("navigation.navigate('HealthData', { entryContext: 'HOME' })");
    expect(navigation).toContain('<Stack.Screen name="HealthData" component={HealthDataScreen} />');
    expect(navigation).not.toContain('<Stack.Screen name="Fitness"');
  });

  test('renders the six accepted Fitness categories from the canonical snapshot', () => {
    for (const title of ['Activity', 'Sleep', 'Heart', 'Recovery', 'Body', 'Mindfulness']) {
      expect(fitness).toContain(`title: '${title}'`);
    }
    expect(fitness).toContain('CanonicalHealthSyncSnapshot');
    expect(fitness).toContain('health.metrics.filter');
    expect(fitness).toContain('metric.localRecordCount');
    expect(fitness).toContain('metric.observation.measuredAtISO');
    expect(healthData).toContain('<FitnessParameterCards health={health} />');
  });

  test('does not create a second native reader, upload path, store, or score authority', () => {
    for (const forbidden of [
      'appleHealthService',
      'healthConnectService',
      'healthSyncManager',
      'healthSyncLocalStore',
      'runHealthSync',
      'readCurrentHealthData',
      'requestAppleHealthPermissions',
      'requestHealthConnectPermissionsOnly'
    ]) expect(fitness).not.toContain(forbidden);
    expect(fitness).not.toContain('useState(');
    expect(fitness).not.toContain('AppState.addEventListener');
  });

  test('keeps measurement, record, read, and upload semantics distinct', () => {
    expect(fitness).toContain("return 'No current permitted data'");
    expect(fitness).toContain("return 'Available locally'");
    expect(fitness).toContain("return 'Upload pending'");
    expect(fitness).toContain('records');
    expect(fitness).toContain('Measured ');
    expect(fitness).not.toContain("|| '0'");
  });

  test('retains the original detailed metric presentation alongside Fitness summaries', () => {
    for (const contract of [
      'metric.definition.displayName',
      'formatValue(metric)',
      'presentation.period',
      'statusLabel(metric)',
      'sourceMetadata.sourceApplication'
    ]) expect(healthData).toContain(contract);
    expect(healthData).toContain('Detailed Health Data');
    expect(healthData).toContain('metricPresentation');
  });

  test('classifies Mindfulness from the actual canonical registry capability', () => {
    const registry = read('src/services/healthMetricRegistry.ts');
    expect(registry).not.toContain("metricKey:'mindfulness'");
    expect(fitness).toContain("key: 'mindfulness'");
    expect(fitness).toContain('metricKeys: []');
  });
});
