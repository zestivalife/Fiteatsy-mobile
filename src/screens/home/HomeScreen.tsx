import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

export const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const [medicationOpen, setMedicationOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const {
    onboarding,
    wellness,
    devices,
    selectedDeviceId,
    medications,
    getMedicationTimelineForDate,
    markMedicationAction,
    pauseMedication,
    deleteMedication,
    cyclePrediction,
    getCycleDaySnapshot,
    familyConnections,
    getFamilySummary
  } = useAppContext();

  const connectedDevice = devices.find((d) => d.id === selectedDeviceId) ?? null;

  const trendValues = useMemo(() => {
    const today = Math.max(0, Math.min(100, wellness.wellnessScore));
    return [0, 10, 25, 30, Math.max(45, today - 6), Math.max(55, today), 0];
  }, [wellness.wellnessScore]);

  const todayTimeline = useMemo(() => getMedicationTimelineForDate(new Date().toISOString()), [getMedicationTimelineForDate, medications]);
  const todayISO = new Date().toISOString();
  const cycleSnapshot = getCycleDaySnapshot(todayISO);
  const medicationPending = todayTimeline.filter((item) => item.status === 'upcoming' || item.status === 'missed' || item.status === 'snoozed').length;
  const cycleLabel = cycleSnapshot.phase === 'ovulation_window'
    ? 'Ovulation Window'
    : cycleSnapshot.phase === 'follicular'
      ? 'Follicular Phase'
      : cycleSnapshot.phase === 'luteal'
        ? 'Luteal Phase'
        : 'Menstrual Phase';
  const familyConnected = familyConnections.filter((member) => member.status === 'connected');
  const familyPending = familyConnected.filter((member) => {
    const summary = getFamilySummary(member.id);
    return summary?.medicationAdherence === 'needs_attention' || summary?.checkInStatus === 'pending';
  }).length;
  const aiInsight = medicationPending > 0
    ? 'Complete pending medication reminders to protect energy consistency.'
    : cycleSnapshot.phase === 'ovulation_window'
      ? 'Hydration and gentle movement can support this cycle window.'
      : 'Protect energy dips with protein-first meals.';

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

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Today&apos;s Wellness Summary</Text>
        <View style={styles.summaryRow}><Text style={styles.summaryKey}>Medication</Text><Text style={styles.summaryValue}>{medicationPending > 0 ? `${medicationPending} Pending` : 'On Track'}</Text></View>
        <View style={styles.summaryRow}><Text style={styles.summaryKey}>Cycle</Text><Text style={styles.summaryValue}>{cycleLabel}</Text></View>
        <View style={styles.summaryRow}><Text style={styles.summaryKey}>Wellness</Text><Text style={styles.summaryValue}>{wellness.wellnessScore >= 70 ? 'Stable' : 'Needs Attention'}</Text></View>
        <View style={styles.summaryRow}><Text style={styles.summaryKey}>Family</Text><Text style={styles.summaryValue}>{familyConnected.length === 0 ? 'Not Connected' : familyPending > 0 ? `${familyPending} Pending` : 'All Good'}</Text></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionRow}>
        <Pressable style={styles.quickActionPill} onPress={() => setMedicationOpen(true)}><Ionicons name="medical-outline" size={16} color="#59BE08" /><Text style={styles.quickActionText}>Medication</Text></Pressable>
        <Pressable style={styles.quickActionPill} onPress={() => navigation.navigate('CycleCalendar')}><Ionicons name="flower-outline" size={16} color="#59BE08" /><Text style={styles.quickActionText}>Cycle</Text></Pressable>
        <Pressable style={styles.quickActionPill} onPress={() => navigation.navigate('FamilyDashboard')}><Ionicons name="people-outline" size={16} color="#59BE08" /><Text style={styles.quickActionText}>Family</Text></Pressable>
        <Pressable style={styles.quickActionPill} onPress={() => navigation.navigate('Main')}><Ionicons name="document-text-outline" size={16} color="#59BE08" /><Text style={styles.quickActionText}>Reports</Text></Pressable>
      </ScrollView>

      <View style={styles.aiCompactCard}>
        <Text style={styles.aiCompactTitle}>AI Insight</Text>
        <Text style={styles.aiCompactBody}>{aiInsight}</Text>
        <Pressable onPress={() => navigation.navigate('Main')}><Text style={styles.aiCompactLink}>View Details</Text></Pressable>
      </View>

      <View style={styles.familyCircleCard}>
        <View style={styles.familyCircleHeader}>
          <Text style={styles.familyCircleTitle}>Family Circle</Text>
          <Pressable onPress={() => navigation.navigate('FamilyDashboard')}><Text style={styles.familyCircleAdd}>+ Add Member</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.familyCircleList}>
          {familyConnected.length === 0 ? (
            <Text style={styles.familyCircleEmpty}>No family members connected yet.</Text>
          ) : (
            familyConnected.map((member) => {
              const summary = getFamilySummary(member.id);
              const status = summary?.medicationAdherence === 'needs_attention' ? 'Medication Pending' : summary?.wellnessActivity === 'active' ? 'Active' : 'Normal';
              return (
                <Pressable key={member.id} style={styles.familyCircleMember} onPress={() => navigation.navigate('FamilyMemberDetail', { connectionId: member.id })}>
                  <View style={styles.familyCircleAvatar}><Text style={styles.familyCircleAvatarText}>{member.memberName.charAt(0).toUpperCase()}</Text></View>
                  <Text style={styles.familyCircleName} numberOfLines={1}>{member.memberName}</Text>
                  <Text style={styles.familyCircleStatus} numberOfLines={1}>{status}</Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
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
                    <View style={styles.statusBadge}>
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
                      <Pressable onPress={() => deleteMedication(medication.id)}><Text style={styles.deleteLink}>Delete</Text></Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={aiOpen} animationType="slide" transparent onRequestClose={() => setAiOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setAiOpen(false)} />
          <View style={styles.sheetWrap}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Fiteatsy Assistant</Text>
            <ScrollView contentContainerStyle={styles.sheetContent}>
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
              <Pressable style={styles.ctaBtn} onPress={() => setAiOpen(false)}><Text style={styles.ctaText}>Close</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Pressable style={styles.aiFab} onPress={() => setAiOpen(true)}>
        <Ionicons name="sparkles-outline" size={18} color="#59BE08" />
        <Text style={styles.aiFabText}>AI</Text>
      </Pressable>
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
  },
  medicationCta: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#59BE08',
    backgroundColor: '#000000',
    padding: 12
  },
  medicationCtaTitle: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8
  },
  medicationCtaBody: {
    color: '#C2C2C2',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16
  },
  aiFab: {
    position: 'absolute',
    right: 16,
    bottom: 96,
    minWidth: 58,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    zIndex: 20,
    elevation: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 }
  },
  aiFabText: {
    color: '#111111',
    fontSize: 12,
    fontWeight: '700'
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
    justifyContent: 'flex-end'
  },
  sheetBackdrop: {
    flex: 1
  },
  sheetWrap: {
    maxHeight: '82%',
    backgroundColor: '#121212',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 14
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#6F6F6F',
    marginBottom: 10
  },
  sheetTitle: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10
  },
  sheetContent: {
    gap: 10,
    paddingBottom: 20
  },
  section: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600'
  },
  empty: {
    color: '#9A9A9A',
    fontSize: 12,
    fontWeight: '400'
  },
  medRow: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    backgroundColor: '#0B0B0B',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  medName: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '600'
  },
  medTime: {
    color: '#9A9A9A',
    fontSize: 12,
    fontWeight: '400'
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#59BE08'
  },
  statusText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize'
  },
  quickRow: {
    gap: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#0B0B0B'
  },
  quickLabel: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '600'
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8
  },
  quickBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  quickBtnText: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '400'
  },
  ctaRow: {
    gap: 8
  },
  ctaBtn: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#171717',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#59BE08'
  },
  ctaText: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '600'
  },
  medCard: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    backgroundColor: '#0B0B0B',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  manageRow: {
    flexDirection: 'row',
    gap: 10
  },
  link: {
    color: '#59BE08',
    fontSize: 12,
    fontWeight: '600'
  },
  deleteLink: {
    color: '#D04053',
    fontSize: 12,
    fontWeight: '600'
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252525',
    backgroundColor: '#151515',
    padding: 12,
    gap: 8
  },
  summaryTitle: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600'
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  summaryKey: {
    color: '#9A9A9A',
    fontSize: 12,
    fontWeight: '400'
  },
  summaryValue: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '600'
  },
  quickActionRow: {
    gap: 8,
    paddingRight: 8
  },
  quickActionPill: {
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2E2E2E',
    backgroundColor: '#101010',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  quickActionText: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '600'
  },
  aiCompactCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#232323',
    backgroundColor: '#131313',
    padding: 12,
    gap: 6
  },
  aiCompactTitle: {
    color: '#59BE08',
    fontSize: 12,
    fontWeight: '600'
  },
  aiCompactBody: {
    color: '#E2E2E2',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18
  },
  aiCompactLink: {
    color: '#A6D97A',
    fontSize: 12,
    fontWeight: '600'
  },
  familyCircleCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#232323',
    backgroundColor: '#131313',
    padding: 12,
    gap: 10
  },
  familyCircleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  familyCircleTitle: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600'
  },
  familyCircleAdd: {
    color: '#59BE08',
    fontSize: 12,
    fontWeight: '600'
  },
  familyCircleList: {
    gap: 10,
    paddingRight: 8
  },
  familyCircleEmpty: {
    color: '#9A9A9A',
    fontSize: 12,
    fontWeight: '400'
  },
  familyCircleMember: {
    width: 96,
    alignItems: 'center',
    gap: 4
  },
  familyCircleAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#59BE08',
    backgroundColor: '#1B1B1B',
    alignItems: 'center',
    justifyContent: 'center'
  },
  familyCircleAvatarText: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600'
  },
  familyCircleName: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '600'
  },
  familyCircleStatus: {
    color: '#9A9A9A',
    fontSize: 11,
    fontWeight: '400'
  }
});
