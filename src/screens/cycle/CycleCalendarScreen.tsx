import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

const weekday = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const CycleCalendarScreen = () => {
  const navigation = useNavigation();
  const { getCycleDaySnapshot } = useAppContext();
  const [viewMonth, setViewMonth] = useState(monthStart(new Date()));
  const [selected, setSelected] = useState(new Date());

  const cells = useMemo(() => {
    const start = monthStart(viewMonth);
    const offset = start.getDay();
    const gridStart = addDays(start, -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewMonth]);

  const selectedSnapshot = getCycleDaySnapshot(selected.toISOString());

  return (
    <Screen scroll>
      <AppBackButton onPress={() => navigation.goBack()} />
      <View style={styles.headerRow}>
        <Pressable style={styles.navBtn} onPress={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}><Text style={styles.navText}>Prev</Text></Pressable>
        <Text style={styles.monthLabel}>{viewMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}</Text>
        <Pressable style={styles.navBtn} onPress={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}><Text style={styles.navText}>Next</Text></Pressable>
      </View>

      <View style={styles.weekRow}>{weekday.map((d, idx) => <Text key={`${d}-${idx}`} style={styles.weekText}>{d}</Text>)}</View>
      <View style={styles.grid}>
        {cells.map((date) => {
          const inMonth = date.getMonth() === viewMonth.getMonth();
          const snapshot = getCycleDaySnapshot(date.toISOString());
          const isSelected = date.toDateString() === selected.toDateString();
          return (
            <Pressable
              key={date.toISOString()}
              style={[
                styles.cell,
                snapshot.isPeriodDay && styles.periodCell,
                snapshot.isPredictedFertile && styles.fertileCell,
                snapshot.isPredictedOvulation && styles.ovulationCell,
                isSelected && styles.selectedCell,
                !inMonth && styles.dimCell
              ]}
              onPress={() => setSelected(date)}
            >
              <Text style={styles.cellText}>{date.getDate()}</Text>
              {snapshot.log?.symptoms.length ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.detailTitle}>{selected.toDateString()}</Text>
        <Text style={styles.detailText}>Phase: {selectedSnapshot.phase.replace('_', ' ')}</Text>
        <Text style={styles.detailText}>Flow: {selectedSnapshot.log?.flow ?? 'None logged'}</Text>
        <Text style={styles.detailText}>Mood: {selectedSnapshot.log?.mood ?? 'Not logged'}</Text>
        <Text style={styles.detailText}>Symptoms: {selectedSnapshot.log?.symptoms.length ? selectedSnapshot.log.symptoms.join(', ') : 'None logged'}</Text>
        {selectedSnapshot.log?.notes ? <Text style={styles.detailText}>Notes: {selectedSnapshot.log.notes}</Text> : null}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm
  },
  navBtn: {
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 12,
    justifyContent: 'center'
  },
  navText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  monthLabel: {
    ...typography.bodyStrong,
    fontSize: 16
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  weekText: {
    ...typography.caption,
    color: colors.textSecondary,
    width: 40,
    textAlign: 'center'
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md
  },
  cell: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card
  },
  periodCell: {
    backgroundColor: 'rgba(208,64,83,0.28)',
    borderColor: '#EA7E8C'
  },
  fertileCell: {
    backgroundColor: 'rgba(111,188,236,0.24)',
    borderColor: '#7BB8DB'
  },
  ovulationCell: {
    backgroundColor: 'rgba(156,134,255,0.30)',
    borderColor: '#9C86FF'
  },
  selectedCell: {
    borderColor: colors.blue,
    borderWidth: 2
  },
  dimCell: {
    opacity: 0.45
  },
  cellText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  dot: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.blue
  },
  detailCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
    padding: spacing.md,
    gap: 6
  },
  detailTitle: {
    ...typography.bodyStrong,
    fontSize: 15,
    marginBottom: 4
  },
  detailText: {
    ...typography.caption,
    color: colors.textSecondary
  }
});
