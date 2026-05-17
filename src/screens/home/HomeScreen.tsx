import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle } from 'react-native-svg';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const scoreColor = (value: number, index: number) => {
  if (index === 0 || index === 6) return { bg: '#8F8F8F', text: '#101010' };
  if (value <= 15) return { bg: '#FF5757', text: '#101010' };
  if (value <= 30) return { bg: '#FDBA00', text: '#101010' };
  if (value <= 50) return { bg: '#7BB8DB', text: '#101010' };
  if (value <= 85) return { bg: '#43C273', text: '#101010' };
  return { bg: '#00C92C', text: '#101010' };
};

const RecoveryRing = ({ value }: { value: number }) => {
  const size = 79;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const p = Math.min(100, Math.max(0, value));
  const dash = c * (p / 100);

  return (
    <View style={styles.ringWrap}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#FFFFFF" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#59BE08"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          rotation={-90}
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <Text style={styles.ringCenter}>{p}%</Text>
    </View>
  );
};

const MetricCard = ({ value, title, subtitle }: { value: string; title: string; subtitle: string }) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricTitle}>{title}</Text>
    <Text style={styles.metricSubtitle}>{subtitle}</Text>
  </View>
);

export const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const { onboarding, wellness, devices, selectedDeviceId } = useAppContext();

  const connectedDevice = devices.find((d) => d.id === selectedDeviceId) ?? null;

  const trendValues = useMemo(() => {
    const today = Math.max(0, Math.min(100, wellness.wellnessScore));
    return [0, 10, 25, 30, Math.max(45, today - 6), Math.max(55, today), 0];
  }, [wellness.wellnessScore]);

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.greeting}>Hi!, {onboarding?.name ?? 'Rahul'}</Text>

        <View style={styles.topRightRow}>
          <View style={styles.actionRail}>
            <Pressable style={styles.actionBtn} onPress={() => navigation.navigate('Search')}>
              <Ionicons name="search-outline" size={18} color="#F5E1E1" />
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => navigation.navigate('Main')}>
              <MaterialCommunityIcons name="hospital-box-outline" size={18} color="#F5E1E1" />
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => navigation.navigate('Notifications')}>
              <Ionicons name="notifications-outline" size={18} color="#F5E1E1" />
              <View style={styles.notifyBadge}><Text style={styles.notifyBadgeText}>9</Text></View>
            </Pressable>
          </View>
          <Pressable style={styles.avatar} onPress={() => navigation.navigate('Profile')} />
        </View>
      </View>

      <LinearGradient colors={['#1B1B1B', '#111111']} style={styles.cardPrimary}>
        <Text style={styles.cardTitle}>Health Recovery Score</Text>
        <Text style={styles.cardSub}>Gut Health + 1More</Text>

        <View style={styles.scoreBody}>
          <View style={styles.pillGrid}>
            <View style={styles.metricPill}><Ionicons name="flash-outline" size={14} color="#59BE08" /><Text style={styles.metricPillText}>74% Nourishment</Text></View>
            <View style={styles.metricPill}><Ionicons name="sparkles-outline" size={14} color="#59BE08" /><Text style={styles.metricPillText}>82% Recovery</Text></View>
            <View style={styles.metricPill}><Ionicons name="moon-outline" size={14} color="#59BE08" /><Text style={styles.metricPillText}>7h 12m Sleep</Text></View>
            <View style={styles.metricPill}><Ionicons name="pulse-outline" size={14} color="#59BE08" /><Text style={styles.metricPillText}>{connectedDevice ? 'HRV Normal' : 'Manual Tracking'}</Text></View>
          </View>
          <RecoveryRing value={wellness.wellnessScore} />
        </View>
      </LinearGradient>

      <LinearGradient colors={['#1B1B1B', '#111111']} style={styles.card}>
        <Text style={styles.cardTitle}>Wearable is optional</Text>
        <Text style={styles.bodyCopy}>No device? Guided assessments and manual symptom tracking are already active for your care plan.</Text>
        <Pressable style={styles.syncButton} onPress={() => navigation.navigate('SyncWearable')}>
          <Ionicons name="watch-outline" size={16} color="#FFFFFF" />
          <Text style={styles.syncText}>{connectedDevice ? 'Re-sync Watch' : 'Sync Watch'}</Text>
        </Pressable>
      </LinearGradient>

      <LinearGradient colors={['#1B1B1B', '#111111']} style={styles.card}>
        <Text style={styles.cardTitle}>Your 7 day’s Recovery Trend</Text>
        <View style={styles.trendRow}>
          {trendValues.map((value, idx) => {
            const tone = scoreColor(value, idx);
            const edge = idx === 6;
            return (
              <View key={`trend-${idx}`} style={[styles.trendChip, { backgroundColor: edge ? '#000000' : tone.bg, borderColor: edge ? '#FFFFFF' : 'transparent', borderWidth: edge ? 1 : 0 }]}>
                <Text style={[styles.trendChipText, { color: edge ? '#FFFFFF' : tone.text }]}>{value}%</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.trendWeekRow}>
          {WEEK_LABELS.map((label, idx) => (
            <Text key={`day-${idx}-${label}`} style={styles.trendWeekLabel}>{label}</Text>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.metricsRow}>
        <MetricCard value={`${Math.round((wellness.sleepHours / 8) * 100)}%`} title="Sleep" subtitle={`${wellness.sleepHours.toFixed(1)} hrs`} />
        <MetricCard value={`${Math.max(1, (onboarding?.symptomTags?.length ?? 2))}`} title="Symptoms" subtitle="Manual Markers" />
        <MetricCard value={`${wellness.hydrationLiters.toFixed(1)}L`} title="Hydration" subtitle={`Goal ${wellness.hydrationGoalLiters}L`} />
      </View>

      <View style={styles.assistantCard}>
        <View style={styles.assistantHeader}>
          <Text style={styles.assistantTitle}>Fiteatsy Assistant</Text>
          <Text style={styles.assistantBadge}>AI-guided</Text>
        </View>
        <Text style={styles.assistantCopy}>Your blood sugar care will improve most from protein-first meals, consistent hydration, and short walks after eating.</Text>
        <Text style={styles.assistantCopy}>Protect your energy before the next dip</Text>
        <Text style={styles.assistantCopy}>* Dr. Rhea Kapoor - Diabetes & Metabolic Nutrition</Text>
        <Text style={styles.assistantCopy}>Energy support reset</Text>

        <View style={styles.assistantPoint}><Ionicons name="flash-outline" size={14} color="#59BE08" /><Text style={styles.assistantPointText}>Protect your energy before the next dip</Text></View>
        <View style={styles.assistantPoint}><Ionicons name="flower-outline" size={14} color="#59BE08" /><Text style={styles.assistantPointText}>Dr. Rhea Kapoor - Diabetes & Metabolic Nutrition</Text></View>
        <View style={styles.assistantPoint}><Ionicons name="return-up-back-outline" size={14} color="#59BE08" /><Text style={styles.assistantPointText}>Energy support reset</Text></View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 84,
    gap: 12
  },
  headerRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  greeting: {
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18
  },
  topRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  actionRail: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121212',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#000000',
    overflow: 'hidden'
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center'
  },
  notifyBadge: {
    position: 'absolute',
    right: 5,
    top: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D04053',
    borderWidth: 1,
    borderColor: '#F5E1E1',
    alignItems: 'center',
    justifyContent: 'center'
  },
  notifyBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700'
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#CFCFCF'
  },
  cardPrimary: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#000000',
    padding: 12
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#000000',
    padding: 12,
    backgroundColor: '#151515'
  },
  cardTitle: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8
  },
  cardSub: {
    color: '#848484',
    fontSize: 12,
    fontWeight: '400',
    marginBottom: 10
  },
  scoreBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  pillGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8
  },
  metricPill: {
    width: '49%',
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8
  },
  metricPillText: {
    fontSize: 12,
    color: '#59BE08',
    fontWeight: '400',
    flexShrink: 1
  },
  ringWrap: {
    width: 79,
    height: 79,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ringCenter: {
    position: 'absolute',
    fontSize: 14,
    color: '#F5F5F5',
    fontWeight: '600'
  },
  bodyCopy: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    marginBottom: 10
  },
  syncButton: {
    alignSelf: 'flex-start',
    height: 36,
    borderRadius: 18,
    backgroundColor: '#59BE08',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12
  },
  syncText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  },
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8
  },
  trendChip: {
    flex: 1,
    minHeight: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  trendChipText: {
    fontSize: 12,
    fontWeight: '400'
  },
  trendWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6
  },
  trendWeekLabel: {
    color: '#EEEEEE',
    fontSize: 12,
    fontWeight: '400',
    width: 20,
    textAlign: 'center'
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#F1C40F',
    padding: 10,
    minHeight: 98
  },
  metricValue: {
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4
  },
  metricTitle: {
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3
  },
  metricSubtitle: {
    color: '#E3E3E3',
    fontSize: 12,
    fontWeight: '400'
  },
  assistantCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#59BE08',
    backgroundColor: '#000000',
    padding: 12,
    marginTop: 2
  },
  assistantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  assistantTitle: {
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '600'
  },
  assistantBadge: {
    color: '#00C92C',
    fontSize: 14,
    fontWeight: '600'
  },
  assistantCopy: {
    color: '#8D8D8D',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    marginBottom: 2
  },
  assistantPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 6
  },
  assistantPointText: {
    flex: 1,
    color: '#8D8D8D',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16
  }
});
