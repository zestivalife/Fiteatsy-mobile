import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppBackButton } from '../../components/AppBackButton';
import { PageHeader } from '../../components/PageHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Screen } from '../../components/Screen';
import { radius, spacing } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import type { Medication, MedicationLogStatus } from '../../types';
import { useAppContext } from '../../state/AppContext';
import { resolveMedicationSlotForOccurrence } from '../../services/medicationUtils';
import { resolveClientFirstName } from '../../utils/clientIdentity';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MedicationTimelineEntry = {
  medication: Medication;
  scheduledForISO: string;
  status: MedicationLogStatus;
};
type Daypart = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';
type MedicationTab = 'today' | 'medications' | 'history';
type SheetState =
  | { type: 'snooze'; entry: MedicationTimelineEntry; minutes: 5 | 10 | 15 | 30 }
  | { type: 'skip'; entry: MedicationTimelineEntry; reason: string | null }
  | null;

const medicationTheme = {
  background: '#090B0D',
  text: '#F4F5F6',
  secondary: '#A7ABB1',
  muted: '#747980',
  card: '#111315',
  surface: '#151719',
  surfaceRaised: '#1B1E21',
  border: '#282C30',
  borderStrong: '#3A4046',
  cta: '#171A1D',
  ctaBorder: '#42484F',
  active: '#67E638',
  taken: '#44D07F',
  due: '#F5B544',
  snoozed: '#B879FF',
  missed: '#FF6B73',
  skipped: '#8F8F8F',
  upcoming: '#5E6A75'
};

const typography = {
  hero: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 16,
    lineHeight: 22
  },
  section: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 16,
    lineHeight: 22
  },
  bodyStrong: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 14,
    lineHeight: 20
  },
  body: {
    fontFamily: 'Exo_400Regular',
    fontSize: 14,
    lineHeight: 20
  },
  caption: {
    fontFamily: 'Exo_500Medium',
    fontSize: 12,
    lineHeight: 17
  }
};

const statusColor: Record<MedicationLogStatus, string> = {
  taken: medicationTheme.taken,
  missed: medicationTheme.missed,
  snoozed: medicationTheme.snoozed,
  skipped: medicationTheme.skipped,
  upcoming: medicationTheme.upcoming
};

const statusLabel: Record<MedicationLogStatus, string> = {
  taken: 'Taken',
  missed: 'Missed',
  snoozed: 'Snoozed',
  skipped: 'Skipped',
  upcoming: 'Upcoming'
};

const visibleStatus = (entry: MedicationTimelineEntry, now: Date) => {
  if (entry.status !== 'upcoming') return { label: statusLabel[entry.status], color: statusColor[entry.status] };
  const minutesUntil = (new Date(entry.scheduledForISO).getTime() - now.getTime()) / 60_000;
  return minutesUntil <= 30 && minutesUntil >= -120
    ? { label: 'Due now', color: medicationTheme.due }
    : { label: 'Pending', color: medicationTheme.upcoming };
};

const mealRelationLabel: Record<string, string> = {
  before_meal: 'Before food',
  after_meal: 'After food',
  with_meal: 'With food',
  empty_stomach: 'Empty stomach'
};

const formatDate = (date: Date) => date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const formatShortDate = (date: Date) => date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const formatTime = (value: string) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const toDateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const getDayOffset = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};

const normalize = (value: string) => value.replace(/_/g, ' ').toLowerCase();
const daypartFor = (value: string): Daypart => {
  const hour = new Date(value).getHours();
  if (hour < 12) return 'MORNING';
  if (hour < 17) return 'AFTERNOON';
  if (hour < 21) return 'EVENING';
  return 'NIGHT';
};

