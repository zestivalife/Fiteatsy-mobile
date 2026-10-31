import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { AppBackButton } from '../../components/AppBackButton';
import { getThemeColors, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { ExternalConsultantConnection, listExternalConsultants } from '../../services/externalConsultantService';

type Props = NativeStackScreenProps<RootStackParamList, 'MyConsultants'>;

export const MyConsultantsScreen = ({ navigation }: Props) => {
  const { authSession, themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [items, setItems] = useState<ExternalConsultantConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems((await listExternalConsultants(authSession?.sessionToken ?? '')).connections); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Consultants could not be loaded.'); }
    finally { setLoading(false); }
  }, [authSession?.sessionToken]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return <Screen scroll contentStyle={styles.content}>
    <View style={styles.header}><AppBackButton onPress={() => navigation.goBack()} /><Text style={[styles.title, { color: palette.textPrimary }]}>My Consultants</Text><View style={styles.circlePlaceholder} /></View>
    <Text style={[styles.intro, { color: palette.textSecondary }]}>Connect with trusted professionals and control exactly what each person can access.</Text>
    {loading ? <ActivityIndicator color={palette.blue} style={styles.loader} /> : null}
    {error ? <Card style={styles.card}><Text style={[styles.cardTitle, { color: palette.textPrimary }]}>Unable to load consultants</Text><Text style={[styles.body, { color: palette.textSecondary }]}>{error}</Text><Pressable onPress={() => void load()}><Text style={[styles.link, { color: palette.blue }]}>Try again</Text></Pressable></Card> : null}
    {!loading && !error && items.length === 0 ? <Card style={styles.empty}><Ionicons name="people-outline" size={34} color={palette.blue} /><Text style={[styles.cardTitle, { color: palette.textPrimary }]}>No connected consultants</Text><Text style={[styles.body, { color: palette.textSecondary }]}>Ask your consultant for a one-time Connection PIN. You will review their identity and permissions before connecting.</Text></Card> : null}
    {items.map((item) => {
      const consultant = item.consultant;
      const name = consultant?.display_name || 'Connected consultant';
      return <Pressable key={item.id} accessibilityRole="button" onPress={() => navigation.navigate('ConsultantConnectionDetails', { connectionId: item.id })}>
        <Card style={styles.card}><View style={styles.cardRow}><View style={[styles.avatar, { backgroundColor: palette.cardMuted }]}><Text style={[styles.avatarText, { color: palette.blue }]}>{name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.meta}><Text style={[styles.cardTitle, { color: palette.textPrimary }]}>{name}</Text><Text style={[styles.body, { color: palette.textSecondary }]}>{consultant?.headline || consultant?.specialisations?.join(' · ') || 'Care professional'}</Text><Text style={[styles.status, { color: item.state === 'ACTIVE' ? '#5BD52C' : palette.textSecondary }]}>{item.state === 'ACTIVE' ? 'Connected' : item.state}</Text></View><Ionicons name="chevron-forward" size={18} color={palette.textSecondary} /></View></Card>
      </Pressable>;
    })}
    <Pressable accessibilityRole="button" style={[styles.primary, { backgroundColor: palette.blue }]} onPress={() => navigation.navigate('ConnectConsultant')}><Ionicons name="add" size={20} color="#FFFFFF" /><Text style={styles.primaryText}>Connect a Consultant</Text></Pressable>
  </Screen>;
};

const styles = StyleSheet.create({ content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48, gap: 16 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, circle: { width: 44, height: 44, borderWidth: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, circlePlaceholder: { width: 44 }, title: { ...typography.h2 }, intro: { ...typography.body, lineHeight: 22 }, loader: { marginTop: 56 }, card: { padding: 18, gap: 10 }, empty: { padding: 28, alignItems: 'center', gap: 12 }, cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 }, avatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 22, fontWeight: '700' }, meta: { flex: 1, gap: 3 }, cardTitle: { ...typography.h3 }, body: { ...typography.body, lineHeight: 21 }, status: { fontSize: 13, fontWeight: '700', marginTop: 4 }, link: { fontSize: 15, fontWeight: '700', marginTop: 4 }, primary: { minHeight: 54, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }, primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' } });
