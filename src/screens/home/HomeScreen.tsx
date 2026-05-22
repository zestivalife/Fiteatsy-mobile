import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { buildRecoveryIntelligence } from '../../services/recoveryIntelligenceEngine';
import { getHealthConnectRuntimeDiagnostics, type HealthConnectRuntimeDiagnostics } from '../../services/healthConnectService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
type RecoveryDimension = 'calm' | 'activity' | 'nutrition' | 'rhythm' | 'sleep';

type DimensionVisual = {
  key: RecoveryDimension;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconMuted: keyof typeof Ionicons.glyphMap;
  gradient: [string, string];
};

const DIMENSION_VISUALS: DimensionVisual[] = [
  { key: 'calm', label: 'Calm', icon: 'heart', iconMuted: 'heart-outline', gradient: ['#F86C6C', '#E51A1A'] },
  { key: 'activity', label: 'Activity', icon: 'walk', iconMuted: 'walk-outline', gradient: ['#F7AA6A', '#F9700E'] },
  { key: 'nutrition', label: 'Nutrition', icon: 'leaf', iconMuted: 'leaf-outline', gradient: ['#CCFF80', '#60AF00'] },
  { key: 'rhythm', label: 'Cycle', icon: 'flower', iconMuted: 'flower-outline', gradient: ['#F7A7F0', '#DC1DC9'] },
  { key: 'sleep', label: 'Sleep', icon: 'moon', iconMuted: 'moon-outline', gradient: ['#8BB4E8', '#237AFC'] }
];

const getGlobalRecoveryMicroState = (score: number) => {
  if (score <= 29) return 'Strained';
  if (score <= 49) return 'Fragile';
  if (score <= 69) return 'Recovering';
  if (score <= 84) return 'Stable';
  return 'Thriving';
};

const scoreColor = (value: number, index: number) => {
  if (index === 0 || index === 6) return { bg: '#000000', text: '#F2F2F2' };
  if (value <= 15) return { bg: '#FF6666', text: '#111111' };
  if (value <= 30) return { bg: '#F8E67A', text: '#111111' };
  if (value <= 60) return { bg: '#84CFFF', text: '#111111' };
  return { bg: '#8DF591', text: '#111111' };
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RecoveryRing = ({
  value,
  pulse,
  gradient,
  isLight
}: {
  value: number;
  pulse: Animated.Value;
  gradient: [string, string];
  isLight: boolean;
}) => {
  const size = HERO_RING_SIZE;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const canvas = size;
  const center = canvas / 2;
  const c = 2 * Math.PI * radius;
  const p = Math.min(100, Math.max(0, value));
  const targetDash = c * (p / 100);
  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fillAnim.setValue(0);
    Animated.timing(fillAnim, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [p, fillAnim]);

  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.03] });
  const gradientId = `arcGradient-${gradient[0].replace('#', '')}-${gradient[1].replace('#', '')}`;
  const dashOffset = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [c, c - targetDash]
  });

  return (
    <Animated.View style={[styles.ringWrap, { width: canvas, height: canvas, transform: [{ scale: glowScale }] }]}>
      <Svg width={canvas} height={canvas}>
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={gradient[0]} stopOpacity={1} />
            <Stop offset="56%" stopColor={gradient[0]} stopOpacity={0.95} />
            <Stop offset="100%" stopColor={gradient[1]} stopOpacity={1} />
          </SvgLinearGradient>
        </Defs>
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={gradient[1]}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={dashOffset as unknown as number}
          rotation={-90}
          originX={center}
          originY={center}
        />
      </Svg>
      <Text style={[styles.ringCenter, { top: size * 0.38 - 8, color: isLight ? '#0F172A' : '#DDE5EF' }]}>{p}/100</Text>
      <Text style={[styles.ringSub, { top: (size * 0.64) - 8, color: isLight ? '#1E293B' : '#D6DBE0' }]}>Recovery Core</Text>
    </Animated.View>
  );
};

const StarCircleShape = ({ isLight }: { isLight: boolean }) => (
  <Svg width="100%" height="100%" viewBox="0 0 216 216" fill="none">
    <Defs>
      <SvgLinearGradient id="sc-paint0" x1="225.054" y1="-122.714" x2="-44.6283" y2="334.195" gradientUnits="userSpaceOnUse">
        <Stop offset="0.226599" stopColor={isLight ? '#E8EDF3' : '#353A40'} />
        <Stop offset="0.697917" stopColor={isLight ? '#C9D3DF' : '#121416'} />
      </SvgLinearGradient>
      <SvgLinearGradient id="sc-paint1" x1="185.751" y1="4.25001" x2="-32.2699" y2="105.989" gradientUnits="userSpaceOnUse">
        <Stop offset="0.0709612" stopColor={isLight ? '#B6C1CE' : '#505962'} />
        <Stop offset="0.507086" stopOpacity="0" />
        <Stop offset="1" stopColor={isLight ? '#EDF2F8' : '#000000'} />
      </SvgLinearGradient>
      <SvgLinearGradient id="sc-paint2" x1="388.833" y1="359.667" x2="78.329" y2="-74.4648" gradientUnits="userSpaceOnUse">
        <Stop stopColor={isLight ? '#F3F6FA' : '#32383E'} />
        <Stop offset="1" stopColor={isLight ? '#D8E0E9' : '#17191C'} />
      </SvgLinearGradient>
      <SvgLinearGradient id="sc-paint3" x1="283.521" y1="265.292" x2="89.4556" y2="-6.04052" gradientUnits="userSpaceOnUse">
        <Stop stopColor={isLight ? '#E7EDF4' : '#32383E'} />
        <Stop offset="1" stopColor={isLight ? '#C5CFDB' : '#17191C'} />
      </SvgLinearGradient>
    </Defs>
    <Circle cx="108" cy="108" r="95" transform="rotate(-90 108 108)" fill="url(#sc-paint0)" />
    <Circle cx="108" cy="108" r="94.5" transform="rotate(-90 108 108)" stroke="url(#sc-paint1)" strokeOpacity="0.4" />
    <Circle cx="108" cy="108" r="80" transform="rotate(-90 108 108)" fill="url(#sc-paint2)" />
    <Circle cx="108" cy="108" r="50" transform="rotate(-90 108 108)" fill="url(#sc-paint3)" />
  </Svg>
);

const HERO_SCALE = 358 / 375;
const HERO_RING_SIZE = 162 * HERO_SCALE * 0.8;
const HERO_CENTER_CIRCLE_SIZE = 220 * 1.2 * 0.8 * 0.9 * 0.95;

const FitStarShape = ({ isLight }: { isLight: boolean }) => (
  <Svg width="100%" height="100%" viewBox="0 0 334 321" fill="none">
    <Path
      d="M123.454 26.1973C138.6 11.7458 146.173 4.52013 154.828 1.79736C162.446 -0.59916 170.616 -0.59916 178.234 1.79736C186.89 4.52013 194.462 11.7458 209.608 26.1972L241.13 56.2743C243.401 58.442 244.537 59.5258 245.752 60.5116C246.831 61.3876 247.957 62.2053 249.123 62.9611C250.436 63.8116 251.818 64.557 254.582 66.0478L292.928 86.7325C311.352 96.671 320.564 101.64 325.828 109.03C330.461 115.535 332.986 123.306 333.061 131.291C333.146 140.364 328.614 149.799 319.55 168.669L300.686 207.943C299.327 210.773 298.647 212.188 298.085 213.648C297.585 214.945 297.155 216.268 296.797 217.611C296.394 219.123 296.112 220.667 295.548 223.756L287.725 266.617C283.966 287.211 282.087 297.508 276.685 304.798C271.931 311.215 265.321 316.017 257.749 318.556C249.146 321.441 238.773 320.046 218.025 317.257L174.845 311.452C171.733 311.034 170.177 310.825 168.615 310.741C167.227 310.667 165.836 310.667 164.447 310.741C162.885 310.825 161.329 311.034 158.217 311.452L115.037 317.257C94.2895 320.046 83.9158 321.441 75.3132 318.556C67.7413 316.017 61.1315 311.215 56.3769 304.798C50.9751 297.508 49.0958 287.211 45.3371 266.617L37.5143 223.756C36.9505 220.667 36.6686 219.123 36.2654 217.611C35.9071 216.268 35.4772 214.945 34.9776 213.648C34.4154 212.188 33.7357 210.773 32.3761 207.943L13.5119 168.669C4.44798 149.799 -0.0839579 140.364 0.00114587 131.291C0.0760522 123.306 2.60079 115.535 7.23415 109.03C12.4983 101.64 21.7104 96.671 40.1348 86.7324L78.4806 66.0478C81.2442 64.557 82.626 63.8116 83.9388 62.9611C85.1055 62.2053 86.2309 61.3876 87.3102 60.5116C88.5249 59.5258 89.6608 58.442 91.9325 56.2743L123.454 26.1973Z"
      fill="url(#starFill)"
    />
    <Path
      d="M154.978 2.27441C162.499 -0.091216 170.564 -0.0912165 178.084 2.27441C182.327 3.60911 186.327 6.05353 191.172 9.9873C196.021 13.9249 201.684 19.3275 209.263 26.5586L240.784 56.6357C243.05 58.7982 244.204 59.8981 245.437 60.8994C246.531 61.7866 247.67 62.6154 248.851 63.3809C250.185 64.2448 251.588 65.0011 254.345 66.4883L292.69 87.1729C301.909 92.1458 308.798 95.8619 314.041 99.2568C319.279 102.648 322.84 105.698 325.421 109.32C329.995 115.742 332.487 123.412 332.561 131.296C332.603 135.744 331.515 140.304 329.27 146.127C327.024 151.956 323.635 159.011 319.099 168.453L300.235 207.727C298.879 210.55 298.189 211.986 297.618 213.469C297.112 214.782 296.676 216.122 296.313 217.482C295.904 219.018 295.619 220.585 295.057 223.667L287.233 266.527C285.352 276.832 283.947 284.532 282.339 290.568C280.732 296.598 278.932 300.927 276.284 304.501C271.59 310.835 265.064 315.576 257.59 318.082C253.373 319.496 248.7 319.87 242.469 319.535C236.231 319.2 228.473 318.157 218.092 316.762L174.912 310.957C171.807 310.54 170.228 310.327 168.641 310.242C167.236 310.167 165.827 310.167 164.421 310.242C162.834 310.327 161.255 310.54 158.15 310.957L114.971 316.762C104.589 318.157 96.8312 319.2 90.5936 319.535C84.3624 319.87 79.6894 319.496 75.4725 318.082C67.9978 315.576 61.4718 310.835 56.7782 304.501C54.1302 300.927 52.3305 296.598 50.7235 290.568C49.115 284.532 47.7098 276.832 45.829 266.527L38.0057 223.667C37.4433 220.585 37.1585 219.018 36.7489 217.482C36.386 216.122 35.9502 214.782 35.4442 213.469C34.8732 211.986 34.1832 210.55 32.827 207.727L13.9628 168.453C9.42738 159.011 6.03833 151.956 3.79187 146.127C1.54758 140.304 0.459136 135.744 0.500854 131.296C0.574831 123.412 3.06755 115.742 7.64148 109.32C10.222 105.698 13.7831 102.648 19.0214 99.2568C24.2647 95.8619 31.1529 92.1458 40.3719 87.1729L78.7177 66.4883C81.4746 65.0011 82.8773 64.2448 84.2108 63.3809C85.3924 62.6154 86.5317 61.7866 87.6249 60.8994C88.8586 59.8981 90.011 58.7981 92.2772 56.6357L123.8 26.5586C131.378 19.3275 137.041 13.9249 141.891 9.9873C146.735 6.05353 150.736 3.60911 154.978 2.27441Z"
      stroke="url(#starStroke)"
      strokeOpacity={0.4}
    />
    <Defs>
      <SvgLinearGradient id="starFill" x1="398.174" y1="-283.477" x2="-135.512" y2="620.723" gradientUnits="userSpaceOnUse">
        <Stop offset="0.144231" stopColor={isLight ? '#F0F3F7' : '#353A40'} />
        <Stop offset="0.543269" stopColor={isLight ? '#D5DCE5' : '#121416'} />
      </SvgLinearGradient>
      <SvgLinearGradient id="starStroke" x1="320.397" y1="-32.221" x2="-111.056" y2="169.115" gradientUnits="userSpaceOnUse">
        <Stop offset="0.0709612" stopColor={isLight ? '#AAB5C2' : '#505962'} />
        <Stop offset="0.507086" stopOpacity={0} />
        <Stop offset="1" stopColor={isLight ? '#F7FAFD' : '#DCDCDC'} />
      </SvgLinearGradient>
    </Defs>
  </Svg>
);

