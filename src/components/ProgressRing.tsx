import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '../design/tokens';

type Props = {
  progress: number;
  size?: number;
  strokeWidth?: number;
};

export const ProgressRing = ({ progress, size = 188, strokeWidth = 8 }: Props) => {
  const clamped = Math.max(0, Math.min(1, progress));
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - clamped * circumference;

  return (
    <View>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={colors.pink} />
            <Stop offset="100%" stopColor={colors.purple} />
          </LinearGradient>
        </Defs>
        <Circle cx={center} cy={center} r={radius} stroke={colors.stroke} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#ringGradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
    </View>
  );
};
