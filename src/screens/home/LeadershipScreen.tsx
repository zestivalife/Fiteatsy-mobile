import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { Screen } from '../../components/Screen';
import { colors, getThemeColors, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

export const LeadershipScreen = () => {
  const navigation = useNavigation();
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Leadership</Text>
        <Pressable accessibilityRole="button" style={[styles.closeButton, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={18} color={palette.textPrimary} />
        </Pressable>
      </View>
      <View style={styles.emptyState}>
        <Ionicons name="people-outline" size={34} color={palette.textSecondary} />
        <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>Community rankings are not available</Text>
        <Text style={[styles.subtitle, { color: palette.textSecondary }]}>Fiteatsy will show rankings here only when a verified, consent-aware leaderboard service is enabled. No sample member data is displayed.</Text>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  title: {
    ...typography.section
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: '#151515'
  },
  subtitle: {
    ...typography.body,
    marginBottom: 12
  },
  emptyState: { alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 48 },
  emptyTitle: {
    ...typography.bodyStrong,
    fontSize: 17,
    textAlign: 'center'
  }
});
