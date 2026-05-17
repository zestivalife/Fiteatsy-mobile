import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { ProgressRing } from '../../components/ProgressRing';
import { colors, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';
import { secondsToClock } from '../../utils/time';

type Phase = {
  label: 'Inhale' | 'Hold' | 'Exhale';
  seconds: number;
  hint: string;
};

const phases: Phase[] = [
  { label: 'Inhale', seconds: 4, hint: 'Breathe in slowly through your nose.' },
  { label: 'Hold', seconds: 4, hint: 'Hold your breath and relax your shoulders.' },
  { label: 'Exhale', seconds: 6, hint: 'Exhale gently through your mouth.' }
];

const targetCycles = 6;
const cycleDuration = phases.reduce((sum, phase) => sum + phase.seconds, 0);
const totalDuration = cycleDuration * targetCycles;

export const BreathingScreen = () => {
  const navigation = useNavigation();
  const { setWellness } = useAppContext();
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseRemaining, setPhaseRemaining] = useState(phases[0].seconds);
  const [score, setScore] = useState(0);
  const [exhaleTapped, setExhaleTapped] = useState(false);

  const orbScale = useRef(new Animated.Value(0.82)).current;
  const rewardedRef = useRef(false);

  const currentPhase = phases[phaseIndex];

  useEffect(() => {
    if (!running || completed) {
      return;
    }

    const tick = setTimeout(() => {
      setPhaseRemaining((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => clearTimeout(tick);
  }, [running, completed, phaseRemaining]);

  useEffect(() => {
    if (!running || completed || phaseRemaining !== 0) {
      return;
    }

    const isLastPhase = phaseIndex === phases.length - 1;

    if (isLastPhase) {
      const nextCycle = cycleIndex + 1;
      if (nextCycle >= targetCycles) {
        setRunning(false);
        setCompleted(true);
        return;
      }

      setCycleIndex(nextCycle);
      setPhaseIndex(0);
      setPhaseRemaining(phases[0].seconds);
      setExhaleTapped(false);
      return;
    }

    const nextPhaseIndex = phaseIndex + 1;
    setPhaseIndex(nextPhaseIndex);
    setPhaseRemaining(phases[nextPhaseIndex].seconds);
    setExhaleTapped(false);
  }, [running, completed, phaseRemaining, phaseIndex, cycleIndex]);

  useEffect(() => {
    if (!running || completed) {
      orbScale.stopAnimation();
      return;
    }

    let targetScale = 0.82;
    if (currentPhase.label === 'Inhale' || currentPhase.label === 'Hold') {
      targetScale = 1.16;
    }

    Animated.timing(orbScale, {
      toValue: targetScale,
      duration: currentPhase.seconds * 1000,
      useNativeDriver: true
    }).start();
  }, [running, completed, currentPhase, orbScale]);

  const totalElapsed = useMemo(() => {
    const completedCycles = cycleIndex * cycleDuration;
    const elapsedInCycle = phases.slice(0, phaseIndex).reduce((sum, phase) => sum + phase.seconds, 0) + (currentPhase.seconds - phaseRemaining);
    return Math.min(totalDuration, completedCycles + elapsedInCycle);
  }, [cycleIndex, phaseIndex, phaseRemaining, currentPhase.seconds]);

  const progress = totalDuration === 0 ? 0 : totalElapsed / totalDuration;

  const resetSession = () => {
    setRunning(false);
    setCompleted(false);
    setCycleIndex(0);
    setPhaseIndex(0);
    setPhaseRemaining(phases[0].seconds);
    setScore(0);
    setExhaleTapped(false);
    orbScale.setValue(0.82);
    rewardedRef.current = false;
  };

  useEffect(() => {
    if (!completed || rewardedRef.current) {
      return;
    }

    const cycleBonus = Math.min(4, cycleIndex + 1);
    const scoreBonus = Math.floor(score / 20);
    const earnedBreathingMinutes = 4 + cycleBonus + scoreBonus;

    setWellness((previous) => ({
      ...previous,
      breathingMinutes: previous.breathingMinutes + earnedBreathingMinutes
    }));
    rewardedRef.current = true;
  }, [completed, cycleIndex, score, setWellness]);

  const handleExhaleTap = () => {
    if (currentPhase.label !== 'Exhale' || exhaleTapped || !running || completed) {
      return;
    }

    setExhaleTapped(true);
    setScore((previous) => previous + 10);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Breathing</Text>
        <View style={styles.headerGhost} />
      </View>

      <View style={styles.timerWrap}>
        <ProgressRing progress={progress} size={228} strokeWidth={10} />

        <Animated.View style={[styles.orb, { transform: [{ scale: orbScale }] }]} />

        <View style={styles.timerCenter}>
          <Text style={styles.phaseLabel}>{completed ? 'Complete' : currentPhase.label}</Text>
          <Text style={styles.time}>{completed ? '00:00' : secondsToClock(phaseRemaining)}</Text>
        </View>
      </View>

      <Text style={styles.hint}>{completed ? 'Amazing work. You completed the breathing journey.' : currentPhase.hint}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statText}>Cycle {Math.min(targetCycles, cycleIndex + 1)}/{targetCycles}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statText}>Calm Points {score}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => setRunning((previous) => !previous)} style={styles.playButton}>
          <Ionicons name={running ? 'pause' : 'play'} color={colors.white} size={24} />
        </Pressable>

        <Pressable onPress={resetSession} style={styles.resetButton}>
          <Ionicons name="refresh" color={colors.textPrimary} size={20} />
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={handleExhaleTap}
        style={[
          styles.exhaleButton,
          (currentPhase.label !== 'Exhale' || exhaleTapped || !running || completed) && styles.exhaleButtonDisabled
        ]}
      >
        <Ionicons name="sparkles-outline" size={16} color={colors.white} />
        <Text style={styles.exhaleButtonText}>{exhaleTapped ? 'Great Exhale' : 'Tap With Exhale'}</Text>
      </Pressable>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4
  },
  title: {
    ...typography.section,
    textAlign: 'left'
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted
  },
  headerGhost: {
    width: 36,
    height: 36
  },
  timerWrap: {
    marginTop: 30,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center'
  },
  orb: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: '#323232',
    opacity: 0.35
  },
  timerCenter: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateY: 2 }]
  },
  phaseLabel: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: 2
  },
  time: {
    ...typography.title,
    fontSize: 42,
    lineHeight: 50
  },
  hint: {
    ...typography.body,
    textAlign: 'center',
    marginTop: 18,
    marginHorizontal: 12
  },
  statsRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10
  },
  statChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  statText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  controls: {
    marginTop: 24,
    alignItems: 'center',
    gap: 14
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center'
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.stroke
  },
  resetText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  exhaleButton: {
    marginTop: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#60AF00'
  },
  exhaleButtonDisabled: {
    opacity: 0.45
  },
  exhaleButtonText: {
    ...typography.bodyStrong,
    color: colors.white,
    fontSize: 14
  }
});
