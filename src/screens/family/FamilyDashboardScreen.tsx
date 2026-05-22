import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { FamilyRelationshipType, FamilyShareType } from '../../types';
import { useAppContext } from '../../state/AppContext';
import { relationshipLabel, shareTypeLabel } from '../../services/familyConnectService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const shareTypes: FamilyShareType[] = [
  'medication_adherence',
  'wellness_checkins',
  'activity_consistency',
  'sleep_summary',
  'emergency_alerts',
  'appointment_reminders',
  'uploaded_reports',
  'wellness_trends'
];

export const FamilyDashboardScreen = () => {
  const navigation = useNavigation<Nav>();
  const {
    familyConnections,
    generateFamilyInvite,
    requestFamilyConnection,
    approveFamilyConnection,
    rejectFamilyConnection,
    setFamilySharingPaused,
    disconnectFamilyMember,
    getFamilySummary
  } = useAppContext();

  const [connectOpen, setConnectOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [memberName, setMemberName] = useState('');
  const [relationship, setRelationship] = useState<FamilyRelationshipType>('parent');
  const [errorText, setErrorText] = useState('');
  const [latestInvite, setLatestInvite] = useState<string | null>(null);

  const pending = familyConnections.filter((c) => c.status === 'pending_outgoing' || c.status === 'pending_incoming');
  const connected = familyConnections.filter((c) => c.status === 'connected');

  const onGenerate = () => {
    const invite = generateFamilyInvite('FIT');
    setLatestInvite(invite.code);
    setErrorText('');
  };

  const onSendRequest = () => {
    const result = requestFamilyConnection({ code: inviteCode, memberName, relationship });
    if (!result.ok) {
      setErrorText(result.reason ?? 'Could not send request.');
      return;
    }
    setInviteCode('');
    setMemberName('');
    setErrorText('Connection request sent for approval.');
  };

  return (
    <Screen scroll>
      <AppBackButton onPress={() => navigation.goBack()} />
      <Text style={styles.title}>Family Wellness Sharing</Text>
      <Text style={styles.subtitle}>Support loved ones with permission-based wellness visibility.</Text>

      <Pressable style={styles.connectBtn} onPress={() => setConnectOpen(true)}>
        <Text style={styles.connectBtnText}>Connect Family</Text>
      </Pressable>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Pending requests</Text>
        {pending.length === 0 ? <Text style={styles.empty}>No pending requests.</Text> : pending.map((item) => (
          <View key={item.id} style={styles.memberCard}>
            <Text style={styles.memberName}>{item.memberName}</Text>
            <Text style={styles.memberMeta}>{relationshipLabel(item.relationship)} • {item.status.replace('_', ' ')}</Text>
            <View style={styles.row}>
              <Pressable style={styles.smallBtn} onPress={() => approveFamilyConnection(item.id, item.permissions)}><Text style={styles.smallBtnText}>Approve</Text></Pressable>
              <Pressable style={styles.smallBtn} onPress={() => rejectFamilyConnection(item.id)}><Text style={styles.smallBtnText}>Reject</Text></Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Connected members</Text>
        {connected.length === 0 ? <Text style={styles.empty}>No family members connected yet.</Text> : connected.map((item) => {
          const summary = getFamilySummary(item.id);
          return (
            <Pressable key={item.id} style={styles.memberCard} onPress={() => navigation.navigate('FamilyMemberDetail', { connectionId: item.id })}>
              <Text style={styles.memberName}>{item.memberName}</Text>
              <Text style={styles.memberMeta}>{relationshipLabel(item.relationship)} • {item.lastCheckInISO ? `Last check-in ${new Date(item.lastCheckInISO).toLocaleDateString()}` : 'No recent check-in'}</Text>
              <Text style={styles.summaryText}>{summary?.trendLabel ?? 'Sharing paused or not available.'}</Text>
              <View style={styles.rowBetween}>
                <View style={styles.switchRow}><Text style={styles.switchText}>Pause sharing</Text><Switch value={item.sharingPaused} onValueChange={(v) => setFamilySharingPaused(item.id, v)} /></View>
                <Pressable onPress={() => disconnectFamilyMember(item.id)}><Text style={styles.disconnect}>Disconnect</Text></Pressable>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Modal visible={connectOpen} transparent animationType="slide" onRequestClose={() => setConnectOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setConnectOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Connect Family</Text>

            <Pressable style={styles.sheetAction} onPress={onGenerate}><Text style={styles.sheetActionText}>Generate Invite Code</Text></Pressable>
            {latestInvite ? <Text style={styles.inviteCode}>Code: {latestInvite}</Text> : null}

            <Text style={styles.label}>Enter Invite Code</Text>
            <TextInput value={inviteCode} onChangeText={setInviteCode} placeholder="FIT-8X2KQ" placeholderTextColor={colors.textMuted} style={styles.input} autoCapitalize="characters" />
            <TextInput value={memberName} onChangeText={setMemberName} placeholder="Member name" placeholderTextColor={colors.textMuted} style={styles.input} />
            <View style={styles.wrap}>
              {(['parent', 'child', 'spouse', 'caregiver', 'family_member'] as FamilyRelationshipType[]).map((value) => (
                <Pressable key={value} style={[styles.chip, relationship === value && styles.chipActive]} onPress={() => setRelationship(value)}><Text style={styles.chipText}>{relationshipLabel(value)}</Text></Pressable>
              ))}
            </View>

            <Text style={styles.label}>Sharing permissions (consent-based)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wrap}>
              {shareTypes.map((type) => <View key={type} style={styles.permissionTag}><Text style={styles.permissionTagText}>{shareTypeLabel(type)}</Text></View>)}
            </ScrollView>

            {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
            <Pressable style={styles.sendBtn} onPress={onSendRequest}><Text style={styles.sendBtnText}>Send Connection Request</Text></Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  backBtn: { alignSelf: 'flex-start', minHeight: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.stroke, paddingHorizontal: 10, justifyContent: 'center', marginBottom: spacing.sm },
  backText: { ...typography.caption, color: colors.textPrimary },
  title: { ...typography.section, marginBottom: 6 },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  connectBtn: { minHeight: 46, borderRadius: radius.md, backgroundColor: colors.blueSoft, borderWidth: 1, borderColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  connectBtnText: { ...typography.bodyStrong, fontSize: 14 },
  sectionCard: { borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.cardMuted, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, gap: 8 },
  sectionTitle: { ...typography.bodyStrong, fontSize: 14 },
  empty: { ...typography.caption },
  memberCard: { borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.card, gap: 6 },
  memberName: { ...typography.bodyStrong, fontSize: 14 },
  memberMeta: { ...typography.caption },
  summaryText: { ...typography.caption, color: colors.textSecondary },
  row: { flexDirection: 'row', gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  smallBtn: { borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { ...typography.caption, color: colors.textPrimary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchText: { ...typography.caption },
  disconnect: { ...typography.caption, color: colors.danger },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: { maxHeight: '86%', borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.cardRaised, borderWidth: 1, borderColor: colors.stroke, padding: spacing.md, gap: 8 },
  handle: { alignSelf: 'center', width: 48, height: 4, borderRadius: radius.pill, backgroundColor: colors.textMuted, marginBottom: 6 },
  sheetTitle: { ...typography.bodyStrong, fontSize: 16 },
  sheetAction: { minHeight: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.blue, backgroundColor: colors.blueSoft, justifyContent: 'center', alignItems: 'center' },
  sheetActionText: { ...typography.caption, color: colors.textPrimary },
  inviteCode: { ...typography.bodyStrong, color: colors.textPrimary },
  label: { ...typography.caption, color: colors.textSecondary },
  input: { minHeight: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.card, paddingHorizontal: 12, color: colors.textPrimary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.stroke, paddingHorizontal: 12, justifyContent: 'center' },
  chipActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  chipText: { ...typography.caption, color: colors.textPrimary },
  permissionTag: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.stroke, paddingHorizontal: 10, paddingVertical: 6 },
  permissionTagText: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
  sendBtn: { minHeight: 44, borderRadius: radius.md, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { ...typography.bodyStrong, color: colors.white }
});
