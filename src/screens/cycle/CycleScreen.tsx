import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation/types';
import { CycleEnergy, CycleFlowIntensity, CycleMood, CycleSymptom } from '../../types';
import { useAppContext } from '../../state/AppContext';
import { daysUntil, getCurrentCycleDay } from '../../services/cyclePredictionService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const symptomOptions: Array<{ label: string; value: CycleSymptom }> = [
  { label: 'Cramps', value: 'cramps' },
  { label: 'Bloating', value: 'bloating' },
  { label: 'Headache', value: 'headache' },
  { label: 'Acne', value: 'acne' },
  { label: 'Fatigue', value: 'fatigue' },
  { label: 'Breast Tenderness', value: 'breast_tenderness' },
  { label: 'Mood Swings', value: 'mood_swings' }
];

const moodOptions: Array<{ label: string; value: CycleMood; emoji: string }> = [
  { label: 'Happy', value: 'happy', emoji: '🙂' },
  { label: 'Low', value: 'low', emoji: '😔' },
  { label: 'Irritated', value: 'irritated', emoji: '😣' },
  { label: 'Calm', value: 'calm', emoji: '😌' },
  { label: 'Anxious', value: 'anxious', emoji: '😟' },
  { label: 'Emotional', value: 'emotional', emoji: '🥹' }
];

