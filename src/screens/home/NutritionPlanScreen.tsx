import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { AppBackButton } from '../../components/AppBackButton';
import { getThemeColors, spacing, radius, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { markNutritionMealConsumed } from '../../services/nutritionPlanService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const mealOrder = [
  { key: 'earlyMorning', label: 'Early Morning' },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'midMorningSnack', label: 'Mid Morning Snack' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'eveningSnack', label: 'Evening Snack' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'bedtimeNutrition', label: 'Bedtime Nourishment' },
] as const;

export const NutritionPlanScreen = () => {
  const navigation = useNavigation<Nav>();
  const { themeMode, publishedNutritionPlan } = useAppContext();
  const palette = getThemeColors(themeMode);
  const content = publishedNutritionPlan?.version.content;
  const [mealLogState, setMealLogState] = React.useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
  const [mealLogError, setMealLogError] = React.useState<string | null>(null);

  if (!publishedNutritionPlan || !content) {
    return (
      <Screen contentStyle={styles.screen}>
        <View style={styles.header}>
          <AppBackButton onPress={() => navigation.goBack()} iconOnly />
          <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>Nutrition Plan</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={[styles.emptyState, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>Your personalised nutrition plan is being prepared.</Text>
          <Text style={[styles.emptyBody, { color: palette.textMuted }]}>
            Your consultant will publish your daily meals, hydration rhythm, and guidance here once review is complete.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <AppBackButton onPress={() => navigation.goBack()} iconOnly />
        <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>Your Nutrition Plan</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <Text style={[styles.eyebrow, { color: palette.blue }]}>Published plan</Text>
          <Text style={[styles.heroTitle, { color: palette.textPrimary }]}>
            {content.nutritionSnapshot.programmeName || 'Personalised care plan'}
          </Text>
          <Text style={[styles.heroSub, { color: palette.textMuted }]}>
            Focus: {content.nutritionSnapshot.personalisedPlanFocus || 'Daily meal consistency and recovery support'}
          </Text>

          <View style={styles.targetGrid}>
            <MetricPill label="Calories" value={content.dailyTargets.calories != null ? `${content.dailyTargets.calories} kcal` : 'Pending'} palette={palette} />
            <MetricPill label="Protein" value={content.dailyTargets.protein != null ? `${content.dailyTargets.protein} g` : 'Pending'} palette={palette} />
            <MetricPill label="Hydration" value={content.dailyTargets.hydration != null ? `${content.dailyTargets.hydration} L` : 'Pending'} palette={palette} />
          </View>
        </View>

        <SectionTitle title="Today’s meals" color={palette.textPrimary} />
        {mealOrder.map(({ key, label }) => {
          const section = content.mealPlan[key];
          return (
            <View key={key} style={[styles.sectionCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
              <View style={styles.sectionHead}>
                <View>
                  <Text style={[styles.sectionLabel, { color: palette.textPrimary }]}>{label}</Text>
                  <Text style={[styles.sectionWindow, { color: palette.textMuted }]}>{section.window}</Text>
                </View>
                <Text style={[styles.sectionFocus, { color: palette.blue }]}>{section.focus}</Text>
              </View>
              {section.options.map((option) => (
                <View key={`${key}-${option.slot}-${option.meal}`} style={[styles.optionCard, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }]}>
                  <Text style={[styles.optionMeal, { color: palette.textPrimary }]}>{option.meal}</Text>
                  <Text style={[styles.optionPortion, { color: palette.textMuted }]}>{option.portion}</Text>
                  <Text style={[styles.optionNote, { color: palette.textSecondary }]}>{option.prepNote}</Text>
                  <View style={styles.optionMetaRow}>
                    <Text style={[styles.optionMeta, { color: palette.textMuted }]}>{option.approxKcal != null ? `${option.approxKcal} kcal` : 'Calories flexible'}</Text>
                    <Text style={[styles.optionMeta, { color: palette.textMuted }]}>{option.proteinGrams != null ? `${option.proteinGrams} g protein` : 'Protein flexible'}</Text>
                  </View>
                  {option.slot === 1 ? (
                    <Pressable
                      onPress={async () => {
                        if (!publishedNutritionPlan) return;
                        const actionKey = `${key}-${option.slot}`;
                        setMealLogError(null);
                        setMealLogState((current) => ({ ...current, [actionKey]: 'saving' }));
                        try {
                          await markNutritionMealConsumed({
                            planId: publishedNutritionPlan.plan.id,
                            versionId: publishedNutritionPlan.version.id,
                            mealKey: key,
                            mealLabel: label,
                            mealName: option.meal,
                            quantityLabel: option.portion,
                          });
                          setMealLogState((current) => ({ ...current, [actionKey]: 'saved' }));
                        } catch (error) {
                          setMealLogState((current) => ({ ...current, [actionKey]: 'idle' }));
                          setMealLogError(error instanceof Error ? error.message : 'Unable to save this meal check right now.');
                        }
                      }}
                      style={[
                        styles.consumeButton,
                        {
                          backgroundColor: mealLogState[`${key}-${option.slot}`] === 'saved' ? palette.successSoft : palette.card,
                          borderColor: mealLogState[`${key}-${option.slot}`] === 'saved' ? palette.success : palette.stroke,
                        },
                      ]}
                    >
                      <Ionicons
                        name={mealLogState[`${key}-${option.slot}`] === 'saved' ? 'checkmark-circle' : 'restaurant-outline'}
                        size={16}
                        color={mealLogState[`${key}-${option.slot}`] === 'saved' ? palette.success : palette.textPrimary}
                      />
                      <Text
                        style={[
                          styles.consumeButtonText,
                          { color: mealLogState[`${key}-${option.slot}`] === 'saved' ? palette.success : palette.textPrimary },
                        ]}
                      >
                        {mealLogState[`${key}-${option.slot}`] === 'saving'
                          ? 'Saving...'
                          : mealLogState[`${key}-${option.slot}`] === 'saved'
                            ? 'Marked consumed'
                            : 'Mark consumed'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}
        {mealLogError ? (
          <View style={[styles.inlineMessage, { backgroundColor: '#FDE8EC', borderColor: '#D94F63' }]}>
            <Text style={[styles.inlineMessageText, { color: '#D94F63' }]}>{mealLogError}</Text>
          </View>
        ) : null}

        <SectionTitle title="Hydration rhythm" color={palette.textPrimary} />
        <View style={[styles.sectionCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          {content.hydrationRhythm.map((item) => (
            <View key={`hydration-${item.slot}`} style={styles.timelineRow}>
              <View style={[styles.timelineDot, { backgroundColor: palette.blue }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.timelineAnchor, { color: palette.textPrimary }]}>{item.anchor} • {item.quantity}</Text>
                <Text style={[styles.timelineNote, { color: palette.textMuted }]}>{item.note}</Text>
              </View>
            </View>
          ))}
        </View>

        <SectionTitle title="Smart substitutions" color={palette.textPrimary} />
        <View style={[styles.sectionCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          {content.smartSubstitutions.map((item) => (
            <View key={`${item.foodGroup}-${item.usualChoice}`} style={styles.substitutionRow}>
              <Text style={[styles.substitutionGroup, { color: palette.textPrimary }]}>{item.foodGroup}</Text>
              <Text style={[styles.substitutionText, { color: palette.textMuted }]}>{`${item.usualChoice} -> ${item.alternative}`}</Text>
            </View>
          ))}
        </View>

        <SectionTitle title="Weekly success guide" color={palette.textPrimary} />
        <View style={[styles.sectionCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          {content.weeklySuccessGuide.map((item, index) => (
            <View key={`guide-${index}`} style={styles.bulletRow}>
              <View style={[styles.bulletDot, { backgroundColor: palette.blue }]} />
              <Text style={[styles.bulletText, { color: palette.textSecondary }]}>{item}</Text>
            </View>
          ))}
        </View>

        <SectionTitle title="Consultant notes" color={palette.textPrimary} />
        <View style={[styles.sectionCard, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          {content.supplementsAndClinicalNotes.map((item, index) => (
            <View key={`note-${index}-${item.note}`} style={[styles.noteCard, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }]}>
              <Text style={[styles.noteTitle, { color: palette.textPrimary }]}>{item.supplement || 'Clinical note'}</Text>
              <Text style={[styles.noteMeta, { color: palette.textMuted }]}>
                {[item.dose, item.timing, item.duration].filter(Boolean).join(' • ') || 'Review guidance'}
              </Text>
              <Text style={[styles.noteBody, { color: palette.textSecondary }]}>{item.note || 'No additional consultant note provided.'}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
};

const SectionTitle = ({ title, color }: { title: string; color: string }) => (
  <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
);

const MetricPill = ({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: ReturnType<typeof getThemeColors>;
}) => (
  <View style={[styles.metricPill, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }]}>
    <Text style={[styles.metricLabel, { color: palette.textMuted }]}>{label}</Text>
    <Text style={[styles.metricValue, { color: palette.textPrimary }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    padding: spacing.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    ...typography.section,
    fontSize: 22,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  eyebrow: {
    ...typography.caption,
    fontFamily: 'Exo_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  heroTitle: {
    ...typography.title,
    marginTop: spacing.xs,
  },
  heroSub: {
    ...typography.body,
    marginTop: spacing.xs,
  },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metricPill: {
    minWidth: '30%',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  metricLabel: {
    ...typography.caption,
  },
  metricValue: {
    ...typography.bodyStrong,
    marginTop: 2,
  },
  sectionTitle: {
    ...typography.section,
    marginBottom: spacing.sm,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...typography.bodyStrong,
  },
  sectionWindow: {
    ...typography.caption,
    marginTop: 2,
  },
  sectionFocus: {
    ...typography.caption,
    fontFamily: 'Exo_600SemiBold',
    flexShrink: 1,
    textAlign: 'right',
  },
  optionCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  optionMeal: {
    ...typography.bodyStrong,
  },
  optionPortion: {
    ...typography.caption,
    marginTop: 2,
  },
  optionNote: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  optionMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  optionMeta: {
    ...typography.caption,
  },
  consumeButton: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  consumeButtonText: {
    ...typography.caption,
    fontFamily: 'Exo_600SemiBold',
  },
  inlineMessage: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  inlineMessageText: {
    ...typography.caption,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 7,
  },
  timelineAnchor: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  timelineNote: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  substitutionRow: {
    marginBottom: spacing.sm,
  },
  substitutionGroup: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  substitutionText: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  bulletText: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  noteCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  noteTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
  },
  noteMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  noteBody: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  emptyTitle: {
    ...typography.section,
    fontSize: 20,
  },
  emptyBody: {
    ...typography.body,
    marginTop: spacing.sm,
  },
});
