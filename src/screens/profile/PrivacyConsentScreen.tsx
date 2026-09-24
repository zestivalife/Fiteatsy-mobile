import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { ProfileHeader, ProfileRow, ProfileSection } from '../../components/ProfileUi';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { getThemeColors, spacing, typography } from '../../design/tokens';
import { ConsultantAccessRequest, getConsultantAccessRequests, updateConsultantAccess } from '../../services/consultantConsentService';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacyConsent'>;

export const PrivacyConsentScreen = ({ navigation }: Props) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [requests, setRequests] = useState<ConsultantAccessRequest[]>([]);
  const [busyAssignment, setBusyAssignment] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setRequests(await getConsultantAccessRequests()); setError(''); }
    catch { setError('Consultant access could not be refreshed. Your existing choices remain unchanged.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const change = async (request: ConsultantAccessRequest) => {
    if (busyAssignment) return;
    setBusyAssignment(request.assignmentId); setError('');
    try {
      const saved = await updateConsultantAccess(request.assignmentId, request.status === 'GRANTED' ? 'REVOKED' : 'GRANTED');
      setRequests((current) => current.map((item) => item.assignmentId === saved.assignmentId ? saved : item));
    } catch { setError('Your choice was not changed. Check your connection and try again.'); }
    finally { setBusyAssignment(null); }
  };

  return <Screen scroll>
    <ProfileHeader navigation={navigation} title="Privacy & Consent" />
    <Text style={[styles.copy, { color: palette.textMuted }]}>You decide which assigned professional can access your FitEatsy information. Assignment alone never grants access.</Text>
    <ProfileSection>
      <ProfileRow icon="heart-outline" color="#2FD36B" title="Health Data Access" subtitle="Review platform permissions and synchronization" onPress={() => navigation.navigate('ConnectedHealth')} />
      <ProfileRow icon="phone-portrait-outline" color="#35B8D0" title={Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'} subtitle="Read-only access is governed by your device" onPress={() => navigation.navigate('ConnectedHealth')} />
    </ProfileSection>
    <ProfileSection label="Professional access">
      {requests.length === 0 && !error ? <Text style={[styles.note, { color: palette.textMuted }]}>No active professional is awaiting access.</Text> : null}
      {requests.map((request) => { const granted = request.status === 'GRANTED'; return <View key={request.assignmentId} style={[styles.request, { borderColor: palette.stroke }]}>
        <Text style={[styles.name, { color: palette.textPrimary }]}>{request.consultantName}</Text>
        <Text style={[styles.meta, { color: palette.textMuted }]}>{request.professionalType.replaceAll('_', ' ')} · {request.relationshipType.replaceAll('_', ' ')}</Text>
        <Text style={[styles.purpose, { color: palette.textMuted }]}>{request.purpose}</Text>
        {request.dataCategories.map((category) => <Text key={category} style={[styles.category, { color: palette.textMuted }]}>• {category}</Text>)}
        <Pressable accessibilityRole="button" accessibilityLabel={`${granted ? 'Revoke' : 'Allow'} access for ${request.consultantName}`} onPress={() => void change(request)} disabled={busyAssignment !== null} style={[styles.action, { borderColor: granted ? palette.danger : palette.blue }]}>
          {busyAssignment === request.assignmentId ? <ActivityIndicator color={palette.blue} /> : <Text style={[styles.actionText, { color: granted ? palette.danger : palette.blue }]}>{granted ? 'Revoke access' : 'Allow access'}</Text>}
        </Pressable>
      </View>; })}
      <Text style={[styles.note, { color: palette.textMuted }]}>You can revoke access at any time. A new assignment or policy version requires a new decision.</Text>
      {error ? <Text accessibilityRole="alert" style={[styles.note, { color: palette.danger }]}>{error}</Text> : null}
    </ProfileSection>
    <ProfileSection label="Your information">
      <ProfileRow icon="document-text-outline" color="#8E8E93" title="Privacy policy" subtitle="Legal content is unavailable until the governed public URL is configured" />
      <ProfileRow icon="reader-outline" color="#8E8E93" title="Terms & conditions" subtitle="Legal content is unavailable until the governed public URL is configured" />
    </ProfileSection>
  </Screen>;
};

const styles = StyleSheet.create({
  copy: { ...typography.body, marginBottom: spacing.lg },
  request: { borderWidth: 1, borderRadius: 16, margin: spacing.md, padding: spacing.md, gap: spacing.xs },
  name: { ...typography.bodyStrong }, meta: { ...typography.caption, textTransform: 'capitalize' },
  purpose: { ...typography.body, marginTop: spacing.xs, marginBottom: spacing.xs }, category: { ...typography.caption },
  action: { minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  actionText: { ...typography.bodyStrong }, note: { ...typography.caption, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
});
