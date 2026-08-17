import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { colors, getThemeColors, radius, spacing } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import {
  DurationPreference,
  PlanPriority,
  SupportPreference,
  fiteatsyPlanCatalog,
  recommendPlan
} from '../../services/planRecommendationService';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionPlans'>;

type Choice<T extends string | null> = {
  label: string;
  value: T;
  helper: string;
};

const supportChoices: Choice<SupportPreference>[] = [
  { label: 'Track independently', value: 'self_guided', helper: 'I want wellness tracking without regular calls.' },
  { label: 'One expert consult', value: 'one_consult', helper: 'I need a focused review and direction.' },
  { label: 'Regular expert support', value: 'regular_support', helper: 'I want ongoing guidance and accountability.' }
];

const durationChoices: Choice<DurationPreference>[] = [
  { label: 'Up to 1 month', value: 'one_month', helper: 'Start small and decide later.' },
  { label: 'Around 3 months', value: 'three_months', helper: 'Enough time for habit change.' },
  { label: '6 months+', value: 'six_months_plus', helper: 'Long-term accountability.' },
  { label: 'Not sure', value: 'not_sure', helper: 'Let Fiteatsy recommend.' }
];

const priorityChoices: Choice<PlanPriority>[] = [
  { label: 'Track wellness patterns', value: 'tracking', helper: 'Reports, wearables, and trends.' },
  { label: 'Expert guidance', value: 'expert_guidance', helper: 'Understand what to do next.' },
  { label: 'Nutrition & lifestyle', value: 'nutrition_lifestyle', helper: 'Meal and routine support.' },
  { label: 'Long-term accountability', value: 'accountability', helper: 'Stay consistent over time.' }
];

