import fs from 'fs';
import path from 'path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('profile and account experience contract', () => {
  test('uses one navigable profile hub for all supported account surfaces', () => {
    const navigation = read('src/navigation/AppNavigation.tsx');
    const hub = read('src/screens/home/ProfileScreen.tsx');
    for (const route of ['MyProfile', 'ConnectedHealth', 'PrivacyConsent', 'Security', 'NotificationPreferences', 'AppPreferences', 'HelpSupport']) {
      expect(navigation).toContain(`name="${route}"`);
      expect(hub).toContain(`navigate('${route}')`);
    }
  });

  test('does not expose unsupported destructive or identity mutation controls', () => {
    const security = read('src/screens/profile/SecurityScreen.tsx');
    expect(security).not.toContain('Delete Account</');
    expect(security).not.toContain('Change Mobile Number</');
    expect(security).not.toContain('Change Email Address</');
    expect(security).toContain('governed server workflows');
  });

  test('notification settings are account-scoped and master toggle governs children', () => {
    const service = read('src/services/profilePreferenceService.ts');
    const screen = read('src/screens/profile/NotificationPreferencesScreen.tsx');
    expect(service).toContain('fiteatsy.profile.${accountId}');
    expect(screen).toContain("key==='all'");
    expect(screen).toContain("filter(([k])=>k!=='all').every");
  });

  test('connected health is device-platform aware and reuses canonical sync', () => {
    const screen = read('src/screens/profile/ConnectedHealthScreen.tsx');
    expect(screen).toContain("Platform.OS==='ios'?'Apple Health':'Health Connect'");
    expect(screen).toContain('useCanonicalHealthSyncCoordinator');
    expect(screen).toContain("navigate('HealthDataSync'");
  });

  test('profile rendering never contains screenshot fixture identities', () => {
    const files = ['src/screens/home/ProfileScreen.tsx', 'src/screens/profile/MyProfileScreen.tsx'];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toContain('Sayali Phansalkar');
      expect(source).not.toContain('98765 43210');
      expect(source).not.toContain('sayali@email.com');
    }
  });
});
