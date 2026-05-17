import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { relationshipLabel, shareTypeLabel } from '../../services/familyConnectService';
import { FamilyShareType } from '../../types';

export const FamilyMemberDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'FamilyMemberDetail'>>();
  const { familyConnections, getFamilySummary, sendFamilyPing, triggerFamilySOS } = useAppContext();
  const connection = familyConnections.find((item) => item.id === route.params.connectionId);

  if (!connection) {
    return (
      <Screen>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}><Text style={styles.backText}>‹ Back</Text></Pressable>
        <Text style={styles.empty}>Member not found.</Text>
      </Screen>
    );
  }

  const summary = getFamilySummary(connection.id);

  const onCall = () => Alert.alert('Quick call', 'Call action is ready for native dialer integration.');
  const onMessage = (msg: string) => sendFamilyPing(connection.id, msg);
  const onSOS = () => triggerFamilySOS(connection.id, `SOS shared for ${connection.memberName}. Please check in now.`);

  return (
    <Screen scroll>
      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}><Text style={styles.backText}>‹ Back</Text></Pressable>
      <Text style={styles.title}>{connection.memberName}</Text>
      <Text style={styles.subtitle}>{relationshipLabel(connection.relationship)} • Supportive sharing</Text>

      <View style={styles.card}>
        <Text style={styles.section}>Wellness Summary</Text>
        <Text style={styles.text}>{summary?.trendLabel ?? 'No summary available right now.'}</Text>
        <Text style={styles.text}>Medication: {summary?.medicationAdherence.replace(/_/g, ' ') ?? 'unknown'}</Text>
        <Text style={styles.text}>Check-in: {summary?.checkInStatus ?? 'pending'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Shared Permissions</Text>
        {Object.entries(connection.permissions).map(([key, allowed]) => (
          <Text key={key} style={styles.text}>{shareTypeLabel(key as FamilyShareType)}: {allowed ? 'Enabled' : 'Hidden'}</Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Quick Actions</Text>
        <View style={styles.row}>
          <Pressable style={styles.actionBtn} onPress={onCall}><Text style={styles.actionBtnText}>Call Member</Text></Pressable>
          <Pressable style={styles.actionBtn} onPress={() => onMessage('How are you feeling?')}><Text style={styles.actionBtnText}>Check-in Ping</Text></Pressable>
        </View>
        <View style={styles.row}>
          <Pressable style={styles.actionBtn} onPress={() => onMessage('Did you take your medication?')}><Text style={styles.actionBtnText}>Medication Reminder</Text></Pressable>
          <Pressable style={styles.actionBtn} onPress={() => onMessage('Call me when free.')}><Text style={styles.actionBtnText}>Call me when free</Text></Pressable>
        </View>
        <Pressable style={styles.sosBtn} onPress={onSOS}><Text style={styles.sosBtnText}>Trigger SOS Alert</Text></Pressable>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  backBtn: { alignSelf: 'flex-start', minHeight: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.stroke, paddingHorizontal: 10, justifyContent: 'center', marginBottom: spacing.sm },
  backText: { ...typography.caption, color: colors.textPrimary },
  title: { ...typography.section, marginBottom: 6 },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  card: { borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.md, backgroundColor: colors.cardMuted, padding: spacing.md, gap: 8, marginBottom: spacing.sm },
  section: { ...typography.bodyStrong, fontSize: 14 },
  text: { ...typography.caption, color: colors.textSecondary },
  row: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, minHeight: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  actionBtnText: { ...typography.caption, color: colors.textPrimary, textAlign: 'center' },
  sosBtn: { minHeight: 44, borderRadius: radius.md, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  sosBtnText: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 14 },
  empty: { ...typography.body }
});
