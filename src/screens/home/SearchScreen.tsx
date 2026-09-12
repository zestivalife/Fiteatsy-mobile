import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { colors, getThemeColors, radius, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';
import { RootStackParamList } from '../../navigation/types';

const searchableItems: Array<{ label: string; route: keyof RootStackParamList; keywords: string }> = [
  { label: 'Focus Mode', route: 'FocusSession', keywords: 'mind session concentration' },
  { label: 'Breathing Session', route: 'BreathingSession', keywords: 'calm stress recovery' },
  { label: 'Movement Routine', route: 'MovementSession', keywords: 'activity exercise workout' },
  { label: 'Hydration Tracker', route: 'HydrationSession', keywords: 'water drink' },
  { label: 'Wearable Sync', route: 'HealthDataSync', keywords: 'health connect watch device' },
  { label: 'Health Reports', route: 'Reports', keywords: 'wellness biomarker pdf analysis' },
  { label: 'Nutrition Plan', route: 'NutritionPlan', keywords: 'diet meals food' },
  { label: 'Medication Tracker', route: 'MedicationCalendar', keywords: 'medicine reminder adherence' },
  { label: 'Cycle Tracker', route: 'Cycle', keywords: 'period symptoms phase' },
  { label: 'Consultant Care', route: 'ConsultantBooking', keywords: 'appointment expert care team' }
];

export const SearchScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const isLight = themeMode === 'light';
  const darkTextStrong = isLight ? '#000000' : '#FFFFFF';
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return searchableItems;
    }
    return searchableItems.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: darkTextStrong }]}>Search</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close search" style={[styles.closeButton, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={18} color={darkTextStrong} />
        </Pressable>
      </View>
      <View style={[styles.inputWrap, { borderColor: palette.stroke, backgroundColor: palette.cardRaised }]}>
        <Ionicons name="search-outline" size={20} color={darkTextStrong} />
        <TextInput
          accessibilityLabel="Search features and reports"
          style={[styles.input, { color: darkTextStrong }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search features, sessions, reports"
          placeholderTextColor={darkTextStrong}
        />
      </View>

      <FlatList
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        data={results}
        keyExtractor={(item) => item.route}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.label}`} onPress={() => navigation.navigate(item.route as never)}>
            <Card style={styles.resultCard}>
              <Text style={[styles.resultText, { color: darkTextStrong }]}>{item.label}</Text>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: darkTextStrong }]}>No matches found</Text>}
      />
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
    ...typography.section
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
  inputWrap: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: '#151515',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  input: {
    ...typography.body,
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16
  },
  list: {
    paddingTop: 12,
    gap: 8,
    paddingBottom: 20
  },
  resultCard: {
    paddingVertical: 12
  },
  resultText: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  empty: {
    ...typography.body,
    textAlign: 'center',
    marginTop: 16
  }
});
