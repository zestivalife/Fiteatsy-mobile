import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { colors, getThemeColors, radius, spacing, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

const confidenceLabel = {
  high: 'High Confidence',
  medium: 'Medium Confidence',
  low: 'Low Confidence'
} as const;

export const CycleInsightsScreen = () => {
  const navigation = useNavigation();
  const { getCycleInsights, themeMode } = useAppContext();
  const insights = getCycleInsights();
  const palette = getThemeColors(themeMode);
  const isLight = themeMode === 'light';
  const darkGraySurfaceText = isLight ? '#000000' : '#FFFFFF';

  return (
    <Screen scroll>
      <AppBackButton onPress={() => navigation.goBack()} />
      <Text style={[styles.title, { color: darkGraySurfaceText }]}>Cycle Insights</Text>
      <View style={[styles.card, { borderColor: palette.stroke, backgroundColor: isLight ? '#FFFFFF' : palette.cardMuted }]}>
        <Text style={[styles.metric, { color: darkGraySurfaceText }]}>Average cycle length: {insights.averageCycleLengthDays} days</Text>
        <Text style={[styles.metric, { color: darkGraySurfaceText }]}>Average period duration: {insights.averagePeriodDurationDays} days</Text>
        <Text style={[styles.metric, { color: darkGraySurfaceText }]}>Prediction confidence: {confidenceLabel[insights.confidence]}</Text>
        <Text style={[styles.metric, { color: darkGraySurfaceText }]}>Consistency score: {insights.consistencyScore}/100</Text>
      </View>

      <View style={[styles.card, { borderColor: palette.stroke, backgroundColor: isLight ? '#FFFFFF' : palette.cardMuted }]}>
        <Text style={[styles.section, { color: darkGraySurfaceText }]}>Common symptoms</Text>
        {insights.commonSymptoms.length === 0 ? (
          <Text style={[styles.empty, { color: darkGraySurfaceText }]}>No symptom trends yet. Keep logging daily.</Text>
        ) : (
          insights.commonSymptoms.map((item) => (
            <Text key={item.symptom} style={[styles.metric, { color: darkGraySurfaceText }]}>{item.symptom.replace('_', ' ')}: {item.count}</Text>
          ))
        )}
      </View>

      <View style={[styles.noteCard, { borderColor: palette.warning, backgroundColor: isLight ? colors.warningSoft : palette.cardMuted }]}>
        <Text style={[styles.noteTitle, { color: darkGraySurfaceText }]}>Important</Text>
        <Text style={[styles.noteText, { color: darkGraySurfaceText }]}>These are probabilistic cycle insights based on your history, not diagnostic or guaranteed predictions.</Text>
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
