import { TextStyle, ViewStyle } from 'react-native';
import { ThemeMode } from '../types';

export const darkColors = {
  bgPrimary: '#000000',
  bgSecondary: '#000000',
  card: '#131313',
  cardMuted: '#131313',
  cardRaised: '#131313',
  surfaceTint: '#1E1E1E',
  surfaceAccent: '#2A2A2A',
  stroke: '#2A2A2A',
  strokeStrong: '#C9CFD4',
  textPrimary: '#FFFFFF',
  textSecondary: '#FFFFFF',
  textMuted: '#FFFFFF',
  blue: '#60AF00',
  blueDark: '#00401F',
  blueSoft: 'rgba(96, 175, 0, 0.16)',
  pink: '#D04053',
  purple: '#323232',
  success: '#509512',
  successSoft: 'rgba(96, 175, 0, 0.12)',
  warning: '#60AF00',
  warningSoft: 'rgba(96, 175, 0, 0.10)',
  danger: '#D04053',
  dangerSoft: 'rgba(208, 64, 83, 0.16)',
  info: '#D8D8D8',
  infoSoft: '#2A2A2A',
  overlay: 'rgba(0, 0, 0, 0.52)',
  white: '#FFFFFF'
} as const;

export const lightColors = {
  bgPrimary: '#F3F6FA',
  bgSecondary: '#E8EEF5',
  card: '#FFFFFF',
  cardMuted: '#F8FAFC',
  cardRaised: '#FFFFFF',
  surfaceTint: '#F1F5F9',
  surfaceAccent: '#EEF2F7',
  stroke: '#C7D2DF',
  strokeStrong: '#AAB7C7',
  textPrimary: '#0F172A',
  textSecondary: '#1E293B',
  textMuted: '#475569',
  blue: '#60AF00',
  blueDark: '#2E6B00',
  blueSoft: 'rgba(96, 175, 0, 0.12)',
  pink: '#B82A3E',
  purple: '#DDE5EF',
  success: '#3D7C0F',
  successSoft: 'rgba(96, 175, 0, 0.11)',
  warning: '#8A6400',
  warningSoft: 'rgba(245, 181, 68, 0.18)',
  danger: '#B4233B',
  dangerSoft: 'rgba(208, 64, 83, 0.12)',
  info: '#334155',
  infoSoft: '#E2E8F0',
  overlay: 'rgba(15, 23, 42, 0.28)',
  white: '#FFFFFF'
} as const;

export const colors = darkColors;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 20,
  pill: 999
} as const;

export const typography: Record<string, TextStyle> = {
  display: { fontFamily: 'Exo_700Bold', fontSize: 24, lineHeight: 30 },
  screenTitle: { fontFamily: 'Exo_600SemiBold', fontSize: 16, lineHeight: 22 },
  screenSubtitle: { fontFamily: 'Exo_400Regular', fontSize: 14, lineHeight: 20 },
  sectionTitle: { fontFamily: 'Exo_600SemiBold', fontSize: 16, lineHeight: 22 },
  cardTitle: { fontFamily: 'Exo_600SemiBold', fontSize: 14, lineHeight: 20 },
  bodyMedium: { fontFamily: 'Exo_500Medium', fontSize: 14, lineHeight: 20 },
  bodySmall: { fontFamily: 'Exo_400Regular', fontSize: 14, lineHeight: 20 },
  subtext: { fontFamily: 'Exo_400Regular', fontSize: 12, lineHeight: 17 },
  label: { fontFamily: 'Exo_500Medium', fontSize: 12, lineHeight: 17 },
  button: { fontFamily: 'Exo_600SemiBold', fontSize: 16, lineHeight: 20 },
  tab: { fontFamily: 'Exo_600SemiBold', fontSize: 14, lineHeight: 18 },
  badge: { fontFamily: 'Exo_600SemiBold', fontSize: 11, lineHeight: 14 },
  metric: { fontFamily: 'Exo_700Bold', fontSize: 24, lineHeight: 30 },
  metricSmall: { fontFamily: 'Exo_600SemiBold', fontSize: 16, lineHeight: 22 },
  navigationLabel: { fontFamily: 'Exo_500Medium', fontSize: 12, lineHeight: 15 },
  titleXL: {
    fontFamily: 'Exo_700Bold',
    fontSize: 30,
    lineHeight: 36
  },
  title: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 24,
    lineHeight: 30
  },
  section: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 20,
    lineHeight: 26
  },
  body: {
    fontFamily: 'Exo_400Regular',
    fontSize: 14,
    lineHeight: 20
  },
  bodyStrong: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 14,
    lineHeight: 20
  },
  caption: {
    fontFamily: 'Exo_400Regular',
    fontSize: 12,
    lineHeight: 17
  }
};

export const shadows: Record<string, ViewStyle> = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10
  }
};

export const gradients = {
  appBackground: ['#000000', '#000000'],
  appBackgroundLight: ['#F3F6FA', '#E8EEF5'],
  accent: ['#60AF00', '#00401F'],
  cardDark: ['rgba(51, 51, 51, 1)', 'rgba(0, 0, 0, 1)', '#000000'],
  ring: ['#60AF00', '#00401F']
} as const;

export const getThemeColors = (mode: ThemeMode) => (mode === 'light' ? lightColors : darkColors);
export const getThemeGradients = (mode: ThemeMode) => ({
  appBackground: mode === 'light' ? gradients.appBackgroundLight : gradients.appBackground
});
