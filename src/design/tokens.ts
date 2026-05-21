import { TextStyle, ViewStyle } from 'react-native';
import { ThemeMode } from '../types';

export const darkColors = {
  bgPrimary: '#151515',
  bgSecondary: '#323232',
  card: 'rgba(0, 0, 0, 0.29)',
  cardMuted: '#222222',
  cardRaised: '#2B2B2B',
  surfaceTint: '#1E1E1E',
  surfaceAccent: '#2A2A2A',
  stroke: '#000000',
  strokeStrong: '#C9CFD4',
  textPrimary: '#FFFFFF',
  textSecondary: '#F5E1E1',
  textMuted: '#939393',
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
  titleXL: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 30,
    lineHeight: 36
  },
  title: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 24,
    lineHeight: 30
  },
  section: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 20,
    lineHeight: 26
  },
  body: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 16,
    lineHeight: 24
  },
  bodyStrong: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    lineHeight: 24
  },
  caption: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    lineHeight: 18
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
  appBackground: ['#323232', '#151515'],
  appBackgroundLight: ['#F3F6FA', '#E8EEF5'],
  accent: ['#60AF00', '#00401F'],
  cardDark: ['#323232', '#151515'],
  ring: ['#60AF00', '#00401F']
} as const;

export const getThemeColors = (mode: ThemeMode) => (mode === 'light' ? lightColors : darkColors);
export const getThemeGradients = (mode: ThemeMode) => ({
  appBackground: mode === 'light' ? gradients.appBackgroundLight : gradients.appBackground
});
