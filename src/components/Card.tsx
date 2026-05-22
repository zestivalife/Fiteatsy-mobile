import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { getThemeColors, radius, shadows, spacing } from '../design/tokens';
import { useAppContext } from '../state/AppContext';

export const Card = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  return <View style={[styles.card, themeMode === 'dark' ? styles.darkCard : null, { backgroundColor: palette.card, borderColor: palette.stroke }, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.card
  },
  darkCard: {
    shadowColor: '#60AF00',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6
  }
});
