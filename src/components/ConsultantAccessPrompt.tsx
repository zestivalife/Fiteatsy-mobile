import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getThemeColors, spacing, typography } from '../design/tokens';
import { ConsultantAccessRequest, getConsultantAccessRequests, updateConsultantAccess } from '../services/consultantConsentService';
import { useAppContext } from '../state/AppContext';

const DISMISS_PREFIX = 'consultant-access-prompt:';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export const ConsultantAccessPrompt = ({ enabled }: { enabled: boolean }) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [request, setRequest] = useState<ConsultantAccessRequest | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) { setRequest(null); return; }
    let active = true;
    void getConsultantAccessRequests().then(async (requests) => {
      const eligible = requests.filter((item) => item.status === 'NOT_REQUESTED' || item.status === 'PENDING');
      for (const item of eligible) {
        const dismissed = await AsyncStorage.getItem(`${DISMISS_PREFIX}${item.assignmentId}:${item.policyVersion}`);
        if (!dismissed || Date.now() - Date.parse(dismissed) >= DISMISS_MS) {
          if (active) setRequest(item);
          return;
        }
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [enabled]);

  const dismiss = async () => {
    if (!request) return;
    await AsyncStorage.setItem(`${DISMISS_PREFIX}${request.assignmentId}:${request.policyVersion}`, new Date().toISOString());
    setRequest(null);
  };
  const allow = async () => {
    if (!request || busy) return;
    setBusy(true);
    try { await updateConsultantAccess(request.assignmentId, 'GRANTED'); setRequest(null); }
    finally { setBusy(false); }
  };

  return <Modal visible={request !== null} transparent animationType="fade" onRequestClose={() => void dismiss()}>
    <View style={styles.backdrop}><View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
      <Text style={[styles.title, { color: palette.textPrimary }]}>Allow professional access?</Text>
      <Text style={[styles.name, { color: palette.textPrimary }]}>{request?.consultantName}</Text>
      <Text style={[styles.copy, { color: palette.textMuted }]}>{request?.professionalType.replaceAll('_', ' ')} · {request?.purpose}</Text>
      {request?.dataCategories.map((category) => <Text key={category} style={[styles.category, { color: palette.textMuted }]}>• {category}</Text>)}
      <Text style={[styles.footnote, { color: palette.textMuted }]}>Assignment does not grant access. You can revoke this choice later in Profile → Privacy & Consent.</Text>
      <Pressable accessibilityRole="button" onPress={() => void allow()} disabled={busy} style={[styles.primary, { backgroundColor: palette.blue }]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Allow access</Text>}</Pressable>
      <Pressable accessibilityRole="button" onPress={() => void dismiss()} disabled={busy} style={[styles.secondary, { borderColor: palette.stroke }]}><Text style={[styles.secondaryText, { color: palette.textPrimary }]}>Not now</Text></Pressable>
    </View></View>
  </Modal>;
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: 'rgba(0,0,0,0.72)' },
  card: { borderWidth: 1, borderRadius: 24, padding: spacing.xl, gap: spacing.sm },
  title: { ...typography.title }, name: { ...typography.bodyStrong, marginTop: spacing.sm },
  copy: { ...typography.body }, category: { ...typography.caption }, footnote: { ...typography.caption, marginVertical: spacing.sm },
  primary: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, primaryText: { ...typography.bodyStrong, color: '#FFFFFF' },
  secondary: { minHeight: 52, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, secondaryText: { ...typography.bodyStrong },
});