const FitDimensionIcon = ({ dimension, active, isLight }: { dimension: RecoveryDimension; active: boolean; isLight: boolean }) => {
  const inactivePrimary = isLight ? '#7A8694' : '#6D737A';
  const inactiveSecondary = isLight ? '#AAB4BF' : '#97A2AB';
  const inactiveSoft = isLight ? '#C1CAD4' : '#D6E1EF';

  if (dimension === 'activity') {
    return (
      <Svg width={36} height={36} viewBox="0 0 32 32">
        <Path
          d="M21.4785 22.0371C21.5578 22.0335 21.638 22.0392 21.7158 22.0557C23.9646 22.4382 27.68 23.3899 27.958 25.5176L28 25.5781V25.8779C27.9753 26.4399 27.6964 26.9424 27.2217 27.3906C27.1992 27.4127 27.1768 27.4352 27.1533 27.457C27.1398 27.4691 27.1261 27.4811 27.1123 27.4932C25.3342 29.1011 21.0617 29.9316 16.6699 29.9961L16.667 29.9902C16.41 29.9954 16.1527 30 15.8955 30C9.95569 30 4.008 28.6052 4 25.8018C4 23.4794 7.92459 22.4816 10.2617 22.084C10.3813 22.0588 10.5057 22.0569 10.626 22.0791C10.7462 22.1012 10.8598 22.1472 10.96 22.2129C11.0602 22.2786 11.1451 22.363 11.208 22.4609C11.2709 22.5589 11.3114 22.668 11.3262 22.7812C11.3532 22.8934 11.3547 23.0102 11.3311 23.123C11.3074 23.2356 11.2587 23.3423 11.1885 23.4365C11.1181 23.5309 11.0271 23.6108 10.9219 23.6709C10.8167 23.7309 10.6994 23.7705 10.5771 23.7861C6.96721 24.3649 5.7982 25.4733 5.79785 25.8779C5.79785 26.7846 9.40812 28.3886 15.9922 28.3887C15.9934 28.3887 15.9949 28.3877 15.9961 28.3877L15.9854 28.3613C18.704 28.3613 20.914 28.0861 22.5723 27.7012C24.0562 27.3463 25.0992 26.907 25.6758 26.5098C26.0041 26.2727 26.1717 26.0459 26.1719 25.8506C26.1719 25.6729 25.9209 25.3408 25.2939 24.9746C24.7396 24.6883 24.1614 24.4476 23.5654 24.2539C23.0385 24.0927 22.4183 23.9416 21.6934 23.8105C21.5687 23.7916 21.4438 23.7728 21.3184 23.7578C21.1962 23.7423 21.0788 23.7035 20.9736 23.6436C20.8685 23.5835 20.7774 23.5035 20.707 23.4092C20.6366 23.3148 20.5881 23.2075 20.5645 23.0947C20.5467 23.01 20.5428 22.9233 20.5537 22.8379L20.585 22.6699C20.6054 22.5866 20.6402 22.5062 20.6875 22.4326C20.7504 22.3348 20.8345 22.2502 20.9346 22.1846C21.0348 22.1188 21.1493 22.0739 21.2695 22.0518C21.3385 22.0391 21.4086 22.0342 21.4785 22.0371ZM17.1836 8.33789C17.7519 8.3434 18.3128 8.46051 18.8291 8.68164C19.3453 8.90278 19.8055 9.22299 20.1797 9.62109L20.165 9.60645L23.8652 13.5127C23.9622 13.6063 24.0166 13.7313 24.0166 13.8613C24.0166 13.9914 23.9622 14.1164 23.8652 14.21L22.6064 15.4092C22.5571 15.4566 22.4981 15.4943 22.4326 15.5195C22.3669 15.5447 22.2957 15.557 22.2246 15.5557C22.1533 15.553 22.0829 15.5366 22.0186 15.5078C21.9544 15.4791 21.8973 15.4386 21.8506 15.3887L19.1914 12.4873V25.2646C19.1924 25.3281 19.1796 25.3913 19.1543 25.4502C19.1288 25.5094 19.0901 25.5639 19.042 25.6094C18.9941 25.6546 18.9369 25.6903 18.874 25.7148C18.8108 25.7395 18.7423 25.7529 18.6738 25.7529H16.8984C16.8301 25.7529 16.7623 25.7394 16.6992 25.7148C16.6361 25.6902 16.5783 25.6547 16.5303 25.6094C16.4822 25.564 16.4445 25.5093 16.4189 25.4502C16.3936 25.3912 16.3809 25.3282 16.3818 25.2646V17.8223H15.6328V25.2646C15.6338 25.3282 15.6211 25.3912 15.5957 25.4502C15.5702 25.5094 15.5325 25.5639 15.4844 25.6094C15.4363 25.6548 15.3786 25.6902 15.3154 25.7148C15.2523 25.7394 15.1847 25.7529 15.1162 25.7529H13.333C13.2646 25.7529 13.1969 25.7394 13.1338 25.7148C13.0707 25.6902 13.0129 25.6548 12.9648 25.6094C12.9168 25.564 12.879 25.5094 12.8535 25.4502C12.8282 25.3912 12.8155 25.3282 12.8164 25.2646V12.4873L10.1572 15.3887C10.1124 15.4392 10.0564 15.4799 9.99316 15.5088C9.92986 15.5377 9.8605 15.5537 9.79004 15.5557C9.71773 15.5584 9.64523 15.5467 9.57812 15.5215C9.51115 15.4962 9.45028 15.4579 9.40039 15.4092L8.12695 14.2236C8.03011 14.1301 7.97656 14.005 7.97656 13.875C7.9766 13.745 8.03007 13.6199 8.12695 13.5264L11.8574 9.62109C12.2317 9.22289 12.6927 8.90278 13.209 8.68164C13.7251 8.46059 14.2854 8.34345 14.8535 8.33789H17.1836ZM15.9883 2C16.3813 2 16.7707 2.07446 17.1318 2.21875C17.4931 2.3631 17.819 2.57455 18.0898 2.83984C18.3606 3.10505 18.5706 3.41862 18.707 3.76172C18.8435 4.10485 18.9037 4.47052 18.8838 4.83594C18.8917 5.19608 18.8228 5.55426 18.6816 5.88965C18.5405 6.22503 18.3302 6.53179 18.0615 6.79102C17.7928 7.05027 17.4712 7.25706 17.1162 7.40039C16.7612 7.54372 16.3791 7.62054 15.9922 7.62598C15.6051 7.62049 15.2225 7.5436 14.8672 7.40039C14.512 7.25715 14.1901 7.05006 13.9209 6.79102C13.6518 6.53193 13.4398 6.22596 13.2979 5.89062C13.1558 5.55517 13.0868 5.19645 13.0938 4.83594C13.0738 4.47052 13.1341 4.10485 13.2705 3.76172C13.407 3.41862 13.617 3.10505 13.8877 2.83984C14.1585 2.57455 14.4845 2.3631 14.8457 2.21875C15.2067 2.07452 15.5954 2.00006 15.9883 2Z"
          fill={active ? '#F9700E' : inactivePrimary}
        />
        <Path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M21.4785 22.001C21.5578 21.9973 21.638 22.0041 21.7158 22.0205C23.9645 22.4031 27.6799 23.3539 27.958 25.4814L28 25.542V25.8418C27.9753 26.4037 27.6963 26.9062 27.2217 27.3545C27.1992 27.3766 27.1768 27.3991 27.1533 27.4209C27.1398 27.433 27.1261 27.445 27.1123 27.457C25.3343 29.065 21.0618 29.8954 16.6699 29.9599L16.667 29.9541C16.41 29.9593 16.1527 29.9638 15.8955 29.9639C9.95556 29.9639 4.00775 28.5692 4 25.7656C4 23.4433 7.92459 22.4454 10.2617 22.0478C10.3813 22.0226 10.5057 22.0208 10.626 22.043C10.7461 22.0651 10.8598 22.1111 10.96 22.1767C11.0602 22.2424 11.1451 22.3269 11.208 22.4248C11.2709 22.5227 11.3114 22.6319 11.3262 22.7451C11.3532 22.8573 11.3547 22.9741 11.3311 23.0869C11.3074 23.1996 11.2589 23.307 11.1885 23.4014C11.1181 23.4956 11.027 23.5747 10.9219 23.6348C10.8167 23.6948 10.6994 23.7344 10.5771 23.75C6.96774 24.3287 5.79855 25.437 5.79785 25.8418C5.79785 26.7484 9.40812 28.3525 15.9922 28.3525C15.9934 28.3525 15.9949 28.3515 15.9961 28.3515L15.9854 28.3252C18.6602 28.3252 20.8431 28.0607 22.4922 27.6855C24.019 27.3275 25.0889 26.878 25.6758 26.4736C26.0041 26.2365 26.1718 26.0098 26.1719 25.8144C26.1719 25.6355 25.9169 25.3008 25.2803 24.9316C24.7301 24.6484 24.1565 24.4099 23.5654 24.2178C23.0385 24.0565 22.4183 23.9054 21.6934 23.7744C21.5687 23.7555 21.4438 23.7367 21.3184 23.7217C21.1962 23.7061 21.0788 23.6673 20.9736 23.6074C20.8684 23.5474 20.7774 23.4674 20.707 23.373C20.6366 23.2786 20.5881 23.1714 20.5645 23.0586C20.5408 22.9458 20.5423 22.8298 20.5693 22.7178C20.5841 22.6045 20.6246 22.4954 20.6875 22.3974C20.7504 22.2995 20.8343 22.2142 20.9346 22.1484C21.0348 22.0827 21.1493 22.0378 21.2695 22.0156C21.3385 22.0029 21.4086 21.998 21.4785 22.001Z"
          fill={inactiveSoft}
          fillOpacity={0.8}
        />
      </Svg>
    );
  }

  if (dimension === 'calm') {
    return (
      <Svg width={28} height={25} viewBox="0 0 28 25">
        <Path
          d="M25.4021 1.96985C22.2973 -1.05187 17.4639 -0.272442 14.0012 2.124C10.5386 -0.272209 5.705 -1.05257 2.60022 1.96985C1.77616 2.76971 1.1222 3.72069 0.675965 4.7681C0.229724 5.81551 0 6.9387 0 8.07307C0 9.20744 0.229724 10.3306 0.675965 11.378C1.1222 12.4255 1.77616 13.3764 2.60022 14.1763L3.74881 15.2942L14.0012 25L24.0585 15.4841L25.4021 14.1761C26.2255 13.3759 26.8789 12.4248 27.3247 11.3774C27.7705 10.3301 28 9.20711 28 8.07295C28 6.9388 27.7705 5.81582 27.3247 4.76847C26.8789 3.72113 26.2255 2.77005 25.4021 1.96985Z"
          fill={active ? '#FF1A1A' : inactivePrimary}
        />
        <Path
          d="M11.3311 12.667L11.4121 12.6621C11.5985 12.6393 11.7678 12.5377 11.877 12.3818L14.1309 9.16211L16.3848 12.3818C16.5094 12.5599 16.7133 12.6669 16.9307 12.667C17.1482 12.667 17.3528 12.5601 17.4775 12.3818L19.6777 9.23828H21.998C22.3661 9.23811 22.6641 8.93937 22.6641 8.57129C22.664 8.20327 22.366 7.90447 21.998 7.9043H19.3311C19.1135 7.9043 18.9099 8.01123 18.7852 8.18945L16.9307 10.8379L14.6768 7.61816C14.552 7.43995 14.3484 7.33301 14.1309 7.33301C13.9134 7.33307 13.7097 7.44 13.585 7.61816L10.9844 11.333H7.33105C6.96286 11.333 6.66406 11.6318 6.66406 12C6.66406 12.3682 6.96286 12.667 7.33105 12.667H11.3311Z"
          fill={active ? '#E7EEF5' : inactiveSecondary}
        />
      </Svg>
    );
  }

  if (dimension === 'nutrition') {
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32">
        <Path d="M24.4059 12.1318C25.7867 20.7075 22.5409 24.3697 18.9385 25.8862C18.1569 25.8566 17.5663 25.6046 17.1852 25.1342C17.0971 25.0259 17.0231 24.9092 16.9596 24.7882C19.6771 23.478 22.4976 21.4627 22.5486 18.7293C22.6258 14.6611 21.1109 20.495 16.7371 24.192C16.5262 23.3507 16.674 22.5028 16.6758 22.4916L16.6848 22.4443L16.6824 22.3967C16.3634 19.1612 16.9935 19.1612 14 16.4038C14 16.4038 15.4969 14.8282 18.963 14.8282C22.4298 14.8279 23.1516 13.4539 24.4059 12.1318Z" fill={active ? '#60AF00' : inactivePrimary} />
        <Path d="M7.80748 20.5614C6.50535 15.126 10.9774 24.5623 18.6384 26.6896L18.6875 26.2914C15.2895 26.1915 15.9893 22.3934 15.9893 22.3934C15.6893 15.3967 7.99324 14.7965 7.99324 14.7965C3.69511 14.1969 2.03361 12.0977 2.03361 12.0977C1.1341 31.6891 18.588 27.091 18.588 27.091L18.6244 26.8016C14.8714 26.2534 8.80532 24.7288 7.80748 20.5614Z" fill={active ? '#60AF00' : inactivePrimary} />
        <Path d="M28.7465 4.00025C26.2107 4.87674 23.7446 7.74765 22.1372 9.97543V9.97605C20.0949 9.5585 16.8923 9.28905 13.2896 9.28905C7.12147 9.28905 2.12109 10.0775 2.12109 11.0498C2.12109 11.454 2.98576 11.8258 4.43631 12.1229C5.06357 11.5928 8.81346 11.1855 13.3477 11.1855C16.3341 11.1855 18.9782 11.3622 20.616 11.6344L19.8176 12.0143C18.2682 11.8 15.994 11.6643 13.4588 11.6643C9.59256 11.6643 6.33459 11.9798 5.32431 12.4101C7.69677 12.8921 14.1399 13.8853 21.2722 12.3053C21.8485 12.235 22.281 12.1248 22.5806 12.0262C22.6182 12.0172 22.6578 12.0084 22.6942 11.9997C22.7324 11.9904 22.7713 11.9807 22.8083 11.9714C22.8535 11.9599 22.8952 11.9484 22.9384 11.9369C22.9773 11.9263 23.0168 11.9157 23.0545 11.9048C23.0952 11.8933 23.1341 11.8818 23.173 11.8703C23.2119 11.8588 23.2495 11.8473 23.2859 11.8354C23.3217 11.8242 23.3572 11.8134 23.3911 11.8018C23.4325 11.7878 23.472 11.7741 23.5109 11.7601C23.5377 11.7508 23.5657 11.7409 23.5918 11.7315C23.6512 11.7088 23.7072 11.6864 23.7607 11.6637C23.7838 11.6537 23.8059 11.6438 23.8276 11.6341C23.8603 11.6192 23.8933 11.6043 23.9244 11.5887C23.9456 11.5781 23.9664 11.5675 23.9863 11.557C24.0156 11.5414 24.0442 11.5259 24.0703 11.51C24.0875 11.5003 24.1049 11.4904 24.1207 11.4804C24.1534 11.4599 24.1839 11.439 24.2119 11.4182C24.2191 11.4129 24.2265 11.4086 24.2324 11.4033C24.2657 11.3778 24.2944 11.3516 24.3205 11.3258C24.3289 11.3174 24.3364 11.3087 24.3441 11.3C24.3606 11.2816 24.3759 11.2629 24.3886 11.2446C24.3952 11.2352 24.4014 11.2253 24.407 11.2156C24.4185 11.1967 24.4269 11.178 24.4344 11.159C24.4381 11.1503 24.4422 11.1419 24.4446 11.1329C24.4524 11.1058 24.458 11.0778 24.458 11.0501C24.458 11.023 24.4524 10.9957 24.4446 10.9686C24.4422 10.9602 24.439 10.9521 24.4356 10.9443C24.4285 10.9247 24.4191 10.9054 24.4076 10.8858C24.4026 10.8771 24.398 10.8687 24.3924 10.8603C24.3759 10.8367 24.3572 10.8127 24.3345 10.7891C24.332 10.7863 24.3301 10.7835 24.328 10.781C24.3031 10.7552 24.2732 10.7296 24.2412 10.7044C24.2303 10.6957 24.2188 10.6876 24.2066 10.6789C24.183 10.6612 24.1568 10.6438 24.1295 10.626C24.1155 10.6173 24.1021 10.6086 24.0868 10.5999C24.0529 10.5797 24.0162 10.5594 23.9779 10.5392C23.9683 10.5342 23.9602 10.5296 23.9505 10.5246C23.9505 10.5246 23.9499 10.5243 23.9493 10.5243C25.5999 9.05632 27.6065 7.47945 27.6065 7.47945C32.2154 3.90411 28.7465 4.00025 28.7465 4.00025Z" fill={active ? '#CCFF80' : inactiveSecondary} />
      </Svg>
    );
  }

  if (dimension === 'rhythm') {
    return <Ionicons name="flower-outline" size={32} color={active ? '#F7A7F0' : (isLight ? '#8694A3' : '#9AA6B1')} />;
  }

  if (dimension === 'sleep') {
    return (
      <Svg width={32} height={32} viewBox="0 0 32 32">
        <Path d="M20.8187 12.0624L24.1768 10.3439L27.5349 12.0624L26.8939 8.42337L29.6109 5.84422L25.8574 5.3143L24.1736 2L22.4961 5.31124L18.7426 5.84116L21.4597 8.4203L20.8187 12.0624ZM23.2647 21.6867C16.2615 21.6867 10.585 16.2006 10.585 9.43726C10.585 7.04496 11.3057 4.82114 12.5303 2.93732C6.46788 4.51789 2 9.85997 2 16.2221C2 23.8309 8.38132 30 16.2519 30C22.8405 30 28.3672 25.6718 30 19.7998C28.0483 20.9883 25.7426 21.6867 23.2647 21.6867Z" fill={active ? '#237AFC' : inactivePrimary} />
        <Path d="M20.8183 12.0624L24.1764 10.3439L27.5344 12.0624L26.8934 8.42337L29.6105 5.84422L25.857 5.3143L24.1732 2L22.4957 5.31124L18.7422 5.84116L21.4593 8.4203L20.8183 12.0624Z" fill={active ? '#8BB4E8' : inactiveSoft} fillOpacity={0.8} />
      </Svg>
    );
  }

  return (
    <Svg width={32} height={32} viewBox="0 0 32 32">
      <Path d="M21.4785 22.0371C21.5578 22.0335 21.638 22.0392 21.7158 22.0557C23.9646 22.4382 27.68 23.3899 27.958 25.5176L28 25.5781V25.8779C27.9753 26.4399 27.6964 26.9424 27.2217 27.3906C27.1992 27.4127 27.1768 27.4352 27.1533 27.457C27.1398 27.4691 27.1261 27.4811 27.1123 27.4932C25.3342 29.1011 21.0617 29.9316 16.6699 29.9961L16.667 29.9902C16.41 29.9954 16.1527 30 15.8955 30C9.95569 30 4.008 28.6052 4 25.8018C4 23.4794 7.92459 22.4816 10.2617 22.084C10.3813 22.0588 10.5057 22.0569 10.626 22.0791C10.7462 22.1012 10.8598 22.1472 10.96 22.2129C11.0602 22.2786 11.1451 22.363 11.208 22.4609C11.2709 22.5589 11.3114 22.668 11.3262 22.7812C11.3532 22.8934 11.3547 23.0102 11.3311 23.123C11.3074 23.2356 11.2587 23.3423 11.1885 23.4365C11.1181 23.5309 11.0271 23.6108 10.9219 23.6709C10.8167 23.7309 10.6994 23.7705 10.5771 23.7861C6.96721 24.3649 5.7982 25.4733 5.79785 25.8779C5.79785 26.7846 9.40812 28.3886 15.9922 28.3887C15.9934 28.3887 15.9949 28.3877 15.9961 28.3877L15.9854 28.3613C18.704 28.3613 20.914 28.0861 22.5723 27.7012C24.0562 27.3463 25.0992 26.907 25.6758 26.5098C26.0041 26.2727 26.1717 26.0459 26.1719 25.8506C26.1719 25.6729 25.9209 25.3408 25.2939 24.9746C24.7396 24.6883 24.1614 24.4476 23.5654 24.2539C23.0385 24.0927 22.4183 23.9416 21.6934 23.8105C21.5687 23.7916 21.4438 23.7728 21.3184 23.7578C21.1962 23.7423 21.0788 23.7035 20.9736 23.6436C20.8685 23.5835 20.7774 23.5035 20.707 23.4092C20.6366 23.3148 20.5881 23.2075 20.5645 23.0947C20.5467 23.01 20.5428 22.9233 20.5537 22.8379L20.585 22.6699C20.6054 22.5866 20.6402 22.5062 20.6875 22.4326C20.7504 22.3348 20.8345 22.2502 20.9346 22.1846C21.0348 22.1188 21.1493 22.0739 21.2695 22.0518C21.3385 22.0391 21.4086 22.0342 21.4785 22.0371Z" fill={active ? '#F9700E' : inactiveSecondary} />
      <Path d="M21.4785 22.001C21.5578 21.9973 21.638 22.0041 21.7158 22.0205C23.9645 22.4031 27.6799 23.3539 27.958 25.4814L28 25.542V25.8418C27.9753 26.4037 27.6963 26.9062 27.2217 27.3545C27.1992 27.3766 27.1768 27.3991 27.1533 27.4209C27.1398 27.433 27.1261 27.445 27.1123 27.457C25.3343 29.065 21.0618 29.8954 16.6699 29.9599L16.667 29.9541C16.41 29.9593 16.1527 29.9638 15.8955 29.9639C9.95556 29.9639 4.00775 28.5692 4 25.7656C4 23.4433 7.92459 22.4454 10.2617 22.0478C10.3813 22.0226 10.5057 22.0208 10.626 22.043C10.7461 22.0651 10.8598 22.1111 10.96 22.1767C11.0602 22.2424 11.1451 22.3269 11.208 22.4248C11.2709 22.5227 11.3114 22.6319 11.3262 22.7451C11.3532 22.8573 11.3547 22.9741 11.3311 23.0869C11.3074 23.1996 11.2589 23.307 11.1885 23.4014C11.1181 23.4956 11.027 23.5747 10.9219 23.6348C10.8167 23.6948 10.6994 23.7344 10.5771 23.75C6.96774 24.3287 5.79855 25.437 5.79785 25.8418C5.79785 26.7484 9.40812 28.3525 15.9922 28.3525C15.9934 28.3525 15.9949 28.3515 15.9961 28.3515L15.9854 28.3252C18.6602 28.3252 20.8431 28.0607 22.4922 27.6855C24.019 27.3275 25.0889 26.878 25.6758 26.4736C26.0041 26.2365 26.1718 26.0098 26.1719 25.8144C26.1719 25.6355 25.9169 25.3008 25.2803 24.9316C24.7301 24.6484 24.1565 24.4099 23.5654 24.2178C23.0385 24.0565 22.4183 23.9054 21.6934 23.7744C21.5687 23.7555 21.4438 23.7367 21.3184 23.7217C21.1962 23.7061 21.0788 23.6673 20.9736 23.6074C20.8684 23.5474 20.7774 23.4674 20.707 23.373C20.6366 23.2786 20.5881 23.1714 20.5645 23.0586C20.5408 22.9458 20.5423 22.8298 20.5693 22.7178C20.5841 22.6045 20.6246 22.4954 20.6875 22.3974C20.7504 22.2995 20.8343 22.2142 20.9346 22.1484C21.0348 22.0827 21.1493 22.0378 21.2695 22.0156C21.3385 22.0029 21.4086 21.998 21.4785 22.001Z" fill={active ? '#D6E1EF' : '#E7EEF5'} fillOpacity={0.8} />
    </Svg>
  );
};

