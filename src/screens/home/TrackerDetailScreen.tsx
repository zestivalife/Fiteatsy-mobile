import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Line, Path, Rect, Stop } from 'react-native-svg';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { getTrackerAnalysis, TrackerAnalysisResult } from '../../services/trackerAnalysisService';
import { useAppContext } from '../../state/AppContext';

type TrackerDetailRoute = RouteProp<RootStackParamList, 'TrackerDetail'>;

const trendWidth = 300;
const trendHeight = 152;

const toRatio = (value: number, min: number, max: number) => {
  if (max <= min) {
    return 0;
  }
  return (value - min) / (max - min);
};

const formatMetricValue = (value: number, unit: string) => {
  if (unit === 'Km') {
    return value.toFixed(1);
  }
  return Math.round(value).toString();
};

const ScoreRing = ({ progress, score, color, isLight }: { progress: number; score: number; color: string; isLight: boolean }) => {
  const size = 116;
  const stroke = 10;
  const radiusValue = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radiusValue;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  return (
    <View style={styles.ringWrap}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={color} stopOpacity="1" />
            <Stop offset="100%" stopColor={colors.white} stopOpacity="0.85" />
          </SvgGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radiusValue} stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusValue}
          stroke="url(#ringGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
          fill="none"
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringScore, { color: isLight ? '#000000' : '#FFFFFF' }]}>{score}</Text>
        <Text style={[styles.ringScoreLabel, { color: isLight ? '#000000' : '#FFFFFF' }]}>Score</Text>
      </View>
    </View>
  );
};

