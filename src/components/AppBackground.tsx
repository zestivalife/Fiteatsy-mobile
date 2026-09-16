import React, { memo } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { getThemeGradients } from '../design/tokens';
import { useAppContext } from '../state/AppContext';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** The sole visual background authority for application screens. */
export const AppBackground = memo(({ children, style }: Props) => {
  const { themeMode } = useAppContext();
  const background = getThemeGradients(themeMode).appBackground;

  return (
    <LinearGradient colors={[...background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, style]}>
      <StatusBar style={themeMode === 'light' ? 'dark' : 'light'} />
      {children}
    </LinearGradient>
  );
});

AppBackground.displayName = 'AppBackground';

const styles = StyleSheet.create({
  fill: { flex: 1 }
});
