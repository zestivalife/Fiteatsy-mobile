import React from 'react';
import { SessionTimerScreen } from './SessionTimerScreen';
import { useAppContext } from '../../state/AppContext';

export const MovementScreen = () => {
  const { setWellness } = useAppContext();

  const handleComplete = () => {
    setWellness((previous) => ({
      ...previous,
      movementMinutes: previous.movementMinutes + 10
    }));
  };

  return <SessionTimerScreen title="Movement" startSeconds={38} actionLabel="A short move break improves blood circulation" onComplete={handleComplete} />;
};
