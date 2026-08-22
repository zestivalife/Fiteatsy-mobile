import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getThemeColors, radius, spacing, typography } from '../design/tokens';
import { useAppContext } from '../state/AppContext';

type Tab<T extends string> = { key: T; label: string };
type Props<T extends string> = { tabs: Tab<T>[]; value: T; onChange: (value: T) => void };

export const SegmentedTabs = <T extends string>({ tabs, value, onChange }: Props<T>) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(tab.key)} style={[styles.tab, { backgroundColor: palette.cardMuted }, active && styles.active]}>
            <Text style={[styles.label, { color: palette.textMuted }, active && styles.activeLabel]} numberOfLines={1}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  tab: { flex: 1, minHeight: 40, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: '#67E638' },
  label: { ...typography.tab },
  activeLabel: { color: '#071006' }
});
