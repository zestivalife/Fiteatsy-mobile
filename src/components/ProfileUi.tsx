import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppBackButton } from './AppBackButton';
import { getThemeColors, radius, spacing, typography } from '../design/tokens';
import { useAppContext } from '../state/AppContext';

export const ProfileHeader = ({ navigation, title }: { navigation: { goBack: () => void }; title: string }) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  return <View style={styles.header}><AppBackButton onPress={() => navigation.goBack()} label="Profile" /><Text accessibilityRole="header" style={[styles.title, { color: palette.textPrimary }]}>{title}</Text></View>;
};

export const ProfileSection = ({ label, children }: { label?: string; children: React.ReactNode }) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  return <View style={styles.section}>{label ? <Text style={[styles.label, { color: palette.textMuted }]}>{label.toUpperCase()}</Text> : null}<View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.stroke }]}>{children}</View></View>;
};

export const ProfileRow = ({ icon, color, title, subtitle, onPress, destructive = false, trailing }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; subtitle?: string; onPress?: () => void; destructive?: boolean; trailing?: React.ReactNode }) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}>
    <View style={[styles.icon, { backgroundColor: `${color}22` }]}><Ionicons name={icon} size={20} color={color} /></View>
    <View style={styles.copy}><Text style={[styles.rowTitle, { color: destructive ? palette.danger : palette.textPrimary }]}>{title}</Text>{subtitle ? <Text style={[styles.subtitle, { color: palette.textMuted }]}>{subtitle}</Text> : null}</View>
    {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={17} color={palette.textMuted} /> : null)}
  </Pressable>;
};

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  title: { ...typography.title, fontSize: 28 },
  section: { gap: spacing.xs, marginBottom: spacing.lg },
  label: { ...typography.badge, letterSpacing: 1.2, marginLeft: spacing.xxs },
  card: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  row: { minHeight: 62, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343434' },
  pressed: { opacity: 0.65 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 }, rowTitle: { ...typography.bodyStrong }, subtitle: { ...typography.caption, marginTop: 2 }
});
