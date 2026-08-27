import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { AppBackButton } from '../../components/AppBackButton';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import {
  getCurrentReportComparison,
  ReportComparisonItem,
  ReportComparisonProjection
} from '../../services/reportUploadService';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Filter = 'all' | 'improved' | 'needs_attention' | 'stable';

const statusMeta = {
  improved: { label: 'Improved', color: '#4ADF88' },
  stable: { label: 'Stable', color: '#A3A3A3' },
  needs_attention: { label: 'Needs attention', color: '#FF6B70' },
  changed: { label: 'Changed', color: '#FFB000' },
  incomparable: { label: 'Not comparable', color: '#777777' }
} as const;

const valueLabel = (item: ReportComparisonItem['latest']) => item ? `${item.value} ${item.unit}` : 'Not available';

const ComparisonRow = ({ item }: { item: ReportComparisonItem }) => {
  const meta = statusMeta[item.comparison.classification];
  return (
    <View style={styles.row} accessible accessibilityLabel={`${item.displayName}, ${meta.label}`}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowTitle}>{item.displayName}</Text>
        <Text style={[styles.status, { color: meta.color }]}>{meta.label}</Text>
      </View>
      <View style={styles.values}>
        <View style={styles.valueColumn}>
          <Text style={styles.valueLabel}>Previous</Text>
          <Text style={styles.value}>{valueLabel(item.previous)}</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
        <View style={styles.valueColumn}>
          <Text style={styles.valueLabel}>Latest</Text>
          <Text style={styles.value}>{valueLabel(item.latest)}</Text>
        </View>
      </View>
      <Text style={styles.rationale}>{item.comparison.rationale}</Text>
      {item.latest?.referenceRange ? <Text style={styles.reference}>Latest reference: {item.latest.referenceRange}</Text> : null}
    </View>
  );
};

export const ReportComparisonScreen = () => {
  const navigation = useNavigation<Nav>();
  const [comparison, setComparison] = useState<ReportComparisonProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCurrentReportComparison();
      if (!result) setError('A second analysed report is needed before comparison is available.');
      setComparison(result);
    } catch {
      setError("Comparison couldn't be loaded. Your reports remain unchanged.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => {
    if (!comparison) return [];
    if (filter === 'improved') return comparison.improved;
    if (filter === 'needs_attention') return comparison.needsAttention;
    if (filter === 'stable') return comparison.stable;
    return [...comparison.needsAttention, ...comparison.improved, ...comparison.changed, ...comparison.stable];
  }, [comparison, filter]);

  return (
    <Screen scroll contentStyle={styles.screen}>
      <View style={styles.header}>
        <AppBackButton iconOnly onPress={() => navigation.goBack()} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Report Comparison</Text>
          <Text style={styles.subtitle}>Latest vs previous analysed report</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? <ActivityIndicator color="#4ADF88" style={styles.loader} /> : null}
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {comparison ? (
        <>
          <View style={styles.reportPair}>
            <View><Text style={styles.pairLabel}>Latest report</Text><Text style={styles.pairValue}>{comparison.latestReport.reportDate}</Text></View>
            <Text style={styles.pairArrow}>→</Text>
            <View><Text style={styles.pairLabel}>Compared with</Text><Text style={styles.pairValue}>{comparison.previousReport.reportDate}</Text></View>
          </View>

          <View style={styles.summary}>
            {[
              [comparison.summary.improvedCount, 'Improved', '#4ADF88'],
              [comparison.summary.stableCount, 'Stable', '#A3A3A3'],
              [comparison.summary.needsAttentionCount, 'Needs attention', '#FF6B70']
            ].map(([count, label, color]) => (
              <View key={String(label)} style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: String(color) }]}>{count}</Text>
                <Text style={styles.summaryLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.filters}>
            {([
              ['all', 'All'], ['improved', 'Improved'], ['needs_attention', 'Needs Attention'], ['stable', 'Stable']
            ] as Array<[Filter, string]>).map(([key, label]) => (
              <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: filter === key }}
                style={[styles.filter, filter === key && styles.filterActive]} onPress={() => setFilter(key)}>
                <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.list}>{items.map((item) => <ComparisonRow key={`${item.biomarkerId}-${item.comparison.classification}`} item={item} />)}</View>
          {comparison.summary.incomparableCount > 0 ? (
            <Text style={styles.incomparable}>{comparison.summary.incomparableCount} marker{comparison.summary.incomparableCount === 1 ? '' : 's'} could not be compared safely.</Text>
          ) : null}
          <Text style={styles.disclaimer}>These insights explain changes in your reports and are not a medical diagnosis.</Text>
        </>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: { backgroundColor: '#050505', paddingHorizontal: spacing.md, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  headerCopy: { flex: 1, alignItems: 'center' }, headerSpacer: { width: 44 },
  title: { ...typography.display, color: colors.white }, subtitle: { ...typography.label, color: '#777777', letterSpacing: 1.6, textTransform: 'uppercase' },
  loader: { marginTop: 80 },
  errorCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: '#5A272A', backgroundColor: '#120B0C', padding: spacing.xl },
  errorText: { ...typography.bodyMedium, color: colors.white, textAlign: 'center' },
  retry: { minHeight: 44, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: '#301719', alignItems: 'center', justifyContent: 'center' }, retryText: { ...typography.button, color: '#FF6B70' },
  reportPair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.lg, borderWidth: 1, borderColor: '#242424', backgroundColor: '#0D0D0D', padding: spacing.lg },
  pairLabel: { ...typography.label, color: '#777777' }, pairValue: { ...typography.cardTitle, color: colors.white, marginTop: 4 }, pairArrow: { color: '#4ADF88', fontSize: 20 },
  summary: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  summaryItem: { flex: 1, minHeight: 96, borderRadius: radius.md, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  summaryCount: { ...typography.metric }, summaryLabel: { ...typography.subtext, color: '#777777', textAlign: 'center', marginTop: 4 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.xl },
  filter: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  filterActive: { borderColor: '#22643C', backgroundColor: '#0E2518' }, filterText: { ...typography.label, color: '#888888' }, filterTextActive: { color: '#4ADF88' },
  list: { borderRadius: radius.lg, borderWidth: 1, borderColor: '#242424', overflow: 'hidden' },
  row: { padding: spacing.lg, backgroundColor: '#0D0D0D', borderBottomWidth: 1, borderBottomColor: '#242424' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }, rowTitle: { ...typography.sectionTitle, color: colors.white, flex: 1 }, status: { ...typography.badge, textTransform: 'uppercase' },
  values: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md }, valueColumn: { flex: 1 }, valueLabel: { ...typography.subtext, color: '#777777' }, value: { ...typography.bodyStrong, color: colors.white, marginTop: 3 }, arrow: { color: '#777777', marginHorizontal: spacing.sm },
  rationale: { ...typography.bodySmall, color: '#BDBDBD', marginTop: spacing.md }, reference: { ...typography.subtext, color: '#666666', marginTop: spacing.xs },
  incomparable: { ...typography.bodySmall, color: '#888888', marginTop: spacing.md }, disclaimer: { ...typography.subtext, color: '#777777', textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg }
});
