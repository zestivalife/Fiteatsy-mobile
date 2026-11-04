import fs from 'node:fs';
import path from 'node:path';

describe('Profile body measurements entry', () => {
  it('adds an isolated profile route without changing the frozen primary tabs', () => {
    const profile = fs.readFileSync(path.join(process.cwd(), 'src/screens/home/ProfileScreen.tsx'), 'utf8');
    const navigation = fs.readFileSync(path.join(process.cwd(), 'src/navigation/AppNavigation.tsx'), 'utf8');
    const measurements = fs.readFileSync(path.join(process.cwd(), 'src/screens/home/BodyMeasurementsScreen.tsx'), 'utf8');
    expect(profile).toContain("navigation.navigate('BodyMeasurements')");
    expect(navigation).toContain('<Stack.Screen name="BodyMeasurements" component={BodyMeasurementsScreen} />');
    expect(navigation).toContain('<Tab.Screen name="Journey" component={HomeScreen} />');
    expect(navigation).toContain('<Tab.Screen name="Tracker" component={TrackerScreen} />');
    expect(navigation).toContain('<Tab.Screen name="Nutrition" component={NutritionExperienceScreen} />');
    expect(navigation).toContain('<Tab.Screen name="Care" component={CareTabScreen} />');
    expect(navigation).toContain('<Tab.Screen name="Profile" component={ProfileScreen} />');
    expect(measurements).toContain('Measurements access is active');
    expect(measurements).toContain('sync will continue automatically');
  });
});
