import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('standalone Fitness health sync entry', () => {
  it('removes Plans from the Home actions and opens Fitness', () => {
    const home = read('src/screens/home/HomeScreen.tsx');
    expect(home).not.toContain('label="Plans"');
    expect(home).toContain('label="Fitness"');
    expect(home).toContain("navigation.navigate('Fitness')");
  });

  it('registers an independent Fitness screen without importing My Fitness', () => {
    const navigation = read('src/navigation/AppNavigation.tsx');
    const fitness = read('src/screens/fitness/FitnessScreen.tsx');
    expect(navigation).toContain('<Stack.Screen name="Fitness" component={FitnessScreen} />');
    expect(fitness).toContain('requestAppleHealthPermissions');
    expect(fitness).toContain('requestHealthConnectPermissionsOnly');
    expect(fitness).toContain('readCurrentHealthData');
    expect(fitness).not.toContain('HealthDataScreen');
  });
});