export const MedicationCalendarScreen = () => {
  const navigation = useNavigation<Nav>();
  const { authSession, medications, medicationLogs, getMedicationTimelineForDate, markMedicationAction } = useAppContext();
  const [activeTab, setActiveTab] = useState<MedicationTab>('today');
  const [medicationFilter, setMedicationFilter] = useState<'active' | 'completed'>('active');
  const [historyRange, setHistoryRange] = useState<'7' | '30'>('7');
  const [savingLogId, setSavingLogId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);

  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setToday(new Date());
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    const timer = setInterval(refresh, 60_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);
  const todayTimeline = useMemo(
    () => getMedicationTimelineForDate(today.toISOString()).sort((a, b) => new Date(a.scheduledForISO).getTime() - new Date(b.scheduledForISO).getTime()),
    [getMedicationTimelineForDate, today]
  );

  const counts = useMemo(() => {
    const total = todayTimeline.length;
    const taken = todayTimeline.filter((item) => item.status === 'taken').length;
    const pending = todayTimeline.filter((item) => item.status === 'upcoming' || item.status === 'snoozed').length;
    const missed = todayTimeline.filter((item) => item.status === 'missed' || item.status === 'skipped').length;
    return { total, taken, pending, missed };
  }, [todayTimeline]);

  const nextDose = useMemo(
    () => todayTimeline.find((entry) => entry.status === 'upcoming' || entry.status === 'snoozed') ?? todayTimeline.find((entry) => entry.status === 'missed') ?? null,
    [todayTimeline]
  );

  const groupedTimeline = useMemo(() => {
    const groups = new Map<Daypart, MedicationTimelineEntry[]>();
    todayTimeline.forEach((entry) => groups.set(daypartFor(entry.scheduledForISO), [...(groups.get(daypartFor(entry.scheduledForISO)) ?? []), entry]));
    return (['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'] as Daypart[]).flatMap((label) => {
      const entries = groups.get(label) ?? [];
      return entries.length ? [{ label, entries }] : [];
    });
  }, [todayTimeline]);

  const actionTimeFor = (entry: MedicationTimelineEntry) => medicationLogs.find(
    (log) => log.medicationId === entry.medication.id && log.scheduledForISO === entry.scheduledForISO
  )?.actionedAtISO ?? null;

  const visibleMedications = useMemo(
    () => medications.filter((item) => (medicationFilter === 'active' ? item.status === 'active' : item.status !== 'active')),
    [medicationFilter, medications]
  );

  const historyDays = useMemo(() => {
    const length = historyRange === '7' ? 7 : 30;
    return Array.from({ length }).map((_, index) => {
      const date = getDayOffset(-index);
      const timeline = getMedicationTimelineForDate(date.toISOString());
      const taken = timeline.filter((item) => item.status === 'taken').length;
      const skipped = timeline.filter((item) => item.status === 'skipped' || item.status === 'snoozed').length;
      const missed = timeline.filter((item) => item.status === 'missed').length;
      return { date, timeline, taken, skipped, missed };
    });
  }, [getMedicationTimelineForDate, historyRange]);

  const historyStats = useMemo(() => {
    const scheduled = historyDays.reduce((sum, day) => sum + day.timeline.length, 0);
    const taken = historyDays.reduce((sum, day) => sum + day.taken, 0);
    const skipped = historyDays.reduce((sum, day) => sum + day.skipped, 0);
    const missed = historyDays.reduce((sum, day) => sum + day.missed, 0);
    const adherence = scheduled > 0 ? Math.round((taken / scheduled) * 100) : 0;
    return { scheduled, taken, skipped, missed, adherence };
  }, [historyDays]);

  const recordMedicationStatus = async (
    entry: MedicationTimelineEntry,
    status: Extract<MedicationLogStatus, 'taken' | 'snoozed' | 'skipped'>,
    snoozeMinutes?: 5 | 10 | 15 | 30
  ) => {
    const logKey = `${entry.medication.id}-${entry.scheduledForISO}-${status}`;
    setSavingLogId(logKey);
    try {
      await markMedicationAction({ medicationId: entry.medication.id, scheduledForISO: entry.scheduledForISO, status, snoozeMinutes });
      setSheet(null);
    } finally {
      setSavingLogId(null);
    }
  };

  const firstName = resolveClientFirstName(authSession?.user.name);

  const medicationTimeLabel = (medication: Medication) =>
    medication.schedule.timeSlots
      .map((slot) => {
        const [hours, minutes] = slot.time24h.split(':').map((part) => Number(part));
        const date = new Date();
        date.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
        return formatTime(date.toISOString());
      })
      .join(', ');

  const renderTabs = () => (
    <SegmentedTabs
      tabs={[{ key: 'today', label: 'Today' }, { key: 'medications', label: 'My Medications' }, { key: 'history', label: 'History' }]}
      value={activeTab}
      onChange={setActiveTab}
    />
  );

  const renderProgressSegments = () => {
    return (
      <View style={styles.progressSegments}>
        {todayTimeline.map((entry) => (
          <View
            key={`${entry.medication.id}-${entry.scheduledForISO}`}
            style={[
              styles.progressSegment,
              { backgroundColor: statusColor[entry.status] }
            ]}
          />
        ))}
      </View>
    );
  };

  const renderToday = () => (
    <>
      <View style={styles.progressCard}>
        <View>
          <Text style={styles.mutedLabel}>Today's Progress</Text>
          <Text style={styles.progressText}>
            <Text style={styles.takenNumber}>{counts.taken}</Text> of {counts.total || 0} doses taken
          </Text>
        </View>
        <View style={styles.nextDoseSummary}>
          <Text style={styles.mutedLabel}>Next dose</Text>
          <Text style={styles.nextDoseTime}>{nextDose ? formatTime(nextDose.scheduledForISO) : '--'}</Text>
        </View>
        {renderProgressSegments()}
      </View>

      {nextDose ? (
        <View style={styles.nextDoseCard}>
          <View style={styles.nextDoseHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>NEXT DOSE</Text>
              <Text style={styles.nextMedicine}>{nextDose.medication.name}</Text>
              <Text style={styles.nextMeta}>{nextDose.medication.dosage}</Text>
            </View>
            <View style={styles.pillIconBox}><Ionicons name="medical-outline" size={32} color={medicationTheme.due} /></View>
          </View>
          <View style={styles.nextMetaRow}>
            <Text style={styles.dueTime}>◷ {formatTime(nextDose.scheduledForISO)}</Text>
            <Text style={styles.nextMeta}>· {mealRelationLabel[resolveMedicationSlotForOccurrence(nextDose.medication, nextDose.scheduledForISO)?.mealRelation] ?? 'Scheduled dose'}</Text>
            <Text style={styles.nextMeta}>🔔 Reminder ON</Text>
          </View>
          <PrimaryButton
            title="Take now"
            onPress={() => recordMedicationStatus(nextDose, 'taken')}
            loading={savingLogId?.endsWith('-taken') === true}
            style={styles.takeNowButton}
          />
          <View style={styles.secondaryActions}>
            <Pressable style={styles.secondaryActionButton} onPress={() => setSheet({ type: 'snooze', entry: nextDose, minutes: 15 })}>
              <Text style={styles.secondaryActionText}>Snooze</Text>
            </Pressable>
            <Pressable style={styles.secondaryActionButton} onPress={() => setSheet({ type: 'skip', entry: nextDose, reason: null })}>
              <Text style={styles.secondaryActionText}>Skip</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyTitle}>No pending medication today.</Text>
          <Text style={styles.emptyText}>Add a medication plan or review your schedule to keep reminders organised.</Text>
          <Pressable style={styles.neutralCta} onPress={() => navigation.navigate('MedicationForm')}>
            <Text style={styles.neutralCtaText}>Add Medication</Text>
          </Pressable>
        </View>
      )}

      {todayTimeline.length > 0 ? <Text style={styles.scheduleTitle}>TODAY'S SCHEDULE</Text> : null}
      {groupedTimeline.map((group) => (
        <View key={group.label} style={styles.scheduleGroup}>
          <Text style={styles.daypartLabel}>{group.label}</Text>
          <View style={styles.scheduleStack}>
          {group.entries.map((entry) => {
            const actionedAt = actionTimeFor(entry);
            const displayStatus = visibleStatus(entry, today);
            return (
            <View key={`${entry.medication.id}-${entry.scheduledForISO}`} style={styles.scheduleItem}>
              <View style={styles.scheduleTimeBlock}>
                <Text style={styles.scheduleTime}>{formatTime(entry.scheduledForISO)}</Text>
                {actionedAt ? <Text style={styles.actionTime}>{formatTime(actionedAt)}</Text> : null}
              </View>
              <View style={[styles.statusDot, { backgroundColor: displayStatus.color }]} />
              <View style={styles.scheduleInfo}>
                <Text style={styles.scheduleName}>{entry.medication.name}</Text>
                <Text style={styles.scheduleMeta}>{entry.medication.dosage} · {mealRelationLabel[resolveMedicationSlotForOccurrence(entry.medication, entry.scheduledForISO)?.mealRelation] ?? 'Scheduled'}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${displayStatus.color}24` }]}>
                <Text style={[styles.statusBadgeText, { color: displayStatus.color }]}>{displayStatus.label}</Text>
              </View>
            </View>
          )})}
          </View>
        </View>
      ))}
    </>
  );

  const renderMedications = () => (
    <>
      <View style={styles.subTabRow}>
        {(['active', 'completed'] as const).map((key) => (
          <Pressable key={key} style={[styles.subTab, medicationFilter === key && styles.subTabActive]} onPress={() => setMedicationFilter(key)}>
            <Text style={[styles.subTabText, medicationFilter === key && styles.subTabTextActive]}>{key === 'active' ? 'Active' : 'Completed'}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.addButton} onPress={() => navigation.navigate('MedicationForm')}>
          <Text style={styles.addButtonText}>＋ Add</Text>
        </Pressable>
      </View>
      {visibleMedications.length === 0 ? (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyTitle}>No {medicationFilter} medications.</Text>
          <Text style={styles.emptyText}>Medication plans will appear here after you add them.</Text>
        </View>
      ) : (
        visibleMedications.map((medication) => (
          <Pressable key={medication.id} style={styles.medicationCard} onPress={() => navigation.navigate('MedicationForm', { medicationId: medication.id })}>
            <View style={styles.medicationIconBox}><Text style={styles.medicationIcon}>⌁</Text></View>
            <View style={styles.medicationBody}>
              <Text style={styles.medicationName}>{medication.name}</Text>
              <Text style={styles.medicationMeta}>{medication.dosage} · {normalize(medication.type)}</Text>
              <Text style={styles.medicationMeta}>{medication.schedule.timeSlots.length} dose{medication.schedule.timeSlots.length === 1 ? '' : 's'} · {normalize(medication.schedule.frequency.preset)}</Text>
              <Text style={styles.medicationMeta}>◷ {medicationTimeLabel(medication)} <Text style={styles.reminderBadge}>Reminder ON</Text></Text>
              <Text style={styles.medicationMeta}>{formatShortDate(new Date(medication.schedule.duration.startDateISO))} – {medication.schedule.duration.endDateISO ? formatShortDate(new Date(medication.schedule.duration.endDateISO)) : 'Ongoing'}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))
      )}
    </>
  );

  const renderHistory = () => (
    <>
      <SegmentedTabs tabs={[{ key: '7', label: '7 Days' }, { key: '30', label: '30 Days' }]} value={historyRange} onChange={setHistoryRange} />
      <View style={styles.adherenceCard}>
        <Text style={styles.scheduleTitle}>{historyRange}-DAY ADHERENCE</Text>
        <View style={styles.adherenceRow}>
          <Text style={styles.adherenceNumber}>{historyStats.adherence}%</Text>
          <Text style={styles.adherenceMeta}>{historyStats.taken} of {historyStats.scheduled} scheduled doses taken</Text>
        </View>
        <View style={styles.historyBars}>
          {historyDays.slice().reverse().map((day) => {
            const dayStatus: MedicationLogStatus =
              day.missed > 0 ? 'missed' : day.skipped > 0 ? 'snoozed' : day.taken > 0 ? 'taken' : 'upcoming';
            return (
              <View key={day.date.toISOString()} style={styles.historyBarWrap}>
                <View style={[styles.historyBar, { backgroundColor: statusColor[dayStatus], opacity: day.timeline.length ? 1 : 0.45 }]} />
                <Text style={styles.historyDay}>{day.date.toLocaleDateString('en-IN', { weekday: 'narrow' })}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <Text style={[styles.legend, { color: medicationTheme.taken }]}>● Taken: {historyStats.taken}</Text>
          <Text style={[styles.legend, { color: medicationTheme.skipped }]}>● Skipped: {historyStats.skipped}</Text>
          <Text style={[styles.legend, { color: medicationTheme.missed }]}>● Missed: {historyStats.missed}</Text>
        </View>
      </View>
      <Text style={styles.scheduleTitle}>DOSE LOG</Text>
      {historyDays.slice(0, 5).map((day) => (
        <View key={day.date.toISOString()} style={styles.historyDaySection}>
          <Text style={styles.historyDate}>{toDateOnly(day.date).getTime() === toDateOnly(today).getTime() ? 'Today' : toDateOnly(day.date).getTime() === toDateOnly(getDayOffset(-1)).getTime() ? 'Yesterday' : formatShortDate(day.date)}</Text>
          {day.timeline.length === 0 ? (
            <Text style={styles.emptyText}>No scheduled doses.</Text>
          ) : (
            day.timeline.map((entry) => (
              <View key={`${day.date.toISOString()}-${entry.medication.id}-${entry.scheduledForISO}`} style={styles.historyLogRow}>
                <Text style={styles.historyLogTime}>{formatTime(entry.scheduledForISO)}</Text>
                <View style={styles.historyLogBody}>
                  <Text style={styles.historyLogName}>{entry.medication.name}</Text>
                  <Text style={styles.medicationMeta}>{entry.medication.dosage}</Text>
                </View>
                <Text style={[styles.historyStatus, { color: statusColor[entry.status] }]}>{statusLabel[entry.status]}</Text>
              </View>
            ))
          )}
        </View>
      ))}
    </>
  );

  const renderSheet = () => (
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
      <Pressable style={styles.sheetOverlay} onPress={() => setSheet(null)} />
      {sheet?.type === 'snooze' ? (
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Snooze reminder</Text>
          <Text style={styles.sheetSubtitle}>{sheet.entry.medication.name}</Text>
          {([10, 15, 30] as const).map((minutes) => (
            <Pressable key={minutes} style={[styles.sheetOption, sheet.minutes === minutes && styles.sheetOptionActive]} onPress={() => setSheet({ ...sheet, minutes: minutes as 5 | 10 | 15 | 30 })}>
              <Text style={styles.sheetOptionText}>{minutes} minutes</Text>
              {sheet.minutes === minutes ? <Text style={styles.sheetCheck}>✓</Text> : null}
            </Pressable>
          ))}
          <Pressable style={styles.sheetPrimary} onPress={() => recordMedicationStatus(sheet.entry, 'snoozed', sheet.minutes)}>
            <Text style={styles.sheetPrimaryText}>Snooze {sheet.minutes} min</Text>
          </Pressable>
          <Pressable onPress={() => setSheet(null)}><Text style={styles.sheetCancel}>Cancel</Text></Pressable>
        </View>
      ) : sheet?.type === 'skip' ? (
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Skip this dose?</Text>
          <Text style={styles.sheetSubtitle}>{sheet.entry.medication.name} · {formatTime(sheet.entry.scheduledForISO)}</Text>
          <Text style={styles.sheetEyebrow}>REASON (OPTIONAL)</Text>
          <View style={styles.reasonWrap}>
            {['Forgot / unavailable', 'Feeling unwell', 'Doctor advised', 'Side effects', 'Other', 'Prefer not to say'].map((reason) => (
              <Pressable key={reason} style={[styles.reasonChip, sheet.reason === reason && styles.reasonChipActive]} onPress={() => setSheet({ ...sheet, reason })}>
                <Text style={styles.reasonText}>{reason}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.skipPrimary} onPress={() => recordMedicationStatus(sheet.entry, 'skipped')}>
            <Text style={styles.skipPrimaryText}>Skip dose</Text>
          </Pressable>
          <Pressable onPress={() => setSheet(null)}><Text style={styles.sheetCancel}>Cancel</Text></Pressable>
        </View>
      ) : null}
    </Modal>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader
          title="Medication Tracker"
          onBack={() => navigation.goBack()}
          action={<Pressable style={styles.notificationButton} onPress={() => navigation.navigate('MedicationNotifications')} accessibilityLabel="Medication notifications"><Ionicons name="notifications-outline" size={22} color={medicationTheme.secondary} /></Pressable>}
        />
        <Text style={styles.greeting}>Good {new Date().getHours() < 17 ? 'morning' : 'evening'}, {firstName}</Text>
        <Text style={styles.date}>{formatDate(today)}</Text>
        {renderTabs()}
        {activeTab === 'today' ? renderToday() : activeTab === 'medications' ? renderMedications() : renderHistory()}
      </ScrollView>
      {renderSheet()}
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl * 2,
    gap: 14
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: medicationTheme.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  notificationText: {
    color: medicationTheme.secondary,
    fontSize: 20
  },
  greeting: {
    ...typography.body,
    color: medicationTheme.muted
  },
  title: {
    ...typography.hero,
    color: medicationTheme.text,
    marginTop: 2
  },
  date: {
    ...typography.body,
    color: medicationTheme.muted,
    marginTop: -8
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4
  },
  topTab: {
    flexShrink: 1,
    borderRadius: radius.pill,
    backgroundColor: medicationTheme.surface,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  topTabActive: {
    backgroundColor: medicationTheme.active,
    borderColor: medicationTheme.active
  },
  topTabText: {
    ...typography.bodyStrong,
    color: medicationTheme.muted
  },
  topTabTextActive: {
    color: '#071006'
  },
  progressCard: {
    borderWidth: 1,
    borderColor: medicationTheme.border,
    borderRadius: 24,
    backgroundColor: medicationTheme.card,
    padding: 18,
    gap: 14
  },
  mutedLabel: {
    ...typography.body,
    color: medicationTheme.muted
  },
  progressText: {
    ...typography.bodyStrong,
    color: medicationTheme.secondary
  },
  takenNumber: {
    color: medicationTheme.taken
  },
  nextDoseSummary: {
    position: 'absolute',
    right: 18,
    top: 18,
    alignItems: 'flex-end'
  },
  nextDoseTime: {
    ...typography.bodyStrong,
    color: medicationTheme.due
  },
  progressSegments: {
    flexDirection: 'row',
    gap: 6
  },
  progressSegment: {
    flex: 1,
    height: 8,
    borderRadius: 999
  },
  nextDoseCard: {
    borderWidth: 1,
    borderColor: 'rgba(245, 181, 68, 0.22)',
    borderRadius: 24,
    backgroundColor: medicationTheme.card,
    padding: 18,
    gap: 16
  },
  nextDoseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  sectionEyebrow: {
    ...typography.caption,
    color: medicationTheme.due,
    letterSpacing: 3
  },
  nextMedicine: {
    ...typography.section,
    color: medicationTheme.text,
    marginTop: 10
  },
  nextMeta: {
    ...typography.body,
    color: medicationTheme.muted
  },
  pillIconBox: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(245, 181, 68, 0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pillIcon: {
    color: medicationTheme.due,
    fontSize: 32
  },
  nextMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8
  },
  dueTime: {
    ...typography.bodyStrong,
    color: medicationTheme.due
  },
  takeNowButton: {
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: medicationTheme.active,
    alignItems: 'center'
  },
  takeNowText: {
    ...typography.bodyStrong,
    color: '#071006'
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 12
  },
  secondaryActionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: medicationTheme.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryActionText: {
    ...typography.bodyStrong,
    color: medicationTheme.secondary
  },
  scheduleTitle: {
    ...typography.caption,
    color: medicationTheme.secondary,
    letterSpacing: 3
  },
  scheduleStack: {
    gap: 12
  },
  scheduleGroup: {
    gap: 8
  },
  daypartLabel: {
    ...typography.caption,
    color: medicationTheme.muted,
    letterSpacing: 2
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: medicationTheme.border,
    backgroundColor: medicationTheme.card,
    padding: 14,
    gap: 14
  },
  scheduleTimeBlock: {
    width: 68,
    alignItems: 'flex-end'
  },
  scheduleTime: {
    ...typography.bodyStrong,
    color: medicationTheme.text
  },
  actionTime: {
    ...typography.caption,
    color: medicationTheme.muted
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  scheduleInfo: {
    flex: 1
  },
  scheduleName: {
    ...typography.bodyStrong,
    color: medicationTheme.text
  },
  scheduleMeta: {
    ...typography.caption,
    color: medicationTheme.muted
  },
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusBadgeText: {
    ...typography.caption
  },
  subTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  subTab: {
    borderRadius: radius.pill,
    backgroundColor: medicationTheme.surface,
    paddingHorizontal: 20,
    paddingVertical: 10
  },
  subTabActive: {
    backgroundColor: medicationTheme.active,
    borderWidth: 1,
    borderColor: medicationTheme.borderStrong
  },
  subTabText: {
    ...typography.bodyStrong,
    color: medicationTheme.muted
  },
  subTabTextActive: {
    color: '#071006'
  },
  addButton: {
    marginLeft: 'auto',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: medicationTheme.ctaBorder,
    backgroundColor: medicationTheme.cta,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  addButtonText: {
    ...typography.bodyStrong,
    color: medicationTheme.text
  },
  medicationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: medicationTheme.border,
    backgroundColor: medicationTheme.card,
    padding: 18
  },
  medicationIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: medicationTheme.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center'
  },
  medicationIcon: {
    color: medicationTheme.secondary,
    fontSize: 28
  },
  medicationBody: {
    flex: 1,
    gap: 6
  },
  medicationName: {
    ...typography.bodyStrong,
    color: medicationTheme.text,
    fontSize: 22
  },
  medicationMeta: {
    ...typography.body,
    color: medicationTheme.muted
  },
  reminderBadge: {
    color: medicationTheme.secondary
  },
  chevron: {
    color: medicationTheme.muted,
    fontSize: 36
  },
  emptyPanel: {
    borderWidth: 1,
    borderColor: medicationTheme.border,
    borderRadius: 24,
    backgroundColor: medicationTheme.card,
    padding: 18,
    gap: 10
  },
  emptyTitle: {
    ...typography.bodyStrong,
    color: medicationTheme.text
  },
  emptyText: {
    ...typography.body,
    color: medicationTheme.muted
  },
  neutralCta: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: medicationTheme.ctaBorder,
    backgroundColor: medicationTheme.cta,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  neutralCtaText: {
    ...typography.bodyStrong,
    color: medicationTheme.text
  },
  adherenceCard: {
    borderWidth: 1,
    borderColor: medicationTheme.border,
    borderRadius: 24,
    backgroundColor: medicationTheme.card,
    padding: 18,
    gap: 18
  },
  adherenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  adherenceNumber: {
    ...typography.hero,
    color: medicationTheme.text
  },
  adherenceMeta: {
    ...typography.body,
    color: medicationTheme.muted,
    flex: 1
  },
  historyBars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end'
  },
  historyBarWrap: {
    alignItems: 'center',
    gap: 8
  },
  historyBar: {
    width: 34,
    height: 64,
    borderRadius: 12
  },
  historyDay: {
    ...typography.caption,
    color: medicationTheme.muted
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16
  },
  legend: {
    ...typography.caption
  },
  historyDaySection: {
    gap: 8
  },
  historyDate: {
    ...typography.bodyStrong,
    color: medicationTheme.text
  },
  historyLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: medicationTheme.card,
    padding: 14,
    gap: 14
  },
  historyLogTime: {
    ...typography.body,
    color: medicationTheme.muted,
    width: 74
  },
  historyLogBody: {
    flex: 1
  },
  historyLogName: {
    ...typography.bodyStrong,
    color: medicationTheme.text
  },
  historyStatus: {
    ...typography.bodyStrong
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.62)'
  },
  sheet: {
    marginTop: 'auto',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: medicationTheme.card,
    borderTopWidth: 1,
    borderColor: medicationTheme.border,
    padding: 20,
    gap: 14
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: medicationTheme.borderStrong
  },
  sheetTitle: {
    ...typography.section,
    color: medicationTheme.text
  },
  sheetSubtitle: {
    ...typography.body,
    color: medicationTheme.muted
  },
  sheetEyebrow: {
    ...typography.caption,
    color: medicationTheme.secondary,
    letterSpacing: 2
  },
  sheetOption: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: medicationTheme.border,
    backgroundColor: medicationTheme.surface,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sheetOptionActive: {
    borderColor: medicationTheme.borderStrong,
    backgroundColor: medicationTheme.surfaceRaised
  },
  sheetOptionText: {
    ...typography.body,
    color: medicationTheme.text
  },
  sheetCheck: {
    ...typography.bodyStrong,
    color: medicationTheme.snoozed
  },
  sheetPrimary: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(184, 121, 255, 0.45)',
    backgroundColor: 'rgba(184, 121, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheetPrimaryText: {
    ...typography.bodyStrong,
    color: medicationTheme.text
  },
  sheetCancel: {
    ...typography.bodyStrong,
    color: medicationTheme.muted,
    textAlign: 'center',
    paddingVertical: 12
  },
  reasonWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  reasonChip: {
    borderRadius: radius.pill,
    backgroundColor: medicationTheme.surface,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  reasonChipActive: {
    backgroundColor: medicationTheme.surfaceRaised,
    borderWidth: 1,
    borderColor: medicationTheme.borderStrong
  },
  reasonText: {
    ...typography.body,
    color: medicationTheme.secondary
  },
  skipPrimary: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 115, 0.45)',
    backgroundColor: 'rgba(255, 107, 115, 0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  skipPrimaryText: {
    ...typography.bodyStrong,
    color: medicationTheme.missed
  }
});