const buildLinePath = (values: number[], width: number, height: number) => {
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return { x, y };
  });
  return points.reduce((acc, point, index) => `${acc}${index === 0 ? 'M' : ' L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`, '');
};

export const HomeScreen = () => {
  const navigation = useNavigation<Nav>();
  const [medicationOpen, setMedicationOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [activeDimension, setActiveDimension] = useState<RecoveryDimension>('calm');
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [devDiagnostics, setDevDiagnostics] = useState<HealthConnectRuntimeDiagnostics | null>(null);
  const [devLoading, setDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const [sessionAntiManipulation, setSessionAntiManipulation] = useState({
    todaySessionCount: 0,
    recentCooldownPenalty: 1,
    sessionInfluenceMultiplier: 1
  });
  const heroPulse = useRef(new Animated.Value(0)).current;
  const {
    onboarding,
    wellness,
    wearableSyncData,
    checkIns,
    devices,
    selectedDeviceId,
    medications,
    getMedicationTimelineForDate,
    markMedicationAction,
    pauseMedication,
    deleteMedication,
    cyclePrediction,
    getCycleDaySnapshot,
    familyConnections,
    getFamilySummary,
    themeMode
  } = useAppContext();
  const isLight = themeMode === 'light';
  const ui = useMemo(() => ({
    textPrimary: isLight ? '#0F172A' : '#F4F4F4',
    textSecondary: isLight ? '#334155' : '#9A9A9A',
    cardBg: isLight ? '#FFFFFF' : '#131313',
    cardBorder: isLight ? '#CBD5E1' : '#2A2A2A',
    focusBg: isLight ? '#F8FAFC' : '#0F151D',
    focusBorder: isLight ? '#C7D2DF' : '#1D232A',
    trendBg1: isLight ? '#FFFFFF' : '#1B1B1B',
    trendBg2: isLight ? '#F4F7FB' : '#111111'
  }), [isLight]);

  const connectedDevice = devices.find((d) => d.id === selectedDeviceId) ?? null;

  const todayTimeline = useMemo(() => getMedicationTimelineForDate(new Date().toISOString()), [getMedicationTimelineForDate, medications]);
  const todayISO = new Date().toISOString();
  const cycleSnapshot = getCycleDaySnapshot(todayISO);
  const medicationPending = todayTimeline.filter((item) => item.status === 'upcoming' || item.status === 'missed' || item.status === 'snoozed').length;
  const cycleLabel = cycleSnapshot.phase === 'ovulation_window'
    ? 'Ovulation Window'
    : cycleSnapshot.phase === 'follicular'
      ? 'Follicular Phase'
      : cycleSnapshot.phase === 'luteal'
        ? 'Luteal Phase'
        : 'Menstrual Phase';
  const familyConnected = familyConnections.filter((member) => member.status === 'connected');
  const familyPending = familyConnected.filter((member) => {
    const summary = getFamilySummary(member.id);
    return summary?.medicationAdherence === 'needs_attention' || summary?.checkInStatus === 'pending';
  }).length;
  const aiInsight = medicationPending > 0
    ? 'Complete pending medication reminders to protect energy consistency.'
    : cycleSnapshot.phase === 'ovulation_window'
      ? 'Hydration and gentle movement can support this cycle window.'
      : 'Protect energy dips with protein-first meals.';

  const recoveryIntel = useMemo(() => {
    const scheduledToday = todayTimeline.length;
    const takenToday = todayTimeline.filter((item) => item.status === 'taken').length;
    const skippedToday = todayTimeline.filter((item) => item.status === 'skipped').length;
    const missedToday = todayTimeline.filter((item) => item.status === 'missed').length;
    const pendingToday = todayTimeline.filter((item) => item.status === 'upcoming' || item.status === 'snoozed').length;

    return buildRecoveryIntelligence({
      wellness,
      checkIns,
      medication: { scheduledToday, takenToday, pendingToday, skippedToday, missedToday },
      hasWearable: Boolean(connectedDevice),
      wearableSyncData,
      sessionAntiManipulation
    });
  }, [todayTimeline, wellness, checkIns, connectedDevice, wearableSyncData, sessionAntiManipulation]);

  const dimensionData = useMemo(() => {
    const driverMap = Object.fromEntries(recoveryIntel.recoveryDrivers.map((driver) => [driver.key, driver]));
    const recoveryBase = recoveryIntel.recoveryScore ?? 0;
    const calmScore = Math.round(
      ((driverMap.stress_recovery?.score ?? recoveryBase) * 0.6) +
      ((driverMap.emotional_checkins?.score ?? recoveryBase) * 0.4)
    );

    const byKey: Record<RecoveryDimension, { score: number; reason: string; trend: number[] }> = {
      calm: {
        score: Math.max(0, Math.min(100, calmScore)),
        reason: driverMap.stress_recovery?.reason ?? 'Calm data is available from stress and emotional check-ins.',
        trend: recoveryIntel.trendValues7d.length ? recoveryIntel.trendValues7d.map((v, idx) => Math.max(0, Math.min(100, Math.round(v - 6 + idx * 0.5)))) : [0, 0, 0, 0, 0, 0, 0]
      },
      activity: {
        score: driverMap.activity?.score ?? recoveryBase,
        reason: driverMap.activity?.reason ?? 'Activity data sync is in progress.',
        trend: recoveryIntel.trendValues7d.length ? recoveryIntel.trendValues7d.map((v, idx) => Math.max(0, Math.min(100, Math.round(v - 8 + idx)))) : [0, 0, 0, 0, 0, 0, 0]
      },
      nutrition: {
        score: driverMap.emotional_checkins?.score ?? recoveryBase,
        reason: driverMap.emotional_checkins?.reason ?? 'Nutrition data is calibration-aware and updates with real signals.',
        trend: recoveryIntel.trendValues7d.length ? recoveryIntel.trendValues7d.map((v, idx) => Math.max(0, Math.min(100, Math.round(v - 4 + idx * 0.6)))) : [0, 0, 0, 0, 0, 0, 0]
      },
      rhythm: {
        score: driverMap.wellness_sessions?.score ?? recoveryBase,
        reason: driverMap.wellness_sessions?.reason ?? 'Rhythm data tracks routine consistency signals.',
        trend: recoveryIntel.trendValues7d.length ? recoveryIntel.trendValues7d.map((v, idx) => Math.max(0, Math.min(100, Math.round(v - 5 + idx * 0.4)))) : [0, 0, 0, 0, 0, 0, 0]
      },
      sleep: {
        score: driverMap.sleep?.score ?? recoveryBase,
        reason: driverMap.sleep?.reason ?? 'Sleep data sync is in progress.',
        trend: recoveryIntel.trendValues7d.length ? recoveryIntel.trendValues7d.map((v, idx) => Math.max(0, Math.min(100, Math.round(v - 2 + idx * 0.3)))) : [0, 0, 0, 0, 0, 0, 0]
      }
    };
    return byKey;
  }, [recoveryIntel]);

  const activeVisual = DIMENSION_VISUALS.find((item) => item.key === activeDimension) ?? DIMENSION_VISUALS[0];
  const activeDimensionStats = dimensionData[activeDimension];

  const attentionItems = [
    ...recoveryIntel.blockers,
    familyConnected.length > 0 && familyPending > 0 ? `${familyPending} family check-in${familyPending > 1 ? 's' : ''} needs reassurance` : null
  ].filter(Boolean) as string[];

  const highestImpactActions = [
    ...recoveryIntel.highestImpactActions,
    familyConnected.length > 0 && familyPending > 0
      ? 'Send one calm family wellness check-in update.'
      : cycleSnapshot.phase === 'ovulation_window'
        ? 'Prioritize hydration and light movement in this cycle window.'
        : 'Review one report trend and align tomorrow’s routine.'
  ].slice(0, 3);

  const todayFocus = highestImpactActions[0] ?? 'Take one small wellness action today to support consistency.';
  const heroState = recoveryIntel.isCalibrating ? 'Calibrating' : getGlobalRecoveryMicroState(activeDimensionStats.score);
  const celebrationLine =
    recoveryIntel.recoveryDirection === 'improving'
      ? 'Consistency improved over recent days. Keep this rhythm.'
      : medicationPending === 0
        ? 'Medication consistency is stable today.'
        : 'You are still building momentum. Small consistency wins count.';

  useEffect(() => {
    setActiveDimension('calm');
  }, []);

  const openDevPanel = async () => {
    setDevPanelOpen(true);
    setDevLoading(true);
    setDevError(null);
    try {
      const diagnostics = await getHealthConnectRuntimeDiagnostics();
      setDevDiagnostics(diagnostics);
    } catch (error) {
      setDevError(error instanceof Error ? error.message : 'dev_runtime_diagnostics_failed');
      setDevDiagnostics(null);
    } finally {
      setDevLoading(false);
    }
  };

  useEffect(() => {
    const hydrateSessionAntiManipulation = async () => {
      try {
        const raw = await AsyncStorage.getItem('fiteatsy.sessionSignals.v1');
        const parsed = raw ? (JSON.parse(raw) as Array<{ timestamp?: string }>) : [];
        const now = Date.now();
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const dayStartMs = startOfDay.getTime();
        const todaySessions = parsed.filter((item) => {
          if (!item?.timestamp) return false;
          const t = +new Date(item.timestamp);
          return Number.isFinite(t) && t >= dayStartMs;
        });
        const todaySessionCount = todaySessions.length;
        const sessionInfluenceMultiplier = todaySessionCount <= 1 ? 1 : todaySessionCount === 2 ? 0.6 : todaySessionCount === 3 ? 0.3 : 0.15;
        const lastTimestamp = todaySessions[0]?.timestamp;
        const lastMs = lastTimestamp ? +new Date(lastTimestamp) : NaN;
        const minutesSinceLast = Number.isFinite(lastMs) ? Math.max(0, (now - lastMs) / 60000) : Number.POSITIVE_INFINITY;
        const recentCooldownPenalty = minutesSinceLast < 15 ? 0.5 : minutesSinceLast < 30 ? 0.75 : 1;

        setSessionAntiManipulation({
          todaySessionCount,
          sessionInfluenceMultiplier,
          recentCooldownPenalty
        });
      } catch {
        setSessionAntiManipulation({
          todaySessionCount: 0,
          sessionInfluenceMultiplier: 1,
          recentCooldownPenalty: 1
        });
      }
    };

    hydrateSessionAntiManipulation();
  }, [wellness.breathingMinutes, wellness.focusMinutes, wellness.moodScore]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroPulse, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(heroPulse, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [heroPulse]);

  const supportiveAttention = attentionItems.map((item) =>
    item
      .replace('is reducing recovery', 'may benefit from one small step today')
      .replace('is reducing', 'may improve with a small step')
      .replace('needs reassurance', 'can use a supportive check-in')
  );

  const assistanceActions = useMemo(() => {
    const suggestions: string[] = [];
    recoveryIntel.highestImpactActions.forEach((item) => {
      if (!suggestions.includes(item)) suggestions.push(item);
    });
    supportiveAttention.slice(0, 2).forEach((item) => {
      if (!suggestions.includes(item)) suggestions.push(item);
    });
    if (medicationPending > 0) {
      suggestions.push(`Complete ${medicationPending} pending medication reminder${medicationPending > 1 ? 's' : ''} today.`);
    }
    if (!connectedDevice) {
      suggestions.push('Connect a health app to improve sleep and activity accuracy.');
    }
    if (suggestions.length === 0) {
      suggestions.push('Maintain hydration, movement, and stress-reset sessions to keep recovery stable.');
    }
    return suggestions.slice(0, 5);
  }, [connectedDevice, medicationPending, recoveryIntel.highestImpactActions, supportiveAttention]);

  const consultantName = onboarding?.matchedDietitianName ?? 'Dr. Aisha Menon';
  const consultantSpecialty = onboarding?.matchedDietitianSpecialty ?? 'Clinical Nutrition & Habit Recovery';

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onLongPress={openDevPanel}>
          <Text style={[styles.greeting, { color: ui.textPrimary }]}>Hi!, {onboarding?.name ?? 'Rahul'}</Text>
        </Pressable>

        <View style={styles.topRightRow}>
          <View style={styles.actionRail}>
            <Pressable style={[styles.actionBtn, isLight && { backgroundColor: '#EEF2F7', borderColor: '#CBD5E1' }]} onPress={() => navigation.navigate('Search')}>
              <Ionicons name="search-outline" size={18} color={ui.textPrimary} />
            </Pressable>
            <Pressable style={[styles.actionBtn, isLight && { backgroundColor: '#EEF2F7', borderColor: '#CBD5E1' }]} onPress={() => navigation.navigate('Main')}>
              <MaterialCommunityIcons name="hospital-box-outline" size={18} color={ui.textPrimary} />
            </Pressable>
            <Pressable style={[styles.actionBtn, isLight && { backgroundColor: '#EEF2F7', borderColor: '#CBD5E1' }]} onPress={() => navigation.navigate('Notifications')}>
              <Ionicons name="notifications-outline" size={18} color={ui.textPrimary} />
              <View style={styles.notifyBadge}><Text style={styles.notifyBadgeText}>9</Text></View>
            </Pressable>
          </View>
          <Pressable style={styles.avatar} onPress={() => navigation.navigate('Profile')} />
        </View>
      </View>

      <View style={[styles.focusCard, { backgroundColor: ui.focusBg, borderColor: ui.focusBorder }]}>
        <View style={styles.focusTextWrap}>
          <Text style={[styles.focusTitle, { color: ui.textPrimary }]}>Today&apos;s Focus</Text>
          <Text style={[styles.focusBody, { color: ui.textSecondary }]}>
            {recoveryIntel.isCalibrating ? (recoveryIntel.insufficientReason ?? 'Recovery calibration in progress.') : todayFocus}
          </Text>
        </View>
        <Pressable style={styles.focusCta} onPress={() => setAiOpen(true)}><Text style={styles.focusCtaText}>Assistance</Text></Pressable>
      </View>

      <View style={styles.heroZone}>
        <Pressable style={styles.heroSyncButton} onPress={() => navigation.navigate('SyncWearable', { autoSync: true })}>
          <Text style={styles.heroSyncText}>Sync</Text>
        </Pressable>
        <View style={styles.starLayerContainer}>
          <View style={styles.starLayerGlowWrap}>
            <View style={styles.starLayerDarkWrap}>
              <View style={styles.starLayerImage}>
                <FitStarShape key="star-refresh-v3" isLight={isLight} />
              </View>
            </View>
          </View>
        </View>
        <Pressable style={[styles.dimensionNode, styles.nodeCalm]} onPress={() => setActiveDimension('calm')}>
          <FitDimensionIcon dimension="calm" active={activeDimension === 'calm'} isLight={isLight} />
          <Text style={[styles.dimensionNodeText, { color: ui.textPrimary }]}>Calm</Text>
        </Pressable>
        <Pressable style={[styles.dimensionNode, styles.nodeActivity]} onPress={() => setActiveDimension('activity')}>
          <FitDimensionIcon dimension="activity" active={activeDimension === 'activity'} isLight={isLight} />
          <Text style={[styles.dimensionNodeText, { color: ui.textPrimary }]}>Activity</Text>
        </Pressable>
        <Pressable style={[styles.dimensionNode, styles.nodeNutrition]} onPress={() => setActiveDimension('nutrition')}>
          <FitDimensionIcon dimension="nutrition" active={activeDimension === 'nutrition'} isLight={isLight} />
          <Text style={[styles.dimensionNodeText, { color: ui.textPrimary }]}>Nutrition</Text>
        </Pressable>
        <Pressable style={[styles.dimensionNode, styles.nodeRhythm]} onPress={() => setActiveDimension('rhythm')}>
          <FitDimensionIcon dimension="rhythm" active={activeDimension === 'rhythm'} isLight={isLight} />
          <Text style={[styles.dimensionNodeText, { color: ui.textPrimary }]}>Cycle</Text>
        </Pressable>
        <Pressable style={[styles.dimensionNode, styles.nodeSleep]} onPress={() => setActiveDimension('sleep')}>
          <FitDimensionIcon dimension="sleep" active={activeDimension === 'sleep'} isLight={isLight} />
          <Text style={[styles.dimensionNodeText, { color: ui.textPrimary }]}>Sleep</Text>
        </Pressable>
        <View style={styles.centerOrb}>
          <View style={styles.starCircleLayer}>
            <StarCircleShape isLight={isLight} />
          </View>
          <RecoveryRing value={activeDimensionStats.score} pulse={heroPulse} gradient={activeVisual.gradient} isLight={isLight} />
          <View style={styles.lowerTag}><Text style={styles.lowerTagText} numberOfLines={1}>{recoveryIntel.isCalibrating ? 'Calibration' : heroState}</Text></View>
        </View>
      </View>

      <LinearGradient colors={[ui.trendBg1, ui.trendBg2]} style={[styles.card, isLight && { borderColor: ui.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: ui.textPrimary }]}>Your 7 day’s Recovery Trend</Text>
        <View style={styles.trendRow}>
          {activeDimensionStats.trend.map((value, index) => {
            const chip = scoreColor(value, index);
            return (
              <View key={`chip-${index}-${value}`} style={[styles.trendChip, { backgroundColor: chip.bg }]}>
                <Text style={[styles.trendChipText, { color: chip.text }]}>{Math.round(value)}%</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.trendWeekRow}>
          {WEEK_LABELS.map((label, idx) => (
            <Text key={`day-${idx}-${label}`} style={[styles.trendWeekLabel, { color: ui.textPrimary }]}>{label}</Text>
          ))}
        </View>
      </LinearGradient>
      <View style={styles.lowerRow}>
        <Pressable style={[styles.lowerCard, { backgroundColor: ui.cardBg, borderColor: ui.cardBorder }]} onPress={() => setMedicationOpen(true)}>
          <View style={styles.lowerCardTop}>
            <Text style={[styles.lowerCardTitle, { color: ui.textPrimary }]}>Medication</Text>
            <Ionicons name="medical-outline" size={20} color={ui.textSecondary} />
          </View>
          <View style={styles.lowerStatsRow}>
            <View><Text style={[styles.lowerStatValue, { color: ui.textPrimary }]}>{todayTimeline.filter((i) => i.status === 'taken').length}/10</Text><Text style={[styles.lowerStatLabel, { color: ui.textSecondary }]}>Taken</Text></View>
            <View><Text style={[styles.lowerStatValue, { color: ui.textPrimary }]}>{medicationPending}/10</Text><Text style={[styles.lowerStatLabel, { color: ui.textSecondary }]}>Pending</Text></View>
            <View><Text style={[styles.lowerStatValue, { color: ui.textPrimary }]}>{todayTimeline.filter((i) => i.status === 'missed').length}/10</Text><Text style={[styles.lowerStatLabel, { color: ui.textSecondary }]}>Missed</Text></View>
          </View>
          <Text style={styles.lowerLink}>Medication logs +</Text>
        </Pressable>
        <View style={[styles.lowerCard, { backgroundColor: ui.cardBg, borderColor: ui.cardBorder }]}>
          <View style={styles.lowerCardTop}>
            <Text style={[styles.lowerCardTitle, { color: ui.textPrimary }]}>Stress Recovery</Text>
            <Ionicons name="fitness-outline" size={18} color={ui.textSecondary} />
          </View>
          <Text style={[styles.lowerScore, { color: ui.textPrimary }]}>{recoveryIntel.stressRecoveryScore == null ? '—' : `${recoveryIntel.stressRecoveryScore}/100`}</Text>
          <Text style={[styles.lowerHint, { color: ui.textSecondary }]}>
            {recoveryIntel.isCalibrating ? 'Not enough recent real signals yet' : 'Adjusted by sleep, HRV, and calm sessions'}
          </Text>
          <View style={styles.lowerBarRow}>
            <View style={[styles.lowerBar, { backgroundColor: '#FF808A' }]} />
            <View style={styles.lowerBar} />
            <View style={styles.lowerBar} />
          </View>
        </View>
      </View>

      <Modal visible={medicationOpen} animationType="slide" transparent onRequestClose={() => setMedicationOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setMedicationOpen(false)} />
          <View style={styles.sheetWrap}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Medication Dashboard</Text>

            <ScrollView contentContainerStyle={styles.sheetContent}>
              <Text style={styles.section}>Today&apos;s Medications</Text>
              {todayTimeline.length === 0 ? (
                <Text style={styles.empty}>No medications scheduled for today.</Text>
              ) : (
                todayTimeline.map((item) => (
                  <View key={`${item.medication.id}-${item.scheduledForISO}`} style={styles.medRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medName}>{item.medication.name}</Text>
                      <Text style={styles.medTime}>{new Date(item.scheduledForISO).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>{item.status}</Text>
                    </View>
                  </View>
                ))
              )}

              <Text style={styles.section}>Quick Actions</Text>
              {todayTimeline.slice(0, 3).map((item) => (
                <View key={`quick-${item.medication.id}-${item.scheduledForISO}`} style={styles.quickRow}>
                  <Text style={styles.quickLabel}>{item.medication.name}</Text>
                  <View style={styles.quickActions}>
                    <Pressable style={styles.quickBtn} onPress={() => markMedicationAction({ medicationId: item.medication.id, scheduledForISO: item.scheduledForISO, status: 'taken' })}><Text style={styles.quickBtnText}>Taken</Text></Pressable>
                    <Pressable style={styles.quickBtn} onPress={() => markMedicationAction({ medicationId: item.medication.id, scheduledForISO: item.scheduledForISO, status: 'snoozed', snoozeMinutes: 10 })}><Text style={styles.quickBtnText}>Snooze</Text></Pressable>
                    <Pressable style={styles.quickBtn} onPress={() => markMedicationAction({ medicationId: item.medication.id, scheduledForISO: item.scheduledForISO, status: 'skipped' })}><Text style={styles.quickBtnText}>Skip</Text></Pressable>
                  </View>
                </View>
              ))}

              <View style={styles.ctaRow}>
                <Pressable style={styles.ctaBtn} onPress={() => { setMedicationOpen(false); navigation.navigate('MedicationForm'); }}><Text style={styles.ctaText}>+ Add Medication</Text></Pressable>
                <Pressable style={styles.ctaBtn} onPress={() => { setMedicationOpen(false); navigation.navigate('MedicationCalendar'); }}><Text style={styles.ctaText}>View Calendar</Text></Pressable>
                <Pressable style={styles.ctaBtn} onPress={() => { setMedicationOpen(false); navigation.navigate('MedicationNotifications'); }}><Text style={styles.ctaText}>Manage Notifications</Text></Pressable>
                <Pressable style={styles.ctaBtn} onPress={() => setMedicationOpen(false)}><Text style={styles.ctaText}>Close</Text></Pressable>
              </View>

              <Text style={styles.section}>Existing Medications</Text>
              {medications.length === 0 ? (
                <Text style={styles.empty}>No medications yet.</Text>
              ) : (
                medications.map((medication) => (
                  <View key={medication.id} style={styles.medCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medName}>{medication.name}</Text>
                      <Text style={styles.medTime}>{medication.dosage} • {medication.status}</Text>
                    </View>
                    <View style={styles.manageRow}>
                      <Pressable onPress={() => { setMedicationOpen(false); navigation.navigate('MedicationForm', { medicationId: medication.id }); }}><Text style={styles.link}>Edit</Text></Pressable>
                      <Pressable onPress={() => pauseMedication(medication.id)}><Text style={styles.link}>Pause</Text></Pressable>
                      <Pressable onPress={() => deleteMedication(medication.id)}><Text style={styles.deleteLink}>Delete</Text></Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={aiOpen} animationType="slide" transparent onRequestClose={() => setAiOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setAiOpen(false)} />
          <View style={styles.sheetWrap}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Fiteatsy Assistant</Text>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <View style={styles.assistantCard}>
                <View style={styles.assistantHeader}>
                  <Text style={styles.assistantTitle}>Fiteatsy Assistant</Text>
                  <Text style={styles.assistantBadge}>AI-guided</Text>
                </View>
                <Text style={styles.assistantCopy}>
                  Corrective actions generated from your latest trackers and recovery signals:
                </Text>
                {assistanceActions.map((item, index) => (
                  <View key={`assist-${index}-${item}`} style={styles.assistantPoint}>
                    <Text style={styles.assistantBullet}>•</Text>
                    <Text style={styles.assistantPointText}>{item}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.consultantCard}>
                <View style={styles.consultantHeaderRow}>
                  <Text style={styles.consultantLabel}>Clinical Diet Consultant</Text>
                  <Ionicons name="medkit-outline" size={15} color="#59BE08" />
                </View>
                <Text style={styles.consultantName}>{consultantName}</Text>
                <Text style={styles.consultantSpecialty}>{consultantSpecialty}</Text>
                <Text style={styles.consultantHint}>Your corrective guidance is aligned with this consultant profile.</Text>
              </View>
              <Pressable style={styles.ctaBtn} onPress={() => setAiOpen(false)}><Text style={styles.ctaText}>Close</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={devPanelOpen} animationType="slide" transparent onRequestClose={() => setDevPanelOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setDevPanelOpen(false)} />
          <View style={styles.sheetWrap}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Runtime Trust QA</Text>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              {devLoading ? <Text style={styles.assistantCopy}>Loading runtime diagnostics...</Text> : null}
              {devError ? <Text style={[styles.assistantCopy, { color: '#FF808A' }]}>{devError}</Text> : null}

              <View style={styles.assistantCard}>
                <Text style={styles.assistantTitle}>Health Connect Status</Text>
                <Text style={styles.assistantPointText}>SDK: {devDiagnostics?.sdkStatus ?? 'unknown'}</Text>
                <Text style={styles.assistantPointText}>Initialized: {devDiagnostics?.initialized ? 'yes' : 'no'}</Text>
                <Text style={styles.assistantPointText}>Last checked: {devDiagnostics?.lastCheckedISO ?? 'n/a'}</Text>
              </View>

              <View style={styles.assistantCard}>
                <Text style={styles.assistantTitle}>Permissions</Text>
                <Text style={styles.assistantPointText}>Steps: {devDiagnostics?.permissionStates?.Steps ? 'granted' : 'missing'}</Text>
                <Text style={styles.assistantPointText}>Sleep: {devDiagnostics?.permissionStates?.SleepSession ? 'granted' : 'missing'}</Text>
                <Text style={styles.assistantPointText}>Resting HR: {devDiagnostics?.permissionStates?.RestingHeartRate ? 'granted' : 'missing'}</Text>
                <Text style={styles.assistantPointText}>HRV: {devDiagnostics?.permissionStates?.HeartRateVariabilityRmssd ? 'granted' : 'missing'}</Text>
                <Text style={styles.assistantPointText}>Workouts: {devDiagnostics?.permissionStates?.ExerciseSession ? 'granted' : 'missing'}</Text>
              </View>

              <View style={styles.assistantCard}>
                <Text style={styles.assistantTitle}>Signal Runtime</Text>
                <Text style={styles.assistantPointText}>Steps: {devDiagnostics?.metricDebug.steps.recordCount ?? 0} records • stale: {devDiagnostics?.metricDebug.steps.stale ? 'yes' : 'no'}</Text>
                <Text style={styles.assistantPointText}>Sleep: {devDiagnostics?.metricDebug.sleep.recordCount ?? 0} records • stale: {devDiagnostics?.metricDebug.sleep.stale ? 'yes' : 'no'}</Text>
                <Text style={styles.assistantPointText}>Resting HR: {devDiagnostics?.metricDebug.restingHeartRate.recordCount ?? 0} records • stale: {devDiagnostics?.metricDebug.restingHeartRate.stale ? 'yes' : 'no'}</Text>
                <Text style={styles.assistantPointText}>HRV: {devDiagnostics?.metricDebug.hrv.recordCount ?? 0} records • stale: {devDiagnostics?.metricDebug.hrv.stale ? 'yes' : 'no'}</Text>
                <Text style={styles.assistantPointText}>Workouts: {devDiagnostics?.metricDebug.workouts.recordCount ?? 0} records • stale: {devDiagnostics?.metricDebug.workouts.stale ? 'yes' : 'no'}</Text>
              </View>

              <View style={styles.assistantCard}>
                <Text style={styles.assistantTitle}>Recovery Engine</Text>
                <Text style={styles.assistantPointText}>Raw score: {recoveryIntel.debug.rawRecoveryScore}</Text>
                <Text style={styles.assistantPointText}>Smoothed score: {recoveryIntel.debug.smoothedRecoveryScore ?? 'calibrating'}</Text>
                <Text style={styles.assistantPointText}>Raw calm: {recoveryIntel.debug.rawCalmScore}</Text>
                <Text style={styles.assistantPointText}>Smoothed calm: {recoveryIntel.debug.smoothedCalmScore ?? 'calibrating'}</Text>
                <Text style={styles.assistantPointText}>Raw stress recovery: {recoveryIntel.debug.rawStressRecoveryScore}</Text>
                <Text style={styles.assistantPointText}>Smoothed stress recovery: {recoveryIntel.debug.smoothedStressRecoveryScore ?? 'calibrating'}</Text>
                <Text style={styles.assistantPointText}>Coverage: {recoveryIntel.debug.signalCoverageCount}/5</Text>
                <Text style={styles.assistantPointText}>Confidence: {recoveryIntel.debug.confidenceState}</Text>
                <Text style={styles.assistantPointText}>Calibration: {recoveryIntel.isCalibrating ? 'yes' : 'no'}</Text>
              </View>

              <View style={styles.assistantCard}>
                <Text style={styles.assistantTitle}>Session Influence</Text>
                <Text style={styles.assistantPointText}>Today sessions: {sessionAntiManipulation.todaySessionCount}</Text>
                <Text style={styles.assistantPointText}>Multiplier: {recoveryIntel.debug.sessionInfluenceMultiplier.toFixed(2)}</Text>
                <Text style={styles.assistantPointText}>Cooldown penalty: {recoveryIntel.debug.recentCooldownPenalty.toFixed(2)}</Text>
                <Text style={styles.assistantPointText}>Effective influence: {recoveryIntel.debug.effectiveSessionInfluence.toFixed(2)}</Text>
              </View>

              <Pressable style={styles.ctaBtn} onPress={() => setDevPanelOpen(false)}><Text style={styles.ctaText}>Close</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 84,
    gap: 12
  },
  headerRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  greeting: {
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18
  },
  focusCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1D232A',
    backgroundColor: '#0F151D',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  focusTextWrap: {
    flex: 1,
    paddingRight: 6
  },
  focusTitle: {
    color: '#F3F5F7',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6
  },
  focusBody: {
    color: '#8E9399',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
    maxWidth: 236
  },
  focusCta: {
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: '#59BE08',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    alignSelf: 'flex-start',
    marginTop: 2
  },
  focusCtaText: {
    color: '#F4F8F1',
    fontSize: 14,
    fontWeight: '700'
  },
  topRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  actionRail: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121212',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#000000',
    overflow: 'hidden'
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center'
  },
  notifyBadge: {
    position: 'absolute',
    right: 5,
    top: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D04053',
    borderWidth: 1,
    borderColor: '#F5E1E1',
    alignItems: 'center',
    justifyContent: 'center'
  },
  notifyBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700'
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#CFCFCF'
  },
  cardPrimary: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#222222',
    padding: 16
  },
  heroZone: {
    height: 340,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
    overflow: 'visible'
  },
  starLayerContainer: {
    position: 'absolute',
    top: -14,
    right: -12,
    bottom: -14,
    left: -12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  starLayerGlowWrap: {
    shadowColor: '#000000',
    shadowOffset: { width: -6, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 14
  },
  starLayerDarkWrap: {
    shadowColor: '#000000',
    shadowOffset: { width: 10, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 6
  },
  starLayerImage: {
    width: 342,
    height: 342
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 12,
    backgroundColor: '#151515'
  },
  cardTitle: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8
  },
  cardSub: {
    color: '#848484',
    fontSize: 12,
    fontWeight: '400',
    marginBottom: 10
  },
  heroState: {
    color: '#DCECDD',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6
  },
  heroScoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: 8
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  heroTextCol: {
    flex: 1
  },
  heroScoreValue: {
    color: '#F4F4F4',
    fontSize: 38,
    fontWeight: '700',
    lineHeight: 40
  },
  heroScoreSlash: {
    color: '#9A9A9A',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 5
  },
  heroTrendPill: {
    marginLeft: 'auto',
    minHeight: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#355841',
    backgroundColor: '#1A2D22',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  heroTrendText: {
    color: '#9AC7AE',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize'
  },
  heroSentence: {
    color: '#BFC7C0',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    marginTop: 8
  },
  dimensionNode: {
    position: 'absolute',
    alignItems: 'center',
    gap: 3,
    overflow: 'visible'
  },
  nodeCalm: {
    top: 30 * HERO_SCALE
  },
  nodeActivity: {
    left: (37 * HERO_SCALE) - 4,
    top: 119 * HERO_SCALE
  },
  nodeNutrition: {
    left: (307 * HERO_SCALE) - 4,
    top: 119 * HERO_SCALE
  },
  nodeRhythm: {
    left: (95 * HERO_SCALE) - 4,
    top: 276 * HERO_SCALE
  },
  nodeSleep: {
    left: (258 * HERO_SCALE) + 4,
    top: 276 * HERO_SCALE
  },
  dimensionNodeText: {
    color: '#D5DADE',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400'
  },
  scoreBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  pillGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8
  },
  metricPill: {
    width: '49%',
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8
  },
  metricPillText: {
    fontSize: 12,
    color: '#59BE08',
    fontWeight: '400',
    flexShrink: 1
  },
  ringWrap: {
    width: HERO_RING_SIZE,
    height: HERO_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ringGlow: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58
  },
  ringCenter: {
    position: 'absolute',
    fontSize: 20,
    lineHeight: 32,
    color: '#DDE5EF',
    fontWeight: '700',
    textAlign: 'center'
  },
  ringSub: {
    position: 'absolute',
    color: '#D6DBE0',
    fontSize: 10,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center'
  },
  centerOrb: {
    position: 'absolute',
    left: 100 * HERO_SCALE,
    top: 93 * HERO_SCALE,
    width: 191 * HERO_SCALE,
    height: 191 * HERO_SCALE,
    borderRadius: (191 * HERO_SCALE) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible'
  },
  starCircleLayer: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: HERO_CENTER_CIRCLE_SIZE,
    height: HERO_CENTER_CIRCLE_SIZE,
    marginLeft: -(HERO_CENTER_CIRCLE_SIZE / 2),
    marginTop: -(HERO_CENTER_CIRCLE_SIZE / 2),
    opacity: 0.95
  },
  orbCore: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    shadowColor: '#94A3B8',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3
  },
  lowerTag: {
    position: 'absolute',
    bottom: 14,
    transform: [{ translateY: 16 }],
    minHeight: 21,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#E51A1A',
    alignItems: 'center',
    justifyContent: 'center'
  },
  lowerTagText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '600'
  },
  bodyCopy: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    marginBottom: 10
  },
  syncButton: {
    alignSelf: 'flex-start',
    height: 36,
    borderRadius: 18,
    backgroundColor: '#59BE08',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12
  },
  syncText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  },
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8
  },
  sparklineWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#253127',
    backgroundColor: '#121714',
    paddingHorizontal: 8,
    paddingTop: 8,
    marginBottom: 8
  },
  trendChip: {
    flex: 1,
    minHeight: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  trendChipText: {
    fontSize: 11,
    fontWeight: '500'
  },
  trendWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6
  },
  trendWeekLabel: {
    color: '#EEEEEE',
    fontSize: 12,
    fontWeight: '400',
    width: 20,
    textAlign: 'center'
  },
  lowerRow: {
    flexDirection: 'row',
    gap: 10
  },
  lowerCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#131313',
    padding: 12,
    minHeight: 130
  },
  lowerCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  lowerCardTitle: {
    color: '#EAEAEA',
    fontSize: 14,
    fontWeight: '700'
  },
  lowerStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  lowerStatValue: {
    color: '#F2F2F2',
    fontSize: 12,
    fontWeight: '700'
  },
  lowerStatLabel: {
    color: '#7C848C',
    fontSize: 12,
    fontWeight: '400'
  },
  lowerLink: {
    marginTop: 'auto',
    color: '#8ADE67',
    fontSize: 14,
    fontWeight: '700'
  },
  lowerScore: {
    color: '#F2F2F2',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4
  },
  lowerHint: {
    color: '#7C848C',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10
  },
  heroSyncButton: {
    position: 'absolute',
    right: 8,
    top: 6,
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: '#59BE08',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12
  },
  heroSyncText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700'
  },
  lowerBarRow: {
    flexDirection: 'row',
    gap: 6
  },
  lowerBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3E4247'
  },
  assistantCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#59BE08',
    backgroundColor: '#000000',
    padding: 12,
    marginTop: 2
  },
  assistantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  assistantTitle: {
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '600'
  },
  assistantBadge: {
    color: '#00C92C',
    fontSize: 14,
    fontWeight: '600'
  },
  assistantCopy: {
    color: '#8D8D8D',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    marginBottom: 2
  },
  assistantPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 6
  },
  assistantBullet: {
    color: '#59BE08',
    fontSize: 14,
    lineHeight: 16,
    marginTop: 1
  },
  assistantPointText: {
    flex: 1,
    color: '#8D8D8D',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16
  },
  consultantCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#59BE08',
    backgroundColor: '#0A0A0A',
    padding: 12
  },
  consultantHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  consultantLabel: {
    color: '#59BE08',
    fontSize: 12,
    fontWeight: '600'
  },
  consultantName: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600'
  },
  consultantSpecialty: {
    color: '#CDD2D6',
    fontSize: 12,
    marginTop: 3
  },
  consultantHint: {
    color: '#9AA0A6',
    fontSize: 11,
    marginTop: 8,
    lineHeight: 15
  },
  medicationCta: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#59BE08',
    backgroundColor: '#000000',
    padding: 12
  },
  medicationCtaTitle: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8
  },
  medicationCtaBody: {
    color: '#C2C2C2',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
    justifyContent: 'flex-end'
  },
  sheetBackdrop: {
    flex: 1
  },
  sheetWrap: {
    maxHeight: '82%',
    backgroundColor: '#121212',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 14
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#6F6F6F',
    marginBottom: 10
  },
  sheetTitle: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10
  },
  sheetContent: {
    gap: 10,
    paddingBottom: 20
  },
  section: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600'
  },
  empty: {
    color: '#9A9A9A',
    fontSize: 12,
    fontWeight: '400'
  },
  medRow: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    backgroundColor: '#0B0B0B',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  medName: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '600'
  },
  medTime: {
    color: '#9A9A9A',
    fontSize: 12,
    fontWeight: '400'
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#59BE08'
  },
  statusText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize'
  },
  quickRow: {
    gap: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#0B0B0B'
  },
  quickLabel: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '600'
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8
  },
  quickBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  quickBtnText: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '400'
  },
  ctaRow: {
    gap: 8
  },
  ctaBtn: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#171717',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#59BE08'
  },
  ctaText: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '700'
  },
  medCard: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    backgroundColor: '#0B0B0B',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  manageRow: {
    flexDirection: 'row',
    gap: 10
  },
  link: {
    color: '#59BE08',
    fontSize: 12,
    fontWeight: '600'
  },
  deleteLink: {
    color: '#D04053',
    fontSize: 12,
    fontWeight: '600'
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202020',
    backgroundColor: '#151515',
    padding: 12,
    gap: 8
  },
  summaryTitle: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600'
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  summaryKey: {
    color: '#9A9A9A',
    fontSize: 12,
    fontWeight: '400'
  },
  summaryValue: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '600'
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  attentionText: {
    flex: 1,
    color: '#D8D8D8',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  driverArrow: {
    width: 14,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1
  },
  driverTitle: {
    color: '#EAEAEA',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2
  },
  driverBody: {
    color: '#9FA5A1',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16
  },
  quickActionRow: {
    gap: 8,
    paddingRight: 8
  },
  quickActionPill: {
    minHeight: 38,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2B342D',
    backgroundColor: '#111714',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  quickActionPillPressed: {
    opacity: 0.76
  },
  quickActionText: {
    color: '#DBE8DE',
    fontSize: 12,
    fontWeight: '500'
  },
  aiCompactCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#273027',
    backgroundColor: '#121713',
    padding: 12,
    gap: 6
  },
  aiCompactTitle: {
    color: '#59BE08',
    fontSize: 12,
    fontWeight: '600'
  },
  aiCompactBody: {
    color: '#E2E2E2',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18
  },
  aiCompactLink: {
    color: '#A6D97A',
    fontSize: 12,
    fontWeight: '600'
  },
  celebrationCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#294332',
    backgroundColor: '#132017',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  celebrationText: {
    flex: 1,
    color: '#C7D8CC',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17
  },
  familyCircleCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#232323',
    backgroundColor: '#131313',
    padding: 12,
    gap: 10
  },
  familyCircleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  familyCircleTitle: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600'
  },
  familyCircleAdd: {
    color: '#59BE08',
    fontSize: 12,
    fontWeight: '600'
  },
  familyCircleList: {
    gap: 10,
    paddingRight: 8
  },
  familyCircleEmpty: {
    color: '#9A9A9A',
    fontSize: 12,
    fontWeight: '400'
  },
  familyCircleMember: {
    width: 96,
    alignItems: 'center',
    gap: 4
  },
  familyCircleAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#59BE08',
    backgroundColor: '#1B1B1B',
    alignItems: 'center',
    justifyContent: 'center'
  },
  familyCircleAvatarText: {
    color: '#F4F4F4',
    fontSize: 14,
    fontWeight: '600'
  },
  familyCircleName: {
    color: '#F4F4F4',
    fontSize: 12,
    fontWeight: '600'
  },
  familyCircleStatus: {
    color: '#9A9A9A',
    fontSize: 11,
    fontWeight: '400'
  }
});
