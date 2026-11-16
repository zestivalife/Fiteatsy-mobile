import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/state/AppContext', () => ({ useAppContext: () => ({ themeMode: 'dark' }) }));

const metric = (metricKey: string, value: number | null, unit: string, measuredAtISO = '2026-11-16T08:15:00Z') => ({
  supported: true,
  queryState: value === null ? 'NO_VISIBLE_DATA' : 'DATA_AVAILABLE',
  localRecordCount: value === null ? 0 : 1,
  uploadState: 'PENDING',
  errorClass: null,
  sourcePlatform: 'APPLE_HEALTH',
  definition: { metricKey, displayName: metricKey, backendCanonicalType: metricKey },
  observation: value === null ? null : { metricType: metricKey, value, unit, measuredAtISO, sourceMetadata: {} }
});

test('Fitness cards preserve a genuine zero and distinguish it from missing data and pending upload', () => {
  const { FitnessParameterCards } = require('../src/screens/fitness/FitnessScreen');
  const screen = render(React.createElement(FitnessParameterCards, { health: {
    providerLabel: 'Connected',
    sourceName: 'Apple Health',
    uploadState: 'PENDING',
    pendingUploadCount: 1,
    metrics: [metric('steps', 0, 'count'), metric('sleep', null, 'min')]
  } }));

  expect(screen.getByText('Latest 0 count')).toBeTruthy();
  expect(screen.getAllByText('No current permitted data').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Apple Health · Available locally · Upload pending').length).toBeGreaterThan(0);
  expect(screen.getByText(/Measured .*2026/)).toBeTruthy();
  expect(screen.getByText('1 record is available locally and awaiting secure upload.')).toBeTruthy();
});
