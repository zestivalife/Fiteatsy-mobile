import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => require('react').createElement(require('react-native').View, null, children)
}));
jest.mock('../src/components/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => require('react').createElement(require('react-native').View, null, children)
}));
jest.mock('../src/components/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => require('react').createElement(require('react-native').Text, null, title)
}));
jest.mock('../src/components/PrimaryButton', () => ({
  PrimaryButton: ({ title }: { title: string }) => require('react').createElement(require('react-native').Text, null, title)
}));
jest.mock('../src/state/AppContext', () => ({ useAppContext: () => ({
  themeMode: 'dark', onboarding: null, setOnboarding: jest.fn(), setWearableSetupCompleted: jest.fn()
}) }));
jest.mock('../src/services/canonicalHealthSyncCoordinator', () => ({ useCanonicalHealthSyncCoordinator: () => ({
  providerState: 'CONNECTED', providerLabel: 'Connected', sourceName: 'Apple Health', localHydrated: true,
  uploadState: 'SYNCED', availableMetricCount: 1, pendingUploadCount: 0, message: null,
  lifecycle: { lastHealthReadAtISO: '2026-11-13T08:00:00Z', lastSavedAtISO: '2026-11-13T08:00:00Z', lastUploadedAtISO: '2026-11-13T08:00:00Z' },
  metrics: [{ supported: true, queryState: 'DATA_AVAILABLE', observation: { metricType: 'steps', value: 3200, unit: 'count', measuredAtISO: '2026-11-13T08:00:00Z', sourceMetadata: {} }, definition: { metricKey: 'steps', displayName: 'Steps', backendCanonicalType: 'steps' } }],
  activity: [], syncLocalMetrics: jest.fn(), requestAccess: jest.fn(), markPermissionReviewStarted: jest.fn()
}) }));

test('the HealthData route mounts the accepted dedicated connected-health experience on the canonical coordinator', () => {
  const { HealthDataScreen } = require('../src/screens/sync/HealthDataScreen');
  const screen = render(React.createElement(HealthDataScreen, {
    navigation: { goBack: jest.fn(), reset: jest.fn() }, route: { params: { entryContext: 'HOME' } }
  }));

  expect(screen.getByText('Health Data')).toBeTruthy();
  expect(screen.getByText('Your health data is ready')).toBeTruthy();
  expect(screen.getByText('Apple Health')).toBeTruthy();
  expect(screen.getByText('Activity')).toBeTruthy();
  expect(screen.getByText('Sleep')).toBeTruthy();
  expect(screen.getByText('Heart')).toBeTruthy();
  expect(screen.getByText('Recovery')).toBeTruthy();
  expect(screen.getByText('Sync Now')).toBeTruthy();
  expect(screen.getByText('Your Health Data')).toBeTruthy();
});