export const SubscriptionPlansScreen = ({ navigation }: Props) => {
  const { onboarding, publishedNutritionPlan, themeMode, wearableSyncData } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [supportPreference, setSupportPreference] = useState<SupportPreference>(null);
  const [durationPreference, setDurationPreference] = useState<DurationPreference>(null);
  const [priority, setPriority] = useState<PlanPriority>(null);
  const [whyVisible, setWhyVisible] = useState(false);

  const recommendation = useMemo(
    () =>
      recommendPlan({
        onboarding,
        publishedNutritionPlan,
        wearableSyncData,
        supportPreference,
        durationPreference,
        priority
      }),
    [durationPreference, onboarding, priority, publishedNutritionPlan, supportPreference, wearableSyncData]
  );

  return (
    <Screen scroll contentStyle={styles.screen}>
      <Pressable onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={22} color={palette.textPrimary} />
        <Text style={[styles.backText, { color: palette.textPrimary }]}>Back</Text>
      </Pressable>

      <View style={[styles.hero, { backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0E120F', borderColor: palette.stroke }]}>
        <Text style={styles.eyebrow}>Recommended plans</Text>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Choose support that matches your health journey.</Text>
        <Text style={[styles.body, { color: palette.textSecondary }]}>
          We use your profile, goals, tracking signals, and choices below to recommend a plan. No diagnosis or medical necessity is inferred.
        </Text>
      </View>

      <View style={[styles.recommendationCard, { backgroundColor: '#111A12', borderColor: '#2D5226' }]}>
        <View style={styles.badgeRow}>
          <Text style={styles.badge}>Recommended for you</Text>
          <Text style={styles.confidence}>{recommendation.confidenceLabel}</Text>
        </View>
        <Text style={styles.planName}>{recommendation.primary.name}</Text>
        <Text style={styles.planReason}>{recommendation.reason}</Text>
        <View style={styles.planMetaRow}>
          <Text style={styles.planMeta}>{recommendation.primary.durationLabel}</Text>
          <Text style={styles.planPrice}>{recommendation.primary.priceLabel}</Text>
          {recommendation.primary.dailyCostLabel ? <Text style={styles.planMeta}>{recommendation.primary.dailyCostLabel}</Text> : null}
        </View>
        {recommendation.primary.valueLabel ? <Text style={styles.valueLabel}>{recommendation.primary.valueLabel}</Text> : null}
        <View style={styles.benefitList}>
          {recommendation.primary.benefits.slice(0, 4).map((benefit) => (
            <View key={benefit} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={16} color="#64D900" />
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>
        <View style={styles.recommendationActions}>
          <PrimaryButton title="Choose Recommended Plan" onPress={() => navigation.navigate('ConsultantBooking')} style={styles.chooseButton} />
          <Pressable onPress={() => setWhyVisible(true)} style={styles.whyButton} accessibilityRole="button">
            <Text style={styles.whyText}>Why this plan?</Text>
          </Pressable>
        </View>
      </View>

      {recommendation.secondary ? (
        <View style={[styles.secondaryCard, { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0F1010' }]}>
          <Text style={[styles.secondaryLabel, { color: palette.textSecondary }]}>Also worth considering</Text>
          <Text style={[styles.secondaryName, { color: palette.textPrimary }]}>{recommendation.secondary.name}</Text>
          <Text style={[styles.secondaryCopy, { color: palette.textSecondary }]}>
            {recommendation.secondary.durationLabel} · {recommendation.secondary.priceLabel}
          </Text>
        </View>
      ) : null}

      <View style={[styles.helpCard, { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0F1010' }]}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Help me choose</Text>
        <ChoiceGroup title="What kind of support do you want?" choices={supportChoices} value={supportPreference} onSelect={setSupportPreference} />
        <ChoiceGroup title="How long do you want support?" choices={durationChoices} value={durationPreference} onSelect={setDurationPreference} />
        <ChoiceGroup title="What matters most right now?" choices={priorityChoices} value={priority} onSelect={setPriority} />
      </View>

      <View style={styles.catalogSection}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>All plans</Text>
        {fiteatsyPlanCatalog.map((plan) => (
          <View key={plan.id} style={[styles.catalogCard, { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0F1010' }]}>
            <View style={styles.catalogTop}>
              <Text style={[styles.catalogName, { color: palette.textPrimary }]}>{plan.name}</Text>
              <Text style={styles.catalogPrice}>{plan.priceLabel}</Text>
            </View>
            <Text style={[styles.catalogMeta, { color: palette.textSecondary }]}>
              {plan.durationLabel}{plan.dailyCostLabel ? ` · ${plan.dailyCostLabel}` : ''}
            </Text>
            {plan.valueLabel ? <Text style={styles.catalogValue}>{plan.valueLabel}</Text> : null}
          </View>
        ))}
      </View>

      <Modal visible={whyVisible} transparent animationType="slide" onRequestClose={() => setWhyVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0D0F0D' }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: palette.textPrimary }]}>Why this plan?</Text>
            <Text style={[styles.sheetBody, { color: palette.textSecondary }]}>{recommendation.reason}</Text>
            {recommendation.signals.map((signal) => (
              <View key={signal} style={styles.signalRow}>
                <Ionicons name="ellipse" size={8} color="#64D900" />
                <Text style={[styles.signalText, { color: palette.textSecondary }]}>{signal}</Text>
              </View>
            ))}
            <PrimaryButton title="Close" onPress={() => setWhyVisible(false)} style={styles.closeButton} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const ChoiceGroup = <T extends string | null>({
  title,
  choices,
  value,
  onSelect
}: {
  title: string;
  choices: Choice<T>[];
  value: T;
  onSelect: (value: T) => void;
}) => (
  <View style={styles.choiceGroup}>
    <Text style={styles.choiceTitle}>{title}</Text>
    {choices.map((choice) => {
      const selected = choice.value === value;
      return (
        <Pressable
          key={choice.label}
          onPress={() => onSelect(choice.value)}
          style={[styles.choiceRow, selected && styles.choiceRowSelected]}
          accessibilityRole="button"
          accessibilityState={{ selected }}
        >
          <View style={[styles.radio, selected && styles.radioSelected]} />
          <View style={styles.choiceCopy}>
            <Text style={styles.choiceLabel}>{choice.label}</Text>
            <Text style={styles.choiceHelper}>{choice.helper}</Text>
          </View>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  backText: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 15
  },
  hero: {
    borderWidth: 1,
    borderRadius: 28,
    gap: 10,
    padding: spacing.lg
  },
  eyebrow: {
    color: '#64D900',
    fontFamily: 'Exo_700Bold',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  title: {
    fontFamily: 'Exo_700Bold',
    fontSize: 29,
    lineHeight: 35
  },
  body: {
    fontFamily: 'Exo_400Regular',
    fontSize: 15,
    lineHeight: 22
  },
  recommendationCard: {
    borderWidth: 1,
    borderRadius: 30,
    gap: spacing.md,
    padding: spacing.lg
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  badge: {
    backgroundColor: '#64D900',
    borderRadius: radius.pill,
    color: '#092104',
    fontFamily: 'Exo_700Bold',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  confidence: {
    backgroundColor: '#22301E',
    borderRadius: radius.pill,
    color: '#C9F6B7',
    fontFamily: 'Exo_700Bold',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  planName: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 27,
    lineHeight: 33
  },
  planReason: {
    color: '#DDE8D8',
    fontFamily: 'Exo_400Regular',
    fontSize: 15,
    lineHeight: 22
  },
  planMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  planMeta: {
    backgroundColor: '#1C261B',
    borderRadius: radius.pill,
    color: '#FFFFFF',
    fontFamily: 'Exo_600SemiBold',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  planPrice: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    color: '#101510',
    fontFamily: 'Exo_700Bold',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  valueLabel: {
    color: colors.warning,
    fontFamily: 'Exo_700Bold',
    fontSize: 13,
    lineHeight: 18
  },
  benefitList: {
    gap: 8
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  benefitText: {
    color: '#FFFFFF',
    flex: 1,
    fontFamily: 'Exo_500Medium',
    fontSize: 14
  },
  recommendationActions: {
    gap: 10
  },
  chooseButton: {
    backgroundColor: '#64D900'
  },
  whyButton: {
    alignItems: 'center',
    borderColor: '#31502B',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: 14
  },
  whyText: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 15
  },
  secondaryCard: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 6,
    padding: spacing.md
  },
  secondaryLabel: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase'
  },
  secondaryName: {
    fontFamily: 'Exo_700Bold',
    fontSize: 19
  },
  secondaryCopy: {
    fontFamily: 'Exo_400Regular',
    fontSize: 13
  },
  helpCard: {
    borderRadius: 26,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg
  },
  sectionTitle: {
    fontFamily: 'Exo_700Bold',
    fontSize: 21
  },
  choiceGroup: {
    gap: 10
  },
  choiceTitle: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 15
  },
  choiceRow: {
    alignItems: 'center',
    borderColor: '#2A2F2D',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 13
  },
  choiceRowSelected: {
    backgroundColor: '#163512',
    borderColor: '#64D900'
  },
  radio: {
    borderColor: '#7D8981',
    borderRadius: 9,
    borderWidth: 2,
    height: 18,
    width: 18
  },
  radioSelected: {
    backgroundColor: '#64D900',
    borderColor: '#64D900'
  },
  choiceCopy: {
    flex: 1,
    gap: 3
  },
  choiceLabel: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 14
  },
  choiceHelper: {
    color: '#BFC8C1',
    fontFamily: 'Exo_400Regular',
    fontSize: 12,
    lineHeight: 17
  },
  catalogSection: {
    gap: 10
  },
  catalogCard: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 7,
    padding: spacing.md
  },
  catalogTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  catalogName: {
    flex: 1,
    fontFamily: 'Exo_700Bold',
    fontSize: 16
  },
  catalogPrice: {
    color: '#64D900',
    fontFamily: 'Exo_700Bold',
    fontSize: 16
  },
  catalogMeta: {
    fontFamily: 'Exo_400Regular',
    fontSize: 13
  },
  catalogValue: {
    color: colors.warning,
    fontFamily: 'Exo_600SemiBold',
    fontSize: 12
  },
  modalOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.64)',
    flex: 1,
    justifyContent: 'flex-end'
  },
  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    gap: spacing.md,
    padding: spacing.lg
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#69716C',
    borderRadius: 3,
    height: 5,
    width: 48
  },
  sheetTitle: {
    fontFamily: 'Exo_700Bold',
    fontSize: 24
  },
  sheetBody: {
    fontFamily: 'Exo_400Regular',
    fontSize: 15,
    lineHeight: 22
  },
  signalRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10
  },
  signalText: {
    flex: 1,
    fontFamily: 'Exo_400Regular',
    fontSize: 14,
    lineHeight: 20
  },
  closeButton: {
    marginTop: spacing.xs
  }
});
