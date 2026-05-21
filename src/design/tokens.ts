import { TextStyle, ViewStyle } from 'react-native';

export const colors = {
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
    lineHeight: 36,
    color: colors.textPrimary
  },
  title: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 24,
    lineHeight: 30,
    color: colors.textPrimary
  },
  section: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 20,
    lineHeight: 26,
    color: colors.textPrimary
  },
  body: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary
  },
  bodyStrong: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary
  },
  caption: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted
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
  appBackgroundLight: ['#323232', '#151515'],
  accent: ['#60AF00', '#00401F'],
  cardDark: ['#323232', '#151515'],
  ring: ['#60AF00', '#00401F']
} as const;