const TrendArea = ({
  values,
  color,
  average,
  reveal,
  isLight,
  textColor
}: {
  values: number[];
  color: string;
  average: number;
  reveal: Animated.Value;
  isLight: boolean;
  textColor: string;
}) => {
  const min = Math.min(...values);
  const max = Math.max(...values);

  const points = values.map((value, index) => {
    const x = 12 + (index * (trendWidth - 24)) / Math.max(1, values.length - 1);
    const y = trendHeight - 20 - toRatio(value, min, max) * (trendHeight - 42);
    return { x, y, value };
  });

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${trendHeight - 14} L ${points[0].x} ${trendHeight - 14} Z`;

  const avgY = trendHeight - 20 - toRatio(average, min, max) * (trendHeight - 42);
  const latest = points[points.length - 1];

  const revealWidth = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, trendWidth]
  });

  return (
    <View>
      <Animated.View style={{ width: revealWidth, overflow: 'hidden' }}>
        <Svg width={trendWidth} height={trendHeight}>
          <Defs>
            <SvgGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={color} stopOpacity="0.4" />
              <Stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </SvgGradient>
          </Defs>

          <Rect x={0} y={0} width={trendWidth} height={trendHeight} rx={14} fill={isLight ? '#FFFFFF' : 'transparent'} />
          <Line x1={12} y1={avgY} x2={trendWidth - 12} y2={avgY} stroke="rgba(255,255,255,0.24)" strokeDasharray="4 4" strokeWidth={1} />
          <Path d={areaPath} fill="url(#areaGradient)" />
          <Path d={linePath} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={latest.x} cy={latest.y} r={5} fill={color} />
        </Svg>
      </Animated.View>

      <Animated.View style={{ opacity: reveal }}>
        <View style={styles.trendLegendRow}>
          <Text style={[styles.trendLegendText, { color: textColor }]}>Now: {formatMetricValue(latest.value, '')}</Text>
          <Text style={[styles.trendLegendText, { color: textColor }]}>7d avg: {average.toFixed(1)}</Text>
        </View>
      </Animated.View>
    </View>
  );
};

export const TrackerDetailScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<TrackerDetailRoute>();
  const { themeMode } = useAppContext();
  const isLight = themeMode === 'light';
  const textPrimary = isLight ? '#000000' : '#FFFFFF';
  const textSecondary = isLight ? '#000000' : '#FFFFFF';
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<TrackerAnalysisResult | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);

  const ringAnim = useRef(new Animated.Value(0)).current;
  const trendReveal = useRef(new Animated.Value(0)).current;
  const compareReveal = useRef(new Animated.Value(0)).current;
  const impactReveal = useRef(new Animated.Value(0)).current;

  const params = route.params;

  useEffect(() => {
    const sub = ringAnim.addListener(({ value }) => {
      setAnimatedScore(Math.round(value * 100));
    });

    return () => {
      ringAnim.removeListener(sub);
    };
  }, [ringAnim]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      const result = await getTrackerAnalysis({
        metricKey: params.metricKey,
        metricTitle: params.metricTitle,
        tab: params.tab,
        unit: params.unit,
        values: params.values,
        compareValues: params.compareValues,
        context: params.context
      });

      if (!cancelled) {
        setAnalysis(result);
        setLoading(false);

        ringAnim.setValue(0);
        trendReveal.setValue(0);
        compareReveal.setValue(0);
        impactReveal.setValue(0);

        Animated.parallel([
          Animated.timing(ringAnim, {
            toValue: result.score / 100,
            duration: 900,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false
          }),
          Animated.timing(trendReveal, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false
          }),
          Animated.timing(compareReveal, {
            toValue: 1,
            duration: 760,
            delay: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false
          }),
          Animated.timing(impactReveal, {
            toValue: 1,
            duration: 820,
            delay: 220,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false
          })
        ]).start();
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [compareReveal, impactReveal, params, ringAnim, trendReveal]);

  const compareBlocks = useMemo(() => {
    if (!analysis) {
      return [];
    }

    const previous = analysis.latest - analysis.deltaFromPrevious;
    const maxBar = Math.max(analysis.latest, analysis.average, previous, 1);

    return [
      { label: 'Today', value: analysis.latest, accent: params.color },
      { label: 'Avg', value: analysis.average, accent: '#C9CFD4' },
      { label: 'Prev', value: previous, accent: '#C9CFD4' }
    ].map((item) => ({
      ...item,
      height: 30 + Math.round((item.value / maxBar) * 66)
    }));
  }, [analysis, params.color]);

  return (
    <Screen scroll>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: textPrimary }]}>{params.metricTitle}</Text>
          <Text style={[styles.subtitle, { color: textSecondary }]}>{params.subtitle}</Text>
        </View>
        <Pressable style={[styles.closeButton, { borderColor: isLight ? '#64748B' : '#475569', backgroundColor: isLight ? '#D1D5DB' : 'rgba(0,0,0,0.29)' }]} onPress={() => navigation.goBack()}>
          <Text style={[styles.closeText, { color: textPrimary }]}>×</Text>
        </Pressable>
      </View>

      {loading ? (
        <Card style={styles.loadingCard}>
          <ActivityIndicator color={colors.blue} />
          <Text style={[styles.loadingText, { color: textSecondary }]}>Generating analytical insights...</Text>
        </Card>
      ) : analysis ? (
        <>
          <Card style={styles.scoreCard}>
            <View style={styles.scoreRow}>
              <View style={styles.scoreLeft}>
                <View style={styles.iconPill}>
                  <Text style={styles.iconText}>{params.icon}</Text>
                  <Text style={[styles.iconPillTitle, { color: textPrimary }]}>Fiteatsy Score</Text>
                </View>
                <Text style={[styles.bigValue, { color: textPrimary }]}>{formatMetricValue(analysis.latest, params.unit)} {params.unit}</Text>
                <Text style={[styles.scoreMeta, { color: textSecondary }]}>
                  {analysis.trend.toUpperCase()} • Confidence {Math.round(analysis.confidence * 100)}%
                </Text>
              </View>

              <ScoreRing score={animatedScore} progress={animatedScore / 100} color={params.color} isLight={isLight} />
            </View>
          </Card>

          <Card style={styles.trendCard}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Performance Trend</Text>
            <TrendArea values={params.values} color={params.color} average={analysis.average} reveal={trendReveal} isLight={isLight} textColor={textSecondary} />
          </Card>

          <Card style={styles.compareCard}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Quick Compare</Text>
            <View style={styles.compareBarsRow}>
              {compareBlocks.map((block, index) => {
                const h = compareReveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, block.height],
                  extrapolate: 'clamp'
                });

                return (
                  <Animated.View key={block.label} style={[styles.compareBarItem, { opacity: compareReveal }]}> 
                    <Animated.View style={[styles.compareBar, { height: h, backgroundColor: block.accent }]} />
                    <Text style={[styles.compareValue, { color: textPrimary }]}>{formatMetricValue(block.value, params.unit)}</Text>
                    <Text style={[styles.compareLabel, { color: textSecondary }]}>{block.label}</Text>
                  </Animated.View>
                );
              })}
            </View>
          </Card>

          <Card style={styles.summaryCard}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Fiteatsy Summary</Text>
            <Text style={[styles.summaryText, { color: textPrimary }]}>{analysis.summary}</Text>
            <Text style={[styles.deltaText, { color: textSecondary }]}>
              Δ prev {analysis.deltaFromPrevious >= 0 ? '+' : ''}
              {analysis.deltaFromPrevious} • Δ avg {analysis.deltaFromAverage >= 0 ? '+' : ''}
              {analysis.deltaFromAverage}
            </Text>
          </Card>

          <Card style={styles.impactCard}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Impact Drivers</Text>
            <View style={styles.factorsColumn}>
              {analysis.factors.map((factor) => {
                const width = Math.min(260, Math.max(24, factor.impact * 10));
                const isUp = factor.direction === 'up';
                const animatedWidth = impactReveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, width],
                  extrapolate: 'clamp'
                });

                return (
                  <View key={factor.label} style={styles.factorBlock}>
                    <View style={styles.factorLabelRow}>
                      <Text style={[styles.factorName, { color: textPrimary }]}>{factor.label}</Text>
                      <Text style={[styles.factorImpact, isUp ? styles.impactUp : styles.impactDown]}>
                        {isUp ? '↑' : '↓'} {factor.impact}
                      </Text>
                    </View>
                    <View style={styles.factorTrack}>
                      <Animated.View
                        style={[styles.factorFill, { width: animatedWidth, backgroundColor: isUp ? '#509512' : '#D04053' }]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>

          <Card style={styles.suggestionCard}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Improvement Suggestions</Text>
            <View style={styles.suggestionList}>
              {analysis.suggestions.map((suggestion, index) => (
                <View key={`${suggestion}-${index}`} style={styles.suggestionRow}>
                  <View style={styles.dot} />
                  <Text style={[styles.suggestionText, { color: textSecondary }]}>{suggestion}</Text>
                </View>
              ))}
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md
  },
  title: {
    ...typography.title,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  subtitle: {
    ...typography.body,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: 'rgba(0,0,0,0.29)'
  },
  closeText: {
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 28,
    marginTop: -1
  },
  loadingCard: {
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary
  },
  scoreCard: {
    borderRadius: radius.lg,
    marginBottom: spacing.sm
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14
  },
  scoreLeft: {
    flex: 1
  },
  iconPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.29)',
    marginBottom: 8
  },
  iconPillTitle: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 12
  },
  iconText: {
    fontSize: 20
  },
  bigValue: {
    ...typography.title,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  scoreMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4
  },
  ringWrap: {
    width: 116,
    height: 116,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center'
  },
  ringScore: {
    ...typography.section,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  ringScoreLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1
  },
  trendCard: {
    borderRadius: radius.md,
    marginTop: spacing.xs
  },
  sectionTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8
  },
  trendLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6
  },
  trendLegendText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12
  },
  compareCard: {
    borderRadius: radius.md,
    marginTop: spacing.sm
  },
  compareBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingTop: 4
  },
  compareBarItem: {
    alignItems: 'center',
    gap: 4,
    width: 78
  },
  compareBar: {
    width: 24,
    borderRadius: 12
  },
  compareValue: {
    ...typography.bodyStrong,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary
  },
  compareLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary
  },
  summaryCard: {
    borderRadius: radius.md,
    marginTop: spacing.sm
  },
  summaryText: {
    ...typography.body,
    fontSize: 12,
    color: colors.textPrimary
  },
  deltaText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 8
  },
  impactCard: {
    borderRadius: radius.md,
    marginTop: spacing.sm
  },
  factorsColumn: {
    gap: 10
  },
  factorBlock: {
    gap: 6
  },
  factorLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  factorName: {
    ...typography.body,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary
  },
  factorImpact: {
    ...typography.bodyStrong,
    fontSize: 14,
    fontWeight: '700'
  },
  factorTrack: {
    height: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden'
  },
  factorFill: {
    height: '100%',
    borderRadius: 8
  },
  impactUp: {
    color: '#509512'
  },
  impactDown: {
    color: '#D04053'
  },
  suggestionCard: {
    borderRadius: radius.md,
    marginTop: spacing.sm
  },
  suggestionList: {
    gap: 8
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.blue,
    marginTop: 6
  },
  suggestionText: {
    ...typography.body,
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1
  }
});
