import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { colors, radius, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

const searchableItems = [
  'Focus Mode',
  'Breathing Session',
  'Movement Routine',
  'Hydration Tracker',
  'Wearable Sync',
  'Wellness Report',
  'Leadership Board'
];

export const SearchScreen = () => {
  const navigation = useNavigation();
  const { themeMode } = useAppContext();
  const isLight = themeMode === 'light';
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return searchableItems;
    }
    return searchableItems.filter((item) => item.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close search" style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={18} color={isLight ? '#F5E1E1' : colors.textPrimary} />
        </Pressable>
      </View>
      <View style={[styles.inputWrap, isLight && styles.inputWrapLight]}>
        <Ionicons name="search-outline" size={20} color={isLight ? '#939393' : colors.textMuted} />
        <TextInput
          accessibilityLabel="Search features and reports"
          style={[styles.input, isLight && styles.inputLight]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search features, sessions, reports"
          placeholderTextColor={isLight ? '#939393' : colors.textMuted}
        />
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={item}>
            <Card style={styles.resultCard}>
              <Text style={styles.resultText}>{item}</Text>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No matches found</Text>}
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
  inputWrapLight: {
    backgroundColor: 'rgba(0,0,0,0.29)',
    borderColor: 'rgba(170,190,229,0.9)'
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16
  },
  inputLight: {
    color: '#F5E1E1'
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
