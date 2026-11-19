import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/state/AppContext', () => ({ useAppContext: () => ({ themeMode: 'dark' }) }));

const metric = (metricKey: string, displayName: string, value: number | null, unit: string, measuredAtISO = '2026-11-16T08:15:00Z') => ({
  supported: true,
  queryState: value === null ? 'NO_VISIBLE_DATA' : 'DATA_AVAILABLE',
  localRecordCount: value === null ? 0 : 1,
  uploadState: 'PENDING',
  errorClass: null,
  sourcePlatform: 'APPLE_HEALTH',
  definition: { metricKey, displayName, backendCanonicalType: metricKey },
  observation: value === null ? null : { metricType: metricKey, value, unit, measuredAtISO, sourceMetadata: {} }
});

test('Fitness cards omit duplicate health categories while preserving upload state', () => {
  const { FitnessParameterCards } = require('../src/screens/fitness/FitnessScreen');
  const screen = render(React.createElement(FitnessParameterCards, { health: {
    providerLabel: 'Connected',
    sourceName: 'Apple Health',
    uploadState: 'PENDING',
    pendingUploadCount: 1,
    metrics: [metric('steps', 'Steps', 0, 'count'), metric('sleep', 'Sleep', null, 'min')]
  } }));

  expect(screen.queryByText('Latest Steps: 0 count')).toBeNull();
  expect(screen.getByText('Mindfulness')).toBeTruthy();
  expect(screen.getByText('1 record is available locally and awaiting secure upload.')).toBeTruthy();
});

test('Fitness summary does not render removed Activity data', () => {
  const { FitnessParameterCards } = require('../src/screens/fitness/FitnessScreen');
  const screen = render(React.createElement(FitnessParameterCards, { health: {
    providerLabel: 'Connected',
    sourceName: 'Apple Health',
    uploadState: 'SYNCED',
    pendingUploadCount: 0,
    metrics: [
      metric('steps', 'Steps', 3200, 'count', '2026-11-16T08:00:00Z'),
      metric('distance', 'Distance', 2.5, 'km', '2026-11-16T09:00:00Z')
    ]
  } }));

  expect(screen.queryByText('Latest Distance: 2.5 km')).toBeNull();
  expect(screen.queryByText('Latest Steps: 3,200 count')).toBeNull();
  expect(screen.getAllByText('records')).toHaveLength(1);
});
