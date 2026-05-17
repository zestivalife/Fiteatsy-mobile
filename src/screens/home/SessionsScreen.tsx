import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const statusTone = {
  taken: colors.success,
  upcoming: colors.info,
  missed: colors.danger,
  snoozed: colors.warning,
  skipped: colors.textMuted
} as const;

export const SessionsScreen = () => {
  const navigation = useNavigation<Nav>();
  const [gratitude, setGratitude] = useState('');
  const [shutdownDone, setShutdownDone] = useState(false);
  const [feedback, setFeedback] = useState('Pick one action. Small wins compound.');
  const [medicationOpen, setMedicationOpen] = useState(false);

  const {
    medications,
    getMedicationTimelineForDate,
    markMedicationAction,
    pauseMedication,
    deleteMedication
  } = useAppContext();

  const todayTimeline = useMemo(() => getMedicationTimelineForDate(new Date().toISOString()), [getMedicationTimelineForDate, medications]);

  return (
    <Screen scroll>
      <Text style={styles.eyebrow}>Recovery library</Text>
      <Text style={styles.title}>Micro-Actions Library</Text>
      <Text style={styles.subtitle}>Choose one guided reset, complete it inside the app, and keep your health plan moving.</Text>
      <View style={styles.list}>
        <Card style={styles.actionCard}>
          <Text style={styles.category}>Medication</Text>
          <Text style={styles.name}>Manage meds, schedules, reminders, and adherence</Text>
          <PrimaryButton title="Medication" onPress={() => setMedicationOpen(true)} />
        </Card>

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

      <Modal visible={medicationOpen} animationType="slide" transparent onRequestClose={() => setMedicationOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setMedicationOpen(false)} />
          <View style={styles.sheetWrap}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Medication Dashboard</Text>

            <ScrollView contentContainerStyle={styles.sheetContent}>
              <Text style={styles.section}>Today&apos;s Medications</Text>
              {todayTimeline.length === 0 ? (
                <Text style={styles.empty}>No medications scheduled for today.</Text>
              ) : (
                todayTimeline.map((item) => (
                  <View key={`${item.medication.id}-${item.scheduledForISO}`} style={styles.medRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medName}>{item.medication.name}</Text>
                      <Text style={styles.medTime}>{new Date(item.scheduledForISO).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusTone[item.status] }]}>
                      <Text style={styles.statusText}>{item.status}</Text>
                    </View>
                  </View>
                ))
              )}

              <Text style={styles.section}>Quick Actions</Text>
              {todayTimeline.slice(0, 3).map((item) => (
                <View key={`quick-${item.medication.id}-${item.scheduledForISO}`} style={styles.quickRow}>
                  <Text style={styles.quickLabel}>{item.medication.name}</Text>
                  <View style={styles.quickActions}>
                    <Pressable style={styles.quickBtn} onPress={() => markMedicationAction({ medicationId: item.medication.id, scheduledForISO: item.scheduledForISO, status: 'taken' })}><Text style={styles.quickBtnText}>Taken</Text></Pressable>
                    <Pressable style={styles.quickBtn} onPress={() => markMedicationAction({ medicationId: item.medication.id, scheduledForISO: item.scheduledForISO, status: 'snoozed', snoozeMinutes: 10 })}><Text style={styles.quickBtnText}>Snooze</Text></Pressable>
                    <Pressable style={styles.quickBtn} onPress={() => markMedicationAction({ medicationId: item.medication.id, scheduledForISO: item.scheduledForISO, status: 'skipped' })}><Text style={styles.quickBtnText}>Skip</Text></Pressable>
                  </View>
                </View>
              ))}

              <View style={styles.ctaRow}>
                <Pressable style={styles.ctaBtn} onPress={() => { setMedicationOpen(false); navigation.navigate('MedicationForm'); }}><Text style={styles.ctaText}>+ Add Medication</Text></Pressable>
                <Pressable style={styles.ctaBtn} onPress={() => { setMedicationOpen(false); navigation.navigate('MedicationCalendar'); }}><Text style={styles.ctaText}>View Calendar</Text></Pressable>
                <Pressable style={styles.ctaBtn} onPress={() => { setMedicationOpen(false); navigation.navigate('MedicationNotifications'); }}><Text style={styles.ctaText}>Manage Notifications</Text></Pressable>
                <Pressable style={styles.ctaBtn} onPress={() => setMedicationOpen(false)}><Text style={styles.ctaText}>Close</Text></Pressable>
              </View>

              <Text style={styles.section}>Existing Medications</Text>
              {medications.length === 0 ? (
                <Text style={styles.empty}>No medications yet.</Text>
              ) : (
                medications.map((medication) => (
                  <View key={medication.id} style={styles.medCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medName}>{medication.name}</Text>
                      <Text style={styles.medTime}>{medication.dosage} • {medication.status}</Text>
                    </View>
                    <View style={styles.manageRow}>
                      <Pressable onPress={() => { setMedicationOpen(false); navigation.navigate('MedicationForm', { medicationId: medication.id }); }}><Text style={styles.link}>Edit</Text></Pressable>
                      <Pressable onPress={() => pauseMedication(medication.id)}><Text style={styles.link}>Pause</Text></Pressable>
                      <Pressable onPress={() => deleteMedication(medication.id)}><Text style={[styles.link, { color: colors.danger }]}>Delete</Text></Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end'
  },
  sheetBackdrop: {
    flex: 1
  },
  sheetWrap: {
    maxHeight: '82%',
    backgroundColor: colors.cardRaised,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: 14
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.textMuted,
    marginBottom: 10
  },
  sheetTitle: {
    ...typography.section,
    marginBottom: 10
  },
  sheetContent: {
    gap: 10,
    paddingBottom: 20
  },
  section: {
    ...typography.bodyStrong
  },
  empty: {
    ...typography.caption,
    color: colors.textMuted
  },
  medRow: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  medName: {
    ...typography.bodyStrong
  },
  medTime: {
    ...typography.caption
  },
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusText: {
    ...typography.caption,
    color: colors.white,
    textTransform: 'capitalize'
  },
  quickRow: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    padding: 10,
    backgroundColor: colors.card
  },
  quickLabel: {
    ...typography.bodyStrong
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8
  },
  quickBtn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.strokeStrong,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  quickBtnText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  ctaRow: {
    gap: 8
  },
  ctaBtn: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.blue
  },
  ctaText: {
    ...typography.bodyStrong,
    color: colors.textPrimary
  },
  medCard: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  manageRow: {
    flexDirection: 'row',
    gap: 10
  },
  link: {
    ...typography.caption,
    color: colors.blue
  }
});
