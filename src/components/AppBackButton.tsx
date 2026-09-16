import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useAppContext } from '../state/AppContext';
import { getThemeColors, radius } from '../design/tokens';

type Props = {
  onPress?: () => void;
  fallbackRoute?: string;
  /** @deprecated Back controls are always icon-only. */
  label?: string;
  /** @deprecated Back controls are always icon-only. */
  iconOnly?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const AppBackButton = ({ onPress, fallbackRoute, style }: Props) => {
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
        style
      ]}
    >
      <Ionicons name="chevron-back" size={22} color={buttonTextColor} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center'
  }
});