export const CycleScreen = () => {
  const navigation = useNavigation<Nav>();
  const {
    assessment,
    cycleLogs,
    cyclePrediction,
    logCycleForDate,
    getCycleDaySnapshot
  } = useAppContext();

  const [logOpen, setLogOpen] = useState(false);
  const [periodStarted, setPeriodStarted] = useState(false);
  const [periodEnded, setPeriodEnded] = useState(false);
  const [flow, setFlow] = useState<CycleFlowIntensity | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [symptoms, setSymptoms] = useState<CycleSymptom[]>([]);
  const [mood, setMood] = useState<CycleMood | null>(null);
  const [energy, setEnergy] = useState<CycleEnergy | null>(null);
  const [notes, setNotes] = useState('');

  const todayISO = new Date().toISOString();
  const snapshot = getCycleDaySnapshot(todayISO);
  const cycleDay = getCurrentCycleDay(cycleLogs, todayISO);
  const daysToPeriod = daysUntil(cyclePrediction.predictedNextPeriodStartISO, todayISO);
  const daysToOvulation = daysUntil(cyclePrediction.predictedOvulationISO, todayISO);

  const statusTitle = useMemo(() => {
    if (cycleDay) return `Day ${cycleDay} of cycle`;
    return 'Build your cycle history';
  }, [cycleDay]);

  const statusSubtitle = useMemo(() => {
    if (daysToPeriod !== null && daysToPeriod >= 0) {
      if (daysToPeriod === 0) return 'Predicted period may start today';
      return `Predicted period in ${daysToPeriod} day${daysToPeriod > 1 ? 's' : ''}`;
    }
    if (daysToOvulation !== null && daysToOvulation >= 0 && daysToOvulation <= 3) {
      return 'Ovulation likely approaching';
    }
    if (snapshot.phase === 'ovulation_window') return 'Predicted fertile window active';
    return 'Cycle insights based on your history';
  }, [daysToOvulation, daysToPeriod, snapshot.phase]);

  const isWomenOnlyEnabled = assessment?.gender === 'Female';

  const resetForm = () => {
    setPeriodStarted(false);
    setPeriodEnded(false);
    setFlow(null);
    setShowOptional(false);
    setSymptoms([]);
    setMood(null);
    setEnergy(null);
    setNotes('');
  };

  const toggleSymptom = (value: CycleSymptom) => {
    setSymptoms((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]));
  };

  const saveQuickLog = async () => {
    await logCycleForDate({
      dateISO: todayISO,
      periodStarted,
      periodEnded,
      flow,
      symptoms,
      mood,
      energy,
      notes
    });
    setLogOpen(false);
    resetForm();
  };

  return (
    <Screen scroll>
      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      <Text style={styles.title}>Cycle</Text>
      {!isWomenOnlyEnabled ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Cycle tracking is for women only in this build</Text>
          <Text style={styles.noticeBody}>Switch profile gender to Female if you want to use this module.</Text>
        </View>
      ) : null}

      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>{statusTitle}</Text>
        <Text style={styles.statusSubtitle}>{statusSubtitle}</Text>
        <View style={styles.phaseRow}>
          <View style={[styles.phasePill, snapshot.phase === 'menstrual' && styles.phaseActive]}><Text style={styles.phaseText}>Menstrual</Text></View>
          <View style={[styles.phasePill, snapshot.phase === 'follicular' && styles.phaseActive]}><Text style={styles.phaseText}>Follicular</Text></View>
          <View style={[styles.phasePill, snapshot.phase === 'ovulation_window' && styles.phaseActiveBlue]}><Text style={styles.phaseText}>Ovulation</Text></View>
          <View style={[styles.phasePill, snapshot.phase === 'luteal' && styles.phaseActivePurple]}><Text style={styles.phaseText}>Luteal</Text></View>
        </View>
      </View>

      <Pressable style={[styles.logButton, !isWomenOnlyEnabled && styles.logButtonDisabled]} onPress={() => isWomenOnlyEnabled && setLogOpen(true)}>
        <Ionicons name="add-circle-outline" size={18} color={colors.textPrimary} />
        <Text style={styles.logButtonText}>Log Today</Text>
      </Pressable>

      <View style={styles.quickRow}>
        <Pressable style={styles.quickCard} onPress={() => navigation.navigate('CycleCalendar')}><Text style={styles.quickTitle}>Calendar</Text><Text style={styles.quickBody}>View logs and predictions</Text></Pressable>
        <Pressable style={styles.quickCard} onPress={() => navigation.navigate('CycleInsights')}><Text style={styles.quickTitle}>Insights</Text><Text style={styles.quickBody}>Patterns and consistency</Text></Pressable>
      </View>
      <Pressable style={styles.quickCard} onPress={() => navigation.navigate('CycleNotifications')}><Text style={styles.quickTitle}>Reminders</Text><Text style={styles.quickBody}>Manage cycle notification timing</Text></Pressable>

      <Modal visible={logOpen} transparent animationType="slide" onRequestClose={() => setLogOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setLogOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Quick Log</Text>

            <ScrollView contentContainerStyle={styles.sheetContent}>
              <View style={styles.row}>
                <Pressable style={[styles.chip, periodStarted && styles.chipActive]} onPress={() => setPeriodStarted((v) => !v)}><Text style={styles.chipText}>Period Started</Text></Pressable>
                <Pressable style={[styles.chip, periodEnded && styles.chipActive]} onPress={() => setPeriodEnded((v) => !v)}><Text style={styles.chipText}>Period Ended</Text></Pressable>
              </View>

              <Text style={styles.section}>Flow</Text>
              <View style={styles.row}>
                {(['light', 'medium', 'heavy'] as CycleFlowIntensity[]).map((level) => (
                  <Pressable key={level} style={[styles.chip, flow === level && styles.chipActive]} onPress={() => setFlow(level)}><Text style={styles.chipText}>{level[0].toUpperCase() + level.slice(1)}</Text></Pressable>
                ))}
              </View>

              <Pressable style={styles.optionalToggle} onPress={() => setShowOptional((v) => !v)}>
                <Text style={styles.optionalToggleText}>{showOptional ? 'Hide optional details' : 'Add symptoms, mood, energy, notes (optional)'}</Text>
              </Pressable>

              {showOptional ? (
                <>
                  <Text style={styles.section}>Symptoms</Text>
                  <View style={styles.wrapRow}>
                    {symptomOptions.map((item) => (
                      <Pressable key={item.value} style={[styles.chip, symptoms.includes(item.value) && styles.chipActive]} onPress={() => toggleSymptom(item.value)}><Text style={styles.chipText}>{item.label}</Text></Pressable>
                    ))}
                  </View>

                  <Text style={styles.section}>Mood</Text>
                  <View style={styles.wrapRow}>
                    {moodOptions.map((item) => (
                      <Pressable key={item.value} style={[styles.chip, mood === item.value && styles.chipActive]} onPress={() => setMood(item.value)}><Text style={styles.chipText}>{item.emoji} {item.label}</Text></Pressable>
                    ))}
                  </View>

                  <Text style={styles.section}>Energy</Text>
                  <View style={styles.row}>
                    {(['high', 'medium', 'low'] as CycleEnergy[]).map((value) => (
                      <Pressable key={value} style={[styles.chip, energy === value && styles.chipActive]} onPress={() => setEnergy(value)}><Text style={styles.chipText}>{value[0].toUpperCase() + value.slice(1)}</Text></Pressable>
                    ))}
                  </View>

                  <Text style={styles.section}>Notes</Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Optional"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    maxLength={220}
                  />
                </>
              ) : null}

              <Pressable style={styles.saveBtn} onPress={saveQuickLog}><Text style={styles.saveText}>Save Today</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  backBtn: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stroke,
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginBottom: spacing.sm
  },
  backText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  title: {
    ...typography.section,
    marginBottom: spacing.sm
  },
  noticeCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.cardMuted,
    padding: spacing.md,
    marginBottom: spacing.sm
  },
  noticeTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    marginBottom: 6
  },
  noticeBody: {
    ...typography.caption
  },
  statusCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
    padding: spacing.md,
    marginBottom: spacing.sm
  },
  statusTitle: {
    ...typography.bodyStrong,
    fontSize: 18,
    marginBottom: 6
  },
  statusSubtitle: {
    ...typography.caption,
    marginBottom: spacing.sm,
    color: colors.textSecondary
  },
  phaseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  phasePill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  phaseActive: {
    backgroundColor: 'rgba(208,64,83,0.20)',
    borderColor: '#EA7E8C'
  },
  phaseActiveBlue: {
    backgroundColor: 'rgba(111,188,236,0.20)',
    borderColor: '#7BB8DB'
  },
  phaseActivePurple: {
    backgroundColor: 'rgba(144,128,255,0.22)',
    borderColor: '#9C86FF'
  },
  phaseText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  logButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.sm
  },
  logButtonDisabled: {
    opacity: 0.5
  },
  logButtonText: {
    ...typography.bodyStrong,
    fontSize: 15
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  quickCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    padding: spacing.md
  },
  quickTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    marginBottom: 6
  },
  quickBody: {
    ...typography.caption
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end'
  },
  sheetBackdrop: {
    flex: 1
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardRaised,
    padding: spacing.md
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.textMuted,
    marginBottom: spacing.sm
  },
  sheetTitle: {
    ...typography.bodyStrong,
    fontSize: 18,
    marginBottom: spacing.sm
  },
  sheetContent: {
    gap: spacing.sm,
    paddingBottom: spacing.lg
  },
  section: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    justifyContent: 'center'
  },
  chipActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  chipText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 13
  },
  optionalToggle: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.stroke,
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  optionalToggleText: {
    ...typography.caption,
    color: colors.textSecondary
  },
  input: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    color: colors.textPrimary
  },
  saveBtn: {
    marginTop: 4,
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveText: {
    ...typography.bodyStrong,
    color: colors.white,
    fontSize: 15
  }
});
