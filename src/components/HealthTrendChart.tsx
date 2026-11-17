import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';
import { spacing, typography } from '../design/tokens';
import type { HealthTrendPoint } from '../services/healthOverviewViewModel';

export const HealthTrendChart = ({ points, color, textColor, mutedColor, unit }: {
  points: HealthTrendPoint[]; color: string; textColor: string; mutedColor: string; unit: string;
}) => {
  const geometry = useMemo(() => {
    const width = 300;
    const height = 116;
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, 1);
    const coords = points.map((point, index) => ({
      x: points.length === 1 ? width / 2 : index * width / (points.length - 1),
      y: height - 10 - ((point.value - min) / span) * (height - 20)
    }));
    return { width, height, min, max, polyline: coords.map(({ x, y }) => `${x},${y}`).join(' ') };
  }, [points]);

  if (!points.length) return <View style={styles.empty}><Text style={[styles.emptyText, { color: mutedColor }]}>No measurements in this range</Text></View>;
  const description = points.map((point) => `${point.label}: ${point.value.toLocaleString()} ${unit}`.trim()).join(', ');
  return (
    <View accessibilityRole="image" accessibilityLabel={`Health trend chart. ${description}`}>
      <Svg height={geometry.height} width="100%" viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
        <Line x1="0" y1={geometry.height - 10} x2={geometry.width} y2={geometry.height - 10} stroke={mutedColor} strokeOpacity={0.3} />
        <Polyline points={geometry.polyline} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: textColor }]}>{points[0]?.label}</Text>
        <Text style={[styles.legendText, { color: mutedColor }]}>{points.at(-1)?.label}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: { minHeight: 116, alignItems: 'center', justifyContent: 'center' },
  emptyText: typography.bodySmall,
  legend: { marginTop: spacing.xxs, flexDirection: 'row', justifyContent: 'space-between' },
  legendText: typography.subtext
});
