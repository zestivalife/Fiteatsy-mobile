import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

const statusColor: Record<string, string> = {
  taken: '#44D07F',
  missed: '#D04053',
  snoozed: '#F5B544',
  skipped: '#8F8F8F',
  upcoming: '#5AB7FF'
};

const toDateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const MedicationCalendarScreen = () => {
  const { getMedicationTimelineForDate } = useAppContext();
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = first.getDay();
    const start = new Date(first.getFullYear(), first.getMonth(), first.getDate() - startOffset);
    return Array.from({ length: 42 }).map((_, idx) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + idx));
  }, [cursor]);

  const selectedTimeline = useMemo(() => getMedicationTimelineForDate(selectedDay.toISOString()), [getMedicationTimelineForDate, selectedDay]);

  const statusForDay = (day: Date) => {
    const timeline = getMedicationTimelineForDate(day.toISOString());
    if (timeline.some((item) => item.status === 'missed')) return 'missed';
    if (timeline.some((item) => item.status === 'snoozed')) return 'snoozed';
    if (timeline.some((item) => item.status === 'skipped')) return 'skipped';
    if (timeline.some((item) => item.status === 'taken')) return 'taken';
    return 'upcoming';
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><Text style={styles.nav}>{'<'}</Text></Pressable>
        <Text style={styles.title}>{cursor.toLocaleString('default', { month: 'long' })} {cursor.getFullYear()}</Text>
        <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><Text style={styles.nav}>{'>'}</Text></Pressable>
      </View>

      <View style={styles.weekRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label) => <Text key={label} style={styles.weekLabel}>{label}</Text>)}
      </View>

      <View style={styles.grid}>
        {days.map((day) => {
          const selected = toDateOnly(day).getTime() === toDateOnly(selectedDay).getTime();
          const status = statusForDay(day);
          return (
            <Pressable key={day.toISOString()} style={[styles.dayCell, selected && styles.dayCellSelected]} onPress={() => setSelectedDay(day)}>
              <Text style={styles.dayText}>{day.getDate()}</Text>
              <View style={[styles.dot, { backgroundColor: statusColor[status] ?? colors.textMuted }]} />
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.logs}>
        <Text style={styles.logsTitle}>Medication Logs</Text>
        {selectedTimeline.length === 0 ? (
          <Text style={styles.empty}>No logs for this date.</Text>
        ) : (
          selectedTimeline.map((entry) => (
            <View key={`${entry.medication.id}-${entry.scheduledForISO}`} style={styles.logCard}>
              <View>
                <Text style={styles.logName}>{entry.medication.name}</Text>
                <Text style={styles.logTime}>{new Date(entry.scheduledForISO).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: statusColor[entry.status] ?? colors.info }]}>
                <Text style={styles.badgeText}>{entry.status}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  nav: {
    ...typography.section,
    color: colors.textPrimary
  },
  title: {
    ...typography.section
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  weekLabel: {
    ...typography.caption,
    width: '14%',
    textAlign: 'center'
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md
  },
  dayCell: {
    width: '13%',
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  dayCellSelected: {
    borderColor: colors.blue
  },
  dayText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  logs: {
    gap: 8,
    paddingBottom: spacing.xxl
  },
  logsTitle: {
    ...typography.bodyStrong
  },
  empty: {
    ...typography.body,
    color: colors.textMuted
  },
  logCard: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  logName: {
    ...typography.bodyStrong
  },
  logTime: {
    ...typography.caption
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  badgeText: {
    ...typography.caption,
    color: colors.white
  }
});
