import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockRequestAccess = jest.fn();

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => require('react').createElement(require('react-native').View, null, children)
}));
jest.mock('../src/components/AppBackButton', () => ({
  AppBackButton: () => require('react').createElement(require('react-native').Text, null, 'Back')
}));
jest.mock('../src/state/AppContext', () => ({ useAppContext: () => ({
  themeMode: 'dark', onboarding: null, setOnboarding: jest.fn(), setWearableSetupCompleted: jest.fn()
}) }));
jest.mock('../src/services/canonicalHealthSyncCoordinator', () => ({ useCanonicalHealthSyncCoordinator: () => ({
  providerState: 'CONNECTED', providerLabel: 'Connected', sourceName: 'Apple Health', localHydrated: true,
  uploadState: 'SYNCED', availableMetricCount: 2, pendingUploadCount: 0, message: null,
  lifecycle: { lastHealthReadAtISO: '2026-11-13T08:00:00Z', lastSavedAtISO: '2026-11-13T08:00:00Z', lastUploadedAtISO: '2026-11-13T08:00:00Z' },
  metrics: [
    { supported: true, queryState: 'DATA_AVAILABLE', localRecordCount: 1, observation: { metricType: 'steps', value: 3200, unit: 'count', measuredAtISO: '2026-11-13T08:00:00Z', sourceMetadata: { sourceApplication: 'iPhone' } }, definition: { metricKey: 'steps', displayName: 'Steps', backendCanonicalType: 'steps' } },
    { supported: true, queryState: 'DATA_AVAILABLE', localRecordCount: 1, observation: { metricType: 'distance', value: 2.5, unit: 'km', measuredAtISO: '2026-11-13T09:00:00Z', sourceMetadata: { sourceApplication: 'Apple Watch' } }, definition: { metricKey: 'distance', displayName: 'Distance', backendCanonicalType: 'distance' } }
  ],
  activity: [], syncLocalMetrics: jest.fn(), requestAccess: mockRequestAccess, markPermissionReviewStarted: jest.fn()
}) }));

test('the HealthData route mounts the accepted dedicated connected-health experience on the canonical coordinator', () => {
  const { HealthDataScreen } = require('../src/screens/sync/HealthDataScreen');
  const screen = render(React.createElement(HealthDataScreen, {
    navigation: { goBack: jest.fn(), reset: jest.fn() }, route: { params: { entryContext: 'HOME' } }
  }));

  expect(screen.getByText('Health Data')).toBeTruthy();
  expect(screen.getByText('Live data available from Apple Health')).toBeTruthy();
  expect(screen.getByText('Read-only data from this iPhone')).toBeTruthy();
  for (const category of ['Activity', 'Sleep', 'Heart', 'Recovery', 'Body', 'Mindfulness']) {
    expect(screen.getByText(category)).toBeTruthy();
  }
  expect(screen.getByText('Latest Distance: 2.5 km')).toBeTruthy();
  expect(screen.getAllByText('records')).toHaveLength(6);
  expect(screen.getByText('Apple Health · Available locally · Uploaded')).toBeTruthy();
  expect(screen.getAllByText('Not supported by the current health source').length).toBeGreaterThan(0);
  expect(screen.getByText(/Measured .*2026/)).toBeTruthy();
  expect(screen.getByText('Detailed Health Data')).toBeTruthy();
  expect(screen.getByText('ACTIVITY')).toBeTruthy();
  expect(screen.getByText('Steps')).toBeTruthy();
  expect(screen.getByText('Distance')).toBeTruthy();
  expect(screen.getByText('3,200 count')).toBeTruthy();
  expect(screen.getByText('2.5 km')).toBeTruthy();
  expect(screen.getAllByText('12:00 AM – Now')).toHaveLength(2);
  expect(screen.getByText('Source: iPhone')).toBeTruthy();
  expect(screen.getByText('Source: Apple Watch')).toBeTruthy();
  expect(screen.getAllByText('synced')).toHaveLength(2);
  expect(screen.getByText('Sync')).toBeTruthy();
  expect(screen.getByText('Refresh Health Data')).toBeTruthy();
  expect(screen.queryByText('Some health signals are available')).toBeNull();
  expect(screen.queryByText('Sync Now')).toBeNull();
  expect(screen.queryByText('Sync Activity')).toBeNull();

  fireEvent.press(screen.getByLabelText('Sync with Apple Health'));
  expect(mockRequestAccess).toHaveBeenCalledTimes(1);
});
