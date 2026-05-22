import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { ProgressRing } from '../../components/ProgressRing';
import { colors, typography } from '../../design/tokens';
import { secondsToClock } from '../../utils/time';

type Props = {
  title: string;
  startSeconds: number;
  actionLabel: string;
  onComplete?: () => void;
};

export const SessionTimerScreen = ({ title, startSeconds, actionLabel, onComplete }: Props) => {
  const navigation = useNavigation();
  const [remainingSeconds, setRemainingSeconds] = useState(startSeconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) {
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setRunning(false);
          if (prev > 0) {
            onComplete?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onComplete, running]);

  const progress = useMemo(() => {
    if (startSeconds <= 0) {
      return 0;
    }
    return remainingSeconds / startSeconds;
  }, [remainingSeconds, startSeconds]);

  const reset = () => {
    setRunning(false);
    setRemainingSeconds(startSeconds);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <AppBackButton iconOnly onPress={() => navigation.goBack()} />
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerGhost} />
      </View>
      <View style={styles.timerWrap}>
        <ProgressRing progress={progress} size={208} strokeWidth={8} />
        <View style={styles.timerCenter}>
          <Text style={styles.time}>{secondsToClock(remainingSeconds)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => setRunning((prev) => !prev)} style={styles.playButton}>
          <Ionicons name={running ? 'pause' : 'play'} color={colors.white} size={26} />
        </Pressable>
        <Pressable onPress={reset} style={styles.resetButton}>
          <Ionicons name="refresh" color={colors.textPrimary} size={20} />
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
      </View>

      <Text style={styles.caption}>{actionLabel}</Text>
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
    marginTop: 42,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center'
  },
  timerCenter: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateY: 2 }]
  },
  time: {
    ...typography.title,
    fontSize: 40,
    lineHeight: 48
  },
  controls: {
    marginTop: 42,
    alignItems: 'center',
    gap: 16
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
  caption: {
    ...typography.body,
    textAlign: 'center',
    marginTop: 18
  }
});
