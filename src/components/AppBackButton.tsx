import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppContext } from '../state/AppContext';
import { getThemeColors, radius, typography } from '../design/tokens';

type Props = {
  onPress: () => void;
  label?: string;
  style?: ViewStyle;
  iconOnly?: boolean;
};

export const AppBackButton = ({ onPress, label = 'Back', style, iconOnly = false }: Props) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const isLight = themeMode === 'light';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          borderColor: palette.stroke,
          backgroundColor: isLight ? '#FFFFFF' : palette.cardRaised,
          opacity: pressed ? 0.85 : 1
        },
        iconOnly && styles.iconOnly,
        style
      ]}
    >
      <Ionicons name="chevron-back" size={18} color={palette.textPrimary} />
      {!iconOnly ? <Text style={[styles.label, { color: palette.textPrimary }]}>{label}</Text> : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center'
  },
  iconOnly: {
    width: 36,
    paddingHorizontal: 0
  },
  label: {
    ...typography.caption,
    fontSize: 14
  }
});
