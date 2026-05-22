import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

const confidenceLabel = {
  high: 'High Confidence',
  medium: 'Medium Confidence',
  low: 'Low Confidence'
} as const;

export const CycleInsightsScreen = () => {
  const navigation = useNavigation();
  const { getCycleInsights } = useAppContext();
  const insights = getCycleInsights();

  return (
    <Screen scroll>
      <AppBackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Cycle Insights</Text>
      <View style={styles.card}>
        <Text style={styles.metric}>Average cycle length: {insights.averageCycleLengthDays} days</Text>
        <Text style={styles.metric}>Average period duration: {insights.averagePeriodDurationDays} days</Text>
        <Text style={styles.metric}>Prediction confidence: {confidenceLabel[insights.confidence]}</Text>
        <Text style={styles.metric}>Consistency score: {insights.consistencyScore}/100</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Common symptoms</Text>
        {insights.commonSymptoms.length === 0 ? (
          <Text style={styles.empty}>No symptom trends yet. Keep logging daily.</Text>
        ) : (
          insights.commonSymptoms.map((item) => (
            <Text key={item.symptom} style={styles.metric}>{item.symptom.replace('_', ' ')}: {item.count}</Text>
          ))
        )}
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>Important</Text>
        <Text style={styles.noteText}>These are probabilistic cycle insights based on your history, not diagnostic or guaranteed predictions.</Text>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  title: {
    ...typography.section
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
    padding: spacing.md,
    gap: 8,
    marginBottom: spacing.sm
  },
  section: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  metric: {
    ...typography.caption,
    color: colors.textSecondary
  },
  empty: {
    ...typography.caption
  },
  noteCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
    padding: spacing.md
  },
  noteTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    marginBottom: 4
  },
  noteText: {
    ...typography.caption,
    color: colors.textSecondary
  }
});
