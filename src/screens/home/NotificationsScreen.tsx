import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { colors, getThemeColors, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
};

const initialNotifications: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Hydration Reminder',
    body: 'Drink 250 ml water to stay on track.',
    read: false
  },
  {
    id: 'notif-2',
    title: 'Wearable Synced',
    body: 'Your Apple Watch data was updated successfully.',
    read: false
  },
  {
    id: 'notif-3',
    title: 'Focus Streak',
    body: 'You have completed 3 focus sessions this week.',
    read: true
  }
];

export const NotificationsScreen = () => {
  const navigation = useNavigation();
  const { nudges, logNudgeAction, themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [items, setItems] = useState<NotificationItem[]>(initialNotifications);

  const mappedNudges = useMemo<NotificationItem[]>(
    () =>
      nudges.slice(-3).map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        read: false
      })),
    [nudges]
  );

  const listItems = mappedNudges.length > 0 ? [...mappedNudges, ...items] : items;

  const toggleRead = (id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: !item.read } : item)));
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Notifications</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" style={[styles.closeButton, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={18} color={palette.textPrimary} />
        </Pressable>
      </View>
      <View style={styles.list}>
        {listItems.map((item) => (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.read ? 'Read' : 'Unread'}`} accessibilityHint="Opens notification actions and marks read state" onPress={() => toggleRead(item.id)}>
            <Card style={[styles.card, item.read && styles.cardRead]}>
              <Text style={[styles.itemTitle, { color: palette.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.itemBody, { color: palette.textSecondary }]}>{item.body}</Text>
              <View style={styles.actionRow}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Snooze ${item.title}`} onPress={() => logNudgeAction(item.id, 'snoozed')}>
                  <Text style={[styles.itemState, { color: '#60AF00' }]}>Snooze</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${item.title}`} onPress={() => logNudgeAction(item.id, 'dismissed')}>
                  <Text style={[styles.itemState, { color: '#60AF00' }]}>Dismiss</Text>
                </Pressable>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  title: {
    ...typography.section,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: '#151515'
  },
  list: {
    gap: 10,
    paddingBottom: 20
  },
  card: {
    gap: 4,
    borderColor: '#C9CFD4'
  },
  cardRead: {
    opacity: 0.8
  },
  itemTitle: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  itemBody: {
    ...typography.body,
    fontSize: 14
  },
  itemState: {
    ...typography.caption,
    color: colors.blue
  },
  actionRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 12
  }
});
