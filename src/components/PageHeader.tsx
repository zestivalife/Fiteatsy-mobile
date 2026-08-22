import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppBackButton } from './AppBackButton';
import { getThemeColors, spacing, typography } from '../design/tokens';
import { useAppContext } from '../state/AppContext';

type Props = {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  fallbackRoute?: string;
  action?: React.ReactNode;
};

export const PageHeader = ({ title, subtitle, back = true, onBack, fallbackRoute, action }: Props) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  return (
    <View style={styles.header}>
      {back ? <AppBackButton iconOnly onPress={onBack} fallbackRoute={fallbackRoute} /> : <View style={styles.slot} />}
      <View style={styles.text}>
        <Text style={[styles.title, { color: palette.textPrimary }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: palette.textMuted }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      <View style={styles.slot}>{action}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  slot: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  title: { ...typography.screenTitle, textAlign: 'center' },
  subtitle: { ...typography.subtext, textAlign: 'center' }
});
