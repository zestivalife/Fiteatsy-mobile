import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('v17.38 mobile production readiness contracts', () => {
  test('every declared root route is registered and every literal navigation target is declared', () => {
    const types = read('src/navigation/types.ts');
    const rootBlock = types.match(/export type RootStackParamList = \{([\s\S]*?)\n\};/)?.[1] ?? '';
    const declared = new Set([...rootBlock.matchAll(/^\s{2}([A-Za-z0-9]+):/gm)].map((match) => match[1]));
    const navigation = read('src/navigation/AppNavigation.tsx');
    const registered = new Set([...navigation.matchAll(/<Stack\.Screen name="([A-Za-z0-9]+)"/g)].map((match) => match[1]));
    expect([...declared].filter((route) => !registered.has(route))).toEqual([]);

    const screenFiles = fs.readdirSync(path.join(root, 'src/screens'), { recursive: true })
      .filter((file): file is string => typeof file === 'string' && file.endsWith('.tsx'));
    const targets = screenFiles.flatMap((file) => [...read(`src/screens/${file}`).matchAll(/(?:navigate|replace)\('([A-Za-z0-9]+)'/g)].map((match) => match[1]));
    expect([...new Set(targets)].filter((route) => !declared.has(route))).toEqual([]);
  });

  test('production notifications use the authenticated backend inbox without demo cards', () => {
    const screen = read('src/screens/home/NotificationsScreen.tsx');
    expect(screen).toContain('getNotificationInbox');
    expect(screen).toContain('updateNotificationInboxItem');
    expect(screen).toContain('Loading notifications');
    expect(screen).toContain('You’re all caught up');
    expect(screen).toContain('Retry');
    expect(screen).not.toContain('notif-1');
    expect(screen).not.toContain('Apple Watch data was updated successfully');
  });

  test('every displayed global search result navigates to a real route', () => {
    const screen = read('src/screens/home/SearchScreen.tsx');
    expect(screen).toContain("route: 'Reports'");
    expect(screen).toContain("route: 'MedicationCalendar'");
    expect(screen).toContain("route: 'ConsultantBooking'");
    expect(screen).toContain('navigation.navigate');
    expect(screen).not.toMatch(/<Pressable accessibilityRole="button" accessibilityLabel=\{item\}>/);
  });

  test('reachable plan checkout uses server-created and server-verified Razorpay payment', () => {
    const checkout = read('src/screens/home/SubscriptionCheckoutScreen.tsx');
    const service = read('src/services/razorpayCheckoutService.ts');
    expect(checkout).toContain('runVerifiedSubscriptionCheckout');
    expect(checkout).toContain('PaymentSuccess');
    expect(checkout).toContain('Retry');
    expect(checkout).not.toContain('coming in Phase 2');
    expect(service).toContain('createSubscriptionCheckout');
    expect(service).toContain('verifyRazorpayPayment');
  });

  test('debug health sync route and entry point remain development-only', () => {
    expect(read('src/navigation/AppNavigation.tsx')).toContain('{__DEV__ ? <Stack.Screen name="HealthSyncDebug"');
    const profile = read('src/screens/home/ProfileScreen.tsx');
    const debugGuard = profile.indexOf('{__DEV__ ? (');
    const debugNavigation = profile.indexOf("navigation.navigate('HealthSyncDebug')");
    expect(debugGuard).toBeGreaterThan(-1);
    expect(debugNavigation).toBeGreaterThan(debugGuard);
    expect(debugNavigation - debugGuard).toBeLessThan(300);
  });

  test('unavailable leaderboard fails truthfully without fabricated people or scores', () => {
    const screen = read('src/screens/home/LeadershipScreen.tsx');
    expect(screen).toContain('Community rankings are not available');
    expect(screen).not.toContain('Rahul Roy');
    expect(screen).not.toContain('9240');
  });

  test('an authenticated 401 clears the expired session through the app context', () => {
    expect(read('src/services/apiClient.ts')).toContain('unauthorizedHandler?.()');
    expect(read('src/state/AppContext.tsx')).toContain('registerUnauthorizedHandler(() => clearPersistedAuth(authSession))');
  });

  test('signup does not fabricate clinical demographics, symptoms, or goals', () => {
    const signup = read('src/screens/auth/SignUpScreen.tsx');
    expect(signup).not.toContain('new Date(1996, 0, 1)');
    expect(signup).not.toContain("symptomTags: previous?.symptomTags ?? ['Fatigue']");
    expect(signup).not.toContain("healthGoals: previous?.healthGoals ?? ['Better Energy']");
    const basics = read('src/screens/onboarding/OnboardingBasicsScreen.tsx');
    expect(basics).toContain("dob ? dob.toLocaleDateString('en-GB') : 'Select date'");
    expect(basics).toContain('Select your date of birth and gender to continue.');
    expect(read('src/utils/healthProfile.ts')).toContain('symptomTags: profile.symptomTags ?? []');
  });

  test('authentication and report payload debug logging is disabled in production', () => {
    expect(read('src/services/authService.ts')).toContain('if (__DEV__) console.log');
    expect(read('src/services/reportUploadService.ts')).toContain('if (__DEV__) console.log');
  });

  test('the obsolete production-shaped mock device catalogue is removed', () => {
    expect(fs.existsSync(path.join(root, 'src/data/mock.ts'))).toBe(false);
  });
});
