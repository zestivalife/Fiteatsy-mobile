import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { colors, getThemeColors, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

const leaders = [
  { rank: 1, name: 'Rahul Roy', score: 9240 },
  { rank: 2, name: 'Neha Patil', score: 9010 },
  { rank: 3, name: 'Aman Das', score: 8870 }
];

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
      <Text style={[styles.subtitle, { color: palette.textSecondary }]}>Active Performance Rankings</Text>

      <View style={styles.list}>
        {leaders.map((leader) => (
          <Card key={leader.rank}>
            <View style={styles.row}>
              <Text style={styles.rank}>#{leader.rank}</Text>
              <View>
                <Text style={[styles.name, { color: palette.textPrimary }]}>{leader.name}</Text>
                <Text style={[styles.score, { color: palette.textSecondary }]}>{leader.score} pts</Text>
              </View>
            </View>
          </Card>
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
  list: {
    gap: 10,
    paddingBottom: 20
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  rank: {
    ...typography.section,
    fontSize: 20
  },
  name: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  score: {
    ...typography.caption,
    fontSize: 13
  }
});
