import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useAppContext } from '../state/AppContext';
import { getThemeColors, radius, typography } from '../design/tokens';

type Props = {
  onPress?: () => void;
  fallbackRoute?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
  iconOnly?: boolean;
};

export const AppBackButton = ({ onPress, fallbackRoute, label = 'Back', style, iconOnly = true }: Props) => {
  const navigation = useNavigation<any>();
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const isLight = themeMode === 'light';
  const buttonTextColor = isLight ? palette.textPrimary : '#FFFFFF';

  const handlePress = () => {
    if (onPress) return onPress();
    if (navigation.canGoBack()) return navigation.goBack();
    if (fallbackRoute) navigation.navigate(fallbackRoute);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={handlePress}
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
      <Ionicons name="chevron-back" size={22} color={buttonTextColor} />
      {!iconOnly ? <Text style={[styles.label, { color: buttonTextColor }]}>{label}</Text> : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center'
  },
  iconOnly: {
    width: 44,
    paddingHorizontal: 0
  },
  label: {
    ...typography.tab
  }
});
