import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { HomeHealthActions } from '../src/components/HomeHealthActions';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
test('the focused Home health actions remain interactive without Assist or Plans', () => {
  const handlers = {
    onMyFitness: jest.fn(),
    onHealthReports: jest.fn(),
    onCycle: jest.fn()
  };
  const screen = render(React.createElement(HomeHealthActions, handlers));

  for (const label of ['My Fitness', 'Health Reports', 'Cycle']) {
    fireEvent.press(screen.getByRole('button', { name: label }));
  }

  expect(handlers.onMyFitness).toHaveBeenCalledTimes(1);
  expect(handlers.onHealthReports).toHaveBeenCalledTimes(1);
  expect(handlers.onCycle).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Assist' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Plans' })).toBeNull();
  expect(screen.queryByText(/Sync Health|Connect Health/)).toBeNull();
});
