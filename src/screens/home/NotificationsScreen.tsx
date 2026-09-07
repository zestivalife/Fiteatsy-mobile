import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { getThemeColors, typography } from '../../design/tokens';
import { ApiClientError } from '../../services/apiClient';
import { getNotificationInbox, InboxNotification, updateNotificationInboxItem } from '../../services/notificationInboxService';
import { useAppContext } from '../../state/AppContext';

export const NotificationsScreen = () => {
  const navigation = useNavigation();
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await getNotificationInbox()).items);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Unable to load notifications right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const update = async (item: InboxNotification, action: 'read' | 'unread' | 'dismiss') => {
    if (updatingId) return;
    setUpdatingId(item.id);
    setError(null);
    try {
      const updated = await updateNotificationInboxItem(item.id, action);
      setItems((current) => action === 'dismiss' ? current.filter(({ id }) => id !== item.id) : current.map((entry) => entry.id === item.id ? updated : entry));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Unable to update this notification.');
    } finally {
      setUpdatingId(null);
    }
  };

  return <Screen scroll>
    <View style={styles.header}>
      <Text style={[styles.title, { color: palette.textPrimary }]}>Notifications</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" style={[styles.closeButton, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={18} color={palette.textPrimary} />
      </Pressable>
    </View>
    {loading ? <View style={styles.state}><ActivityIndicator color="#64D900" /><Text style={[styles.stateText, { color: palette.textSecondary }]}>Loading notifications…</Text></View> : null}
    {!loading && error ? <View style={styles.state}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { void load(); }} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View> : null}
    {!loading && !error && items.length === 0 ? <View style={styles.state}><Ionicons name="notifications-outline" size={32} color={palette.textSecondary} /><Text style={[styles.stateTitle, { color: palette.textPrimary }]}>You’re all caught up</Text><Text style={[styles.stateText, { color: palette.textSecondary }]}>Care updates and reminders will appear here.</Text></View> : null}
    {!loading && items.length > 0 ? <View style={styles.list}>{items.map((item) => {
      const read = Boolean(item.readAtISO);
      return <Card key={item.id} style={[styles.card, read && styles.cardRead]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${read ? 'Read' : 'Unread'}`} onPress={() => { void update(item, read ? 'unread' : 'read'); }} disabled={updatingId === item.id}>
          <Text style={[styles.itemTitle, { color: palette.textPrimary }]}>{item.title}</Text>
          <Text style={[styles.itemBody, { color: palette.textSecondary }]}>{item.body}</Text>
          <Text style={[styles.itemTime, { color: palette.textSecondary }]}>{new Date(item.sentAtISO ?? item.createdAtISO).toLocaleString()}</Text>
        </Pressable>
        <View style={styles.actionRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${item.title} ${read ? 'unread' : 'read'}`} onPress={() => { void update(item, read ? 'unread' : 'read'); }} disabled={updatingId === item.id}><Text style={styles.actionText}>{read ? 'Mark unread' : 'Mark read'}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${item.title}`} onPress={() => { void update(item, 'dismiss'); }} disabled={updatingId === item.id}><Text style={styles.actionText}>Dismiss</Text></Pressable>
        </View>
      </Card>;
    })}</View> : null}
  </Screen>;
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, title: { ...typography.section },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  list: { gap: 10, paddingBottom: 20 }, card: { gap: 8, borderColor: '#C9CFD4' }, cardRead: { opacity: 0.78 },
  itemTitle: { ...typography.bodyStrong, fontSize: 14 }, itemBody: { ...typography.body, fontSize: 14, marginTop: 4 }, itemTime: { ...typography.caption, marginTop: 6 },
  actionRow: { flexDirection: 'row', gap: 18 }, actionText: { ...typography.caption, color: '#60AF00' },
  state: { alignItems: 'center', gap: 12, paddingVertical: 36, paddingHorizontal: 18 }, stateTitle: { ...typography.bodyStrong, fontSize: 17 }, stateText: { ...typography.body, textAlign: 'center' },
  error: { ...typography.body, color: '#D84355', textAlign: 'center' }, retry: { minHeight: 44, minWidth: 110, borderRadius: 12, backgroundColor: '#6A4FB3', alignItems: 'center', justifyContent: 'center' }, retryText: { color: '#FFFFFF', fontFamily: 'Exo_700Bold', fontSize: 14 }
});
