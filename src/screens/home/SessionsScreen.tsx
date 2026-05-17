import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing, typography } from '../../design/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const SessionsScreen = () => {
  const navigation = useNavigation<Nav>();
  const [gratitude, setGratitude] = useState('');
  const [shutdownDone, setShutdownDone] = useState(false);
  const [feedback, setFeedback] = useState('Pick one action. Small wins compound.');

  return (
    <Screen scroll>
      <Text style={styles.eyebrow}>Recovery library</Text>
      <Text style={styles.title}>Micro-Actions Library</Text>
      <Text style={styles.subtitle}>Choose one guided reset, complete it inside the app, and keep your health plan moving.</Text>
      <View style={styles.list}>
        <Card style={styles.actionCard}>
          <Text style={styles.category}>Breathing reset</Text>
          <Text style={styles.name}>2-min box breathing (4-4-4-4)</Text>
          <PrimaryButton
            title="Start Breathing"
            onPress={() => {
              setFeedback('Great choice. Two calm minutes now can reset your whole block.');
              navigation.navigate('BreathingSession');
            }}
          />
        </Card>
        <Card style={styles.actionCard}>
          <Text style={styles.category}>Movement care</Text>
          <Text style={styles.name}>5-min walk activation</Text>
          <PrimaryButton
            title="Start Walk"
            onPress={() => {
              setFeedback('Nice. A short walk improves blood flow and focus.');
              navigation.navigate('MovementSession');
            }}
          />
        </Card>
        <Card style={styles.actionCard}>
          <Text style={styles.category}>Mindset support</Text>
          <Text style={styles.name}>1-min gratitude note</Text>
          <TextInput
            value={gratitude}
            onChangeText={setGratitude}
            placeholder="Write one thing you appreciate today"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Pressable
            style={styles.inlineButton}
            onPress={() => setFeedback(gratitude.trim().length > 0 ? 'Saved. This is a strong resilience habit.' : 'Write one short line to complete this action.')}
          >
            <Text style={styles.inlineButtonText}>Save Note</Text>
          </Pressable>
        </Card>
        <Card style={styles.actionCard}>
          <Text style={styles.category}>Evening routine</Text>
          <Text style={styles.name}>End-of-day shutdown ritual</Text>
          <View style={styles.shutdownRow}>
            <Pressable style={[styles.toggle, shutdownDone && styles.toggleOn]} onPress={() => setShutdownDone((prev) => !prev)}>
              <Text style={styles.toggleText}>{shutdownDone ? 'Done' : 'Mark Complete'}</Text>
            </Pressable>
          </View>
        </Card>
        <Text style={styles.feedback}>{feedback}</Text>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  eyebrow: {
    ...typography.caption,
    color: colors.blueDark,
    marginBottom: 6
  },
  title: {
    ...typography.title,
    marginBottom: 6
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing.md
  },
  list: {
    gap: spacing.sm
  },
  actionCard: {
    gap: spacing.sm
  },
  category: {
    ...typography.caption,
    color: colors.blueDark
  },
  name: {
    ...typography.bodyStrong,
    marginBottom: 2
  },
  input: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    backgroundColor: colors.cardMuted,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16
  },
  inlineButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.blueDark,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  inlineButtonText: {
    ...typography.bodyStrong,
    color: colors.white
  },
  shutdownRow: {
    flexDirection: 'row'
  },
  toggle: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 999,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  toggleOn: {
    borderColor: colors.success,
    backgroundColor: colors.successSoft
  },
  toggleText: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  feedback: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.xs
  }
});
