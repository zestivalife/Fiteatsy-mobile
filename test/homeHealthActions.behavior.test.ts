import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { HomeHealthActions } from '../src/components/HomeHealthActions';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../src/assets/fiteatsy-home/assist.svg', () => ({ __esModule: true, default: 'AssistIcon' }));

test('My Fitness is the health entry and all preserved Home actions remain interactive', () => {
  const handlers = {
    onAssist: jest.fn(),
    onPlans: jest.fn(),
    onMyFitness: jest.fn(),
    onHealthReports: jest.fn(),
    onCycle: jest.fn()
  };
  const screen = render(React.createElement(HomeHealthActions, handlers));

  for (const label of ['Assist', 'Plans', 'My Fitness', 'Health Reports', 'Cycle']) {
    fireEvent.press(screen.getByRole('button', { name: label }));
  }

  expect(handlers.onAssist).toHaveBeenCalledTimes(1);
  expect(handlers.onPlans).toHaveBeenCalledTimes(1);
  expect(handlers.onMyFitness).toHaveBeenCalledTimes(1);
  expect(handlers.onHealthReports).toHaveBeenCalledTimes(1);
  expect(handlers.onCycle).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Sync Health|Connect Health/)).toBeNull();
});
