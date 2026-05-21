import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { colors } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import {
  generateActionPlan,
  generateCrossReferenceInsights,
  generateNuetraSummary,
  generateParameterInsight,
  NuetraActionItem,
  NuetraCrossInsight,
  ReportParameter
} from '../../services/nuetraService';
import { useAppContext } from '../../state/AppContext';
import { ReportAnalysisResponse, uploadAndAnalyzeReport } from '../../services/reportUploadService';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type CategoryKey = 'Blood' | 'Metabolic' | 'Organs' | 'Thyroid' | 'Vitamins';

type ReportItem = {
  id: string;
  labName: string;
  date: string;
  parameters: number;
  abnormal: number;
  score: number;
  trend: 'up' | 'down' | 'flat';
  categoryScores: Record<CategoryKey, number>;
  parametersData: ReportParameter[];
  uploadSource?: 'camera' | 'gallery' | 'pdf';
  uploadedAtISO?: string;
};

type PickedUpload = {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  source: 'camera' | 'gallery' | 'pdf';
};

type AnalysisReviewState = {
  report: ReportItem;
  summary: string;
  comparisonSummary: string;
  actionPlan: NuetraActionItem[];
  goodParameters: ReportParameter[];
  attentionParameters: ReportParameter[];
};

const palette = {
  teal: colors.blueDark,
  tealLight: colors.surfaceAccent,
  amber: colors.warning,
  amberLight: colors.warningSoft,
  coral: colors.pink,
  coralLight: colors.dangerSoft,
  purple: colors.blueDark,
  purpleLight: colors.surfaceAccent,
  bg: colors.bgPrimary,
  card: colors.cardRaised,
  border: colors.stroke,
  textDark: colors.textPrimary,
  textMid: colors.textSecondary,
  textLight: colors.textMuted
} as const;

const categoryMeta: Array<{ key: CategoryKey; icon: keyof typeof Ionicons.glyphMap; color: string }> = [
  { key: 'Blood', icon: 'water', color: colors.pink },
  { key: 'Metabolic', icon: 'flame', color: colors.warning },
  { key: 'Organs', icon: 'heart', color: colors.pink },
  { key: 'Thyroid', icon: 'leaf', color: colors.blueDark },
  { key: 'Vitamins', icon: 'sunny', color: colors.warning }
];

const seedParameters = (): ReportParameter[] => [
  { name: 'Vitamin D', value: 18, unit: 'ng/mL', status: 'low', referenceRange: '30-100', category: 'Vitamins' },
  { name: 'HbA1c', value: 5.9, unit: '%', status: 'high', referenceRange: '4.0-5.6', category: 'Metabolic' },
  { name: 'LDL Cholesterol', value: 141, unit: 'mg/dL', status: 'high', referenceRange: '<100', category: 'Metabolic' },
  { name: 'Hemoglobin', value: 13.8, unit: 'g/dL', status: 'normal', referenceRange: '13.0-17.0', category: 'Blood' },
  { name: 'TSH', value: 2.6, unit: 'mIU/L', status: 'normal', referenceRange: '0.4-4.0', category: 'Thyroid' },
  { name: 'Creatinine', value: 0.93, unit: 'mg/dL', status: 'normal', referenceRange: '0.7-1.3', category: 'Organs' },
  { name: 'HDL Cholesterol', value: 42, unit: 'mg/dL', status: 'normal', referenceRange: '>40', category: 'Metabolic' }
];

const seededReports: ReportItem[] = [
  {
    id: 'rep-1',
    labName: 'Dr. Lal PathLabs',
    date: '15 Mar 2026',
    parameters: 47,
    abnormal: 3,
    score: 78,
    trend: 'up',
    categoryScores: { Blood: 82, Metabolic: 69, Organs: 80, Thyroid: 74, Vitamins: 63 },
    parametersData: seedParameters()
  },
  {
    id: 'rep-2',
    labName: 'Metropolis Labs',
    date: '20 Feb 2026',
    parameters: 39,
    abnormal: 4,
    score: 71,
    trend: 'down',
    categoryScores: { Blood: 76, Metabolic: 62, Organs: 73, Thyroid: 70, Vitamins: 64 },
    parametersData: seedParameters().map((param) =>
      param.name === 'Vitamin D' ? { ...param, value: 16 } : param.name === 'HbA1c' ? { ...param, value: 6.1 } : param
    )
  }
];

const scoreColor = (score: number) => {
  if (score >= 80) {
    return palette.teal;
  }
  if (score >= 60) {
    return palette.amber;
  }
  return palette.coral;
};

const scorePillBg = (score: number) => {
  if (score >= 80) {
    return palette.tealLight;
  }
  if (score >= 60) {
    return palette.amberLight;
  }
  return palette.coralLight;
};

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const bytesToLabel = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const buildCategoryScores = (parameters: ReportParameter[]): Record<CategoryKey, number> => {
  const grouped: Record<CategoryKey, number[]> = {
    Blood: [],
    Metabolic: [],
    Organs: [],
    Thyroid: [],
    Vitamins: []
  };

  parameters.forEach((parameter) => {
    const weight = parameter.status === 'normal' ? 84 : parameter.status === 'low' || parameter.status === 'high' ? 62 : 45;
    grouped[parameter.category].push(weight);
  });

  return {
    Blood: Math.round(grouped.Blood.reduce((a, b) => a + b, 0) / Math.max(1, grouped.Blood.length)),
    Metabolic: Math.round(grouped.Metabolic.reduce((a, b) => a + b, 0) / Math.max(1, grouped.Metabolic.length)),
    Organs: Math.round(grouped.Organs.reduce((a, b) => a + b, 0) / Math.max(1, grouped.Organs.length)),
    Thyroid: Math.round(grouped.Thyroid.reduce((a, b) => a + b, 0) / Math.max(1, grouped.Thyroid.length)),
    Vitamins: Math.round(grouped.Vitamins.reduce((a, b) => a + b, 0) / Math.max(1, grouped.Vitamins.length))
  };
};

const buildSpecificFallbackSummary = (parameters: ReportParameter[], userName?: string) => {
  const abnormal = parameters.filter((parameter) => parameter.status !== 'normal');
  const first = abnormal[0];
  const second = abnormal[1] ?? abnormal[0];

  if (!first) {
    return `${userName ?? 'You'} have all tracked markers in range today. Keep your routine steady and repeat this test cycle on your next scheduled check.`;
  }

  return `${userName ?? 'You'} are doing well on several core markers, and that is a strong base. ${first.name} is ${first.value} ${first.unit}, and ${second.name} is ${second.value} ${second.unit}, so these need focused correction this week. You can improve fast by tightening sleep, hydration, and meal consistency around work hours. Take one action now: book a clinician review and follow one weekly nutrition plan.`;
};

const shimmerLoop = (value: Animated.Value) => {
  value.setValue(0);
  return Animated.loop(
    Animated.timing(value, {
      toValue: 1,
      duration: 1050,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true
    })
  );
};

const SwipeableReportCard = ({
  report,
  onDelete,
  onOpen,
  isLight,
  highlightColor
}: {
  report: ReportItem;
  onDelete: () => void;
  onOpen: () => void;
  isLight: boolean;
  highlightColor: string;
}) => {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 8,
        onPanResponderMove: (_, gestureState) => {
          const next = Math.max(-88, Math.min(0, gestureState.dx));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, gestureState) => {
          const open = gestureState.dx < -38;
          Animated.spring(translateX, {
            toValue: open ? -88 : 0,
            useNativeDriver: true,
            bounciness: 0
          }).start();
        }
      }),
    [translateX]
  );

  return (
    <View style={styles.swipeWrap}>
      <Pressable style={styles.deleteReveal} onPress={onDelete}>
        <Ionicons name="trash-outline" size={18} color={colors.white} />
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>

      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <Pressable onPress={onOpen} style={[styles.reportRow, !isLight && styles.reportRowDark]}>
          <View style={[styles.reportAvatar, { backgroundColor: isLight ? palette.teal : highlightColor }]}>
            <Text style={styles.reportAvatarText}>{report.labName.slice(0, 2).toUpperCase()}</Text>
          </View>

          <View style={styles.reportMiddle}>
            <Text style={[styles.reportLab, !isLight && styles.reportLabDark]}>{report.labName}</Text>
            <Text style={[styles.reportDate, !isLight && styles.reportDateDark]}>{report.date}</Text>
            <Text style={[styles.reportMeta, report.abnormal > 0 ? styles.metaBad : styles.metaGood, !isLight && styles.reportMetaDark]}>
              {report.parameters} parameters · {report.abnormal} abnormal
            </Text>
          </View>

          <View style={styles.reportRight}>
            <View style={[styles.scoreBadge, { backgroundColor: scorePillBg(report.score) }]}>
              <Text style={[styles.scoreBadgeText, { color: scoreColor(report.score) }]}>{report.score}</Text>
            </View>
            <Text
              style={[
                styles.trend,
                report.trend === 'up' ? styles.trendUp : report.trend === 'down' ? styles.trendDown : styles.trendFlat,
                !isLight && styles.trendDark
              ]}
            >
              {report.trend === 'up' ? '↑' : report.trend === 'down' ? '↓' : '→'}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
};

export const ReportsScreen = () => {
  const navigation = useNavigation<Nav>();
  const { wellness, onboarding, checkIns, themeMode } = useAppContext();
  const isLight = themeMode === 'light';
  const [reports, setReports] = useState<ReportItem[]>(seededReports);
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [showHistory, setShowHistory] = useState(false);

  const [reportDate, setReportDate] = useState('15 Mar 2026');
  const [reportDateValue, setReportDateValue] = useState<Date>(new Date('2026-03-15T00:00:00.000Z'));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [labName, setLabName] = useState('');
  const [uploadType, setUploadType] = useState<'camera' | 'gallery' | 'pdf' | null>(null);
  const [selectedUpload, setSelectedUpload] = useState<PickedUpload | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [showUploadPreparing, setShowUploadPreparing] = useState(false);
  const [preparingProgress, setPreparingProgress] = useState(0);
  const [analysisLaunching, setAnalysisLaunching] = useState(false);
  const [lastPickSource, setLastPickSource] = useState<'camera' | 'gallery' | 'pdf' | null>(null);
  const [latestComparisonSummary, setLatestComparisonSummary] = useState<string | null>(null);
  const [analysisReview, setAnalysisReview] = useState<AnalysisReviewState | null>(null);
  const [showAnalysisReview, setShowAnalysisReview] = useState(false);

  const [nuetraSummary, setNuetraSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [parameterInsights, setParameterInsights] = useState<Record<string, string>>({});
  const [actionPlan, setActionPlan] = useState<NuetraActionItem[]>([]);
  const [crossInsights, setCrossInsights] = useState<NuetraCrossInsight[]>([]);
  const [heroExpanded, setHeroExpanded] = useState(true);
  const heroAnim = useRef(new Animated.Value(1)).current;

  const shimmer = useRef(new Animated.Value(0)).current;

  const latestReport = reports[0] ?? null;
  const overallScore = latestReport?.score ?? wellness.wellnessScore;
  const sectionHighlight = overallScore >= 80 ? colors.success : overallScore >= 60 ? colors.warning : colors.danger;
  const totalParams = latestReport?.parameters ?? 0;

  const categoryScores = latestReport?.categoryScores ?? {
    Blood: 0,
    Metabolic: 0,
    Organs: 0,
    Thyroid: 0,
    Vitamins: 0
  };

  const abnormalParameters = useMemo(
    () => latestReport?.parametersData.filter((parameter) => parameter.status !== 'normal') ?? [],
    [latestReport]
  );

  const hydratePickedFile = async (
    uri: string,
    source: 'camera' | 'gallery' | 'pdf',
    fallbackName: string,
    fallbackMimeType: string,
    knownSizeBytes?: number
  ): Promise<PickedUpload> => {
    let sizeBytes = typeof knownSizeBytes === 'number' && knownSizeBytes > 0 ? knownSizeBytes : 0;
    if (sizeBytes <= 0) {
      try {
        const info = (await Promise.race([
          FileSystem.getInfoAsync(uri),
          new Promise((_, reject) => setTimeout(() => reject(new Error('FILE_INFO_TIMEOUT')), 3000))
        ])) as { exists: boolean; size?: number };
        sizeBytes = info.exists && typeof info.size === 'number' ? info.size : 0;
      } catch {
        sizeBytes = 0;
      }
    }
    if (sizeBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`File is too large (${bytesToLabel(sizeBytes)}). Please upload a file below ${bytesToLabel(MAX_UPLOAD_BYTES)}.`);
    }
    return {
      uri,
      name: fallbackName,
      mimeType: fallbackMimeType,
      sizeBytes,
      source
    };
  };

  const pickUpload = async (source: 'camera' | 'gallery' | 'pdf') => {
    setUploadError(null);
    setUploadBusy(true);
    setLastPickSource(source);
    setUploadType(source);
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    const startPreparing = () => {
      setPreparingProgress(0);
      setShowUploadPreparing(true);
      progressTimer = setInterval(() => {
        setPreparingProgress((prev) => {
          if (prev >= 92) return prev;
          return prev + 8;
        });
      }, 120);
    };
    const finishPreparing = () => {
      setPreparingProgress(100);
      if (progressTimer) clearInterval(progressTimer);
      setTimeout(() => setShowUploadPreparing(false), 180);
    };
    const stopPreparingWithError = () => {
      if (progressTimer) clearInterval(progressTimer);
      setShowUploadPreparing(false);
    };

    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          throw new Error('Camera permission is denied. Please allow camera access and retry.');
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.72
        });
        if (result.canceled || !result.assets?.[0]) {
          stopPreparingWithError();
          setUploadBusy(false);
          return;
        }
        const captured = result.assets[0];
        startPreparing();
        const optimized = await ImageManipulator.manipulateAsync(
          captured.uri,
          [{ resize: { width: 1600 } }],
          { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
        );
        const picked = await hydratePickedFile(
          optimized.uri,
          source,
          captured.fileName ?? `camera-report-${Date.now()}.jpg`,
          captured.mimeType ?? 'image/jpeg',
          captured.fileSize
        );
        setSelectedUpload(picked);
        finishPreparing();
        return;
      }

      if (source === 'gallery') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          throw new Error('Gallery permission is denied. Please allow photo library access and retry.');
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.72
        });
        if (result.canceled || !result.assets?.[0]) {
          stopPreparingWithError();
          setUploadBusy(false);
          return;
        }
        const selected = result.assets[0];
        startPreparing();
        const optimized = await ImageManipulator.manipulateAsync(
          selected.uri,
          [{ resize: { width: 1600 } }],
          { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
        );
        const picked = await hydratePickedFile(
          optimized.uri,
          source,
          selected.fileName ?? `gallery-report-${Date.now()}.jpg`,
          selected.mimeType ?? 'image/jpeg',
          selected.fileSize
        );
        setSelectedUpload(picked);
        finishPreparing();
        return;
      }

      const doc = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false
      });
      if (doc.canceled || !doc.assets?.[0]) {
        stopPreparingWithError();
        setUploadBusy(false);
        return;
      }
      const file = doc.assets[0];
      startPreparing();
      const picked = await hydratePickedFile(
        file.uri,
        source,
        file.name ?? `report-${Date.now()}.pdf`,
        file.mimeType ?? 'application/pdf',
        file.size
      );
      setSelectedUpload(picked);
      finishPreparing();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Unable to select file. Please retry.');
      stopPreparingWithError();
    } finally {
      setUploadBusy(false);
    }
  };

  const startAnalysis = async () => {
    if (uploadBusy || analysisLaunching) return;
    if (!selectedUpload) {
      setUploadError('Please select a report file first (Photo, Gallery, or PDF).');
      return;
    }
    setUploadError(null);
    setUploadType(selectedUpload.source);
    setAnalysisLaunching(true);
    setShowUploadSheet(false);
    setShowProcessing(true);
  };

  const applyAnalysisReview = () => {
    if (!analysisReview) return;
    setReports((prev) => [analysisReview.report, ...prev]);
    setLatestComparisonSummary(analysisReview.comparisonSummary);
    setNuetraSummary(analysisReview.summary);
    setActionPlan(analysisReview.actionPlan);
    setShowAnalysisReview(false);
    setAnalysisReview(null);
  };

  useEffect(() => {
    Animated.spring(heroAnim, {
      toValue: heroExpanded ? 1 : 0,
      friction: 8,
      tension: 80,
      useNativeDriver: true
    }).start();
  }, [heroAnim, heroExpanded]);

  useEffect(() => {
    if (!summaryLoading) {
      return;
    }

    const loop = shimmerLoop(shimmer);
    loop.start();
    return () => loop.stop();
  }, [shimmer, summaryLoading]);

  useEffect(() => {
    if (!latestReport) {
      return;
    }

    let cancelled = false;

    const loadNuetra = async () => {
      setSummaryLoading(true);

      try {
        const summaryPromise = generateNuetraSummary(latestReport.parametersData, onboarding?.name);

        const insightPairsPromise = Promise.all(
          abnormalParameters.map(async (parameter) => {
            const insight = await generateParameterInsight(parameter);
            return [parameter.name, insight] as const;
          })
        );

        const actionPlanPromise = generateActionPlan(abnormalParameters);
        const crossInsightsPromise =
          checkIns.length > 0 ? generateCrossReferenceInsights(abnormalParameters, checkIns) : Promise.resolve([]);

        const [summary, insightPairs, actions, cross] = await Promise.all([
          summaryPromise,
          insightPairsPromise,
          actionPlanPromise,
          crossInsightsPromise
        ]);

        if (cancelled) {
          return;
        }

        setNuetraSummary(summary || buildSpecificFallbackSummary(latestReport.parametersData, onboarding?.name));
        setParameterInsights(Object.fromEntries(insightPairs));
        setActionPlan(actions);
        setCrossInsights(cross);
      } catch {
        if (!cancelled) {
          setNuetraSummary(buildSpecificFallbackSummary(latestReport.parametersData, onboarding?.name));
          setParameterInsights(
            Object.fromEntries(
              abnormalParameters.map((parameter) => [
                parameter.name,
                `${parameter.name} is ${parameter.value} ${parameter.unit} (${parameter.referenceRange}); this can improve with consistent routine this week.`
              ])
            )
          );
          setActionPlan(
            abnormalParameters.slice(0, 3).map((parameter, index) => ({
              priority: index + 1,
              title: `Improve ${parameter.name}`,
              detail: `${parameter.name} is ${parameter.value} ${parameter.unit}. Start one corrective habit this week and review with your clinician if needed.`,
              requiresDoctor: parameter.status === 'critical'
            }))
          );
          setCrossInsights([]);
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      }
    };

    loadNuetra();

    return () => {
      cancelled = true;
    };
  }, [abnormalParameters, checkIns, latestReport, onboarding?.name]);

  useEffect(() => {
    if (!showProcessing) {
      return;
    }

    setProcessingStep(0);
    progressAnim.setValue(0);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 5200,
      useNativeDriver: false
    }).start();

    const interval = setInterval(() => {
      setProcessingStep((prev) => {
        if (prev >= 3) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 1300);

    let cancelled = false;
    const failSafeTimeout = setTimeout(() => {
      if (cancelled) return;
      setShowProcessing(false);
      setAnalysisLaunching(false);
      setShowUploadSheet(true);
      setUploadError('Analysis is taking too long. Please retry. If issue continues, restart backend and app.');
    }, 35000);

    const execute = async () => {
      try {
        if (!selectedUpload) throw new Error('No report file selected.');
        const analysis: ReportAnalysisResponse = await uploadAndAnalyzeReport({
          fileUri: selectedUpload.uri,
          fileName: selectedUpload.name,
          mimeType: selectedUpload.mimeType,
          reportDate,
          labName
        });

        if (cancelled) return;
        setReportDate(analysis.reportDate);
        setLabName(analysis.labName);

        const previous = reports[0] ?? null;
        const abnormal = analysis.parameters.filter((parameter) => parameter.status !== 'normal').length;
        const trend: ReportItem['trend'] = previous
          ? analysis.score > previous.score
            ? 'up'
            : analysis.score < previous.score
              ? 'down'
              : 'flat'
          : 'flat';

        const newReport: ReportItem = {
          id: `rep-${Date.now()}`,
          labName: analysis.labName,
          date: analysis.reportDate,
          parameters: analysis.parameters.length,
          abnormal,
          score: analysis.score,
          trend,
          categoryScores: analysis.categoryScores,
          parametersData: analysis.parameters,
          uploadSource: selectedUpload.source,
          uploadedAtISO: new Date().toISOString()
        };

        const prevText = previous ? `Compared with ${previous.date} (${previous.labName}), ` : '';
        const comparisonSummary = `${prevText}${analysis.summary}`;
        setAnalysisReview({
          report: newReport,
          summary: analysis.summary,
          comparisonSummary,
          actionPlan: analysis.actionPlan.map((item) => ({ ...item, requiresDoctor: false })),
          goodParameters: analysis.parameters.filter((parameter) => parameter.status === 'normal'),
          attentionParameters: analysis.parameters.filter((parameter) => parameter.status !== 'normal')
        });
        setShowAnalysisReview(true);
        setShowProcessing(false);
        setAnalysisLaunching(false);
        setUploadType(null);
        setSelectedUpload(null);
        setShowUploadSheet(false);
      } catch (error) {
        if (cancelled) return;
        setShowProcessing(false);
        setAnalysisLaunching(false);
        setShowUploadSheet(true);
        setUploadError(error instanceof Error ? error.message : 'Analysis failed. Please retry with a clear report.');
      } finally {
        clearTimeout(failSafeTimeout);
      }
    };
    execute();

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(failSafeTimeout);
    };
  }, [labName, progressAnim, reportDate, reports, selectedUpload, showProcessing]);

  const onDatePicked = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (!selected) return;
    setReportDateValue(selected);
    setReportDate(
      selected.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    );
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220]
  });

  const reportCountLabel = `${reports.length}`;
  const stepText = [
    'Reading your report...',
    'Extracting all parameters...',
    'Benchmarking your values...',
    'Generating your health summary...'
  ];

  return (
    <Screen scroll contentStyle={[styles.screenContent, !isLight && styles.screenContentDark]}>
      <View style={styles.header}>
        <Pressable style={[styles.headerIconBtn, !isLight && styles.headerIconBtnDark]}>
          <Ionicons name="chevron-back" size={18} color={palette.textDark} />
        </Pressable>
        <Text style={[styles.headerTitle, !isLight && styles.headerTitleDark]}>My Health</Text>
        <Pressable style={[styles.headerIconBtn, !isLight && styles.headerIconBtnDark]} onPress={() => setShowUploadSheet(true)}>
          <Ionicons name="cloud-upload-outline" size={18} color={isLight ? palette.teal : sectionHighlight} />
        </Pressable>
      </View>

      {latestReport ? (
        <Card style={[styles.heroCard, !isLight && styles.heroCardDark, heroExpanded && styles.heroCardInteractive]}>
          <LinearGradient
            colors={heroExpanded ? [isLight ? 'rgba(15,110,86,0.12)' : 'rgba(53,209,140,0.22)', isLight ? 'rgba(83,74,183,0.08)' : 'rgba(141,83,255,0.18)', 'rgba(255,255,255,0)'] : [isLight ? 'rgba(15,110,86,0.08)' : 'rgba(53,209,140,0.12)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCardGradient}
          />
          <View style={styles.heroTopRow}>
            <Text style={[styles.heroLabel, !isLight && styles.heroLabelDark]}>Overall Health Score</Text>
            <Text style={[styles.heroUpdated, !isLight && styles.heroUpdatedDark]}>Updated {latestReport.date}</Text>
          </View>

          <Animated.Text
            style={[
              styles.heroScore,
              {
                color: scoreColor(overallScore),
                transform: [{ scale: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }]
              }
            ]}
          >
            {overallScore}
          </Animated.Text>
          <Text style={[styles.heroSub, !isLight && styles.heroSubDark]}>out of 100 · {totalParams} parameters analysed</Text>

          <Pressable style={[styles.heroToggleChip, !isLight && styles.heroToggleChipDark]} onPress={() => setHeroExpanded((current) => !current)}>
            <Text style={[styles.heroToggleText, !isLight && styles.heroToggleTextDark]}>{heroExpanded ? 'Hide details' : 'Show details'}</Text>
            <Ionicons name={heroExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={isLight ? palette.teal : sectionHighlight} />
          </Pressable>

          {heroExpanded ? (
            <>
              <View style={[styles.divider, !isLight && styles.dividerDark]} />

              <View style={styles.categoryRow}>
                {categoryMeta.map((category) => {
                  const score = categoryScores[category.key];
                  return (
                    <View key={category.key} style={[styles.categoryMetricCard, !isLight && styles.categoryMetricCardDark]}>
                      <View style={styles.categoryTop}>
                        <View style={[styles.categoryIconWrap, { backgroundColor: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.29)' }]}>
                          <Ionicons name={category.icon} size={14} color={category.color} />
                        </View>
                        <Text style={[styles.categoryName, !isLight && styles.categoryNameDark]}>{category.key}</Text>
                        <Text style={[styles.categoryScoreBadge, { color: category.color }]}>{score}</Text>
                      </View>
                      <View style={[styles.miniTrack, !isLight && styles.miniTrackDark]}>
                        <View style={[styles.miniFill, { width: (String(score) + '%') as any, backgroundColor: category.color }]} />
                      </View>
                      <Text style={[styles.categoryCaption, !isLight && styles.categoryCaptionDark]}>Score</Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.heroBottomRow}>
                <Text style={[styles.lastReport, !isLight && styles.lastReportDark]}>Last report: {latestReport.labName} · {latestReport.date}</Text>
                <Pressable>
                  <Text style={[styles.seeAll, !isLight && styles.seeAllDark]}>See all →</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </Card>
      ) : null}

      <Card style={[styles.nuetraCard, !isLight && styles.nuetraCardDark]}>
        <View style={styles.nuetraBadge}>
          <Text style={styles.nuetraBadgeText}>Fiteatsy AI</Text>
        </View>
        <Text style={[styles.nuetraTitle, !isLight && styles.nuetraTitleDark]}>Your health at a glance</Text>

        {summaryLoading ? (
          <View style={styles.shimmerBlock}>
            {[0, 1, 2].map((line) => (
              <View key={line} style={[styles.shimmerLine, line === 2 && { width: '70%' }]} />
            ))}
            <Animated.View style={[styles.shimmerSweep, { transform: [{ translateX: shimmerTranslate }] }]} />
          </View>
        ) : (
          <Text style={[styles.nuetraCopy, !isLight && styles.nuetraCopyDark]}>{nuetraSummary}</Text>
        )}

        <Pressable
          onPress={() =>
            latestReport
              ? navigation.navigate('ReportsChat', {
                  reportName: latestReport.labName,
                  reportParameters: latestReport.parametersData
                })
              : null
          }
        >
          <Text style={[styles.askNuetra, !isLight && styles.askNuetraDark]}>Ask Fiteatsy anything →</Text>
        </Pressable>
      </Card>

      <Card style={[styles.detailCard, !isLight && styles.detailCardDark]}>
        <Text style={[styles.detailTitle, !isLight && styles.detailTitleDark]}>Category Breakdown</Text>
        {abnormalParameters.length === 0 ? (
          <Text style={[styles.detailEmpty, !isLight && styles.detailEmptyDark]}>No abnormal markers in the latest report.</Text>
        ) : (
          abnormalParameters.map((parameter) => (
            <View key={parameter.name} style={[styles.parameterRow, !isLight && styles.parameterRowDark]}>
              <View style={styles.parameterTopRow}>
                <Text style={[styles.parameterName, !isLight && styles.parameterNameDark]}>{parameter.name}</Text>
                <Text style={styles.parameterValue}>
                  {parameter.value} {parameter.unit}
                </Text>
              </View>
              <Text style={[styles.parameterRange, !isLight && styles.parameterRangeDark]}>Range: {parameter.referenceRange}</Text>
              <Text style={[styles.parameterInsight, !isLight && styles.parameterInsightDark]}>{parameterInsights[parameter.name] ?? 'Fiteatsy is preparing a personalized insight...'}</Text>
            </View>
          ))
        )}
      </Card>

      <Card style={[styles.detailCard, !isLight && styles.detailCardDark]}>
        <Text style={[styles.detailTitle, !isLight && styles.detailTitleDark]}>Action Plan</Text>
        {actionPlan.map((item) => (
          <View key={item.priority} style={[styles.actionCard, !isLight && styles.actionCardDark]}>
            <View style={styles.actionTop}>
              <Text style={styles.actionPriority}>#{item.priority}</Text>
              <Text style={[styles.actionTitle, !isLight && styles.actionTitleDark]}>{item.title}</Text>
            </View>
            <Text style={[styles.actionDetail, !isLight && styles.actionDetailDark]}>{item.detail}</Text>
            {item.requiresDoctor ? <Text style={styles.actionDoctor}>Clinician follow-up recommended</Text> : null}
          </View>
        ))}
      </Card>

      {crossInsights.length > 0 ? (
        <Card style={[styles.detailCard, !isLight && styles.detailCardDark]}>
          <Text style={[styles.detailTitle, !isLight && styles.detailTitleDark]}>Your Body Is Telling You Something</Text>
          {crossInsights.map((item, index) => (
            <View key={`${item.labParam}-${index}`} style={[styles.crossRow, !isLight && styles.crossRowDark]}>
              <Text style={[styles.crossConnection, !isLight && styles.crossConnectionDark]}>{item.connection}</Text>
              <Text style={[styles.crossMeta, !isLight && styles.crossMetaDark]}>{item.checkInPattern}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, !isLight && styles.sectionTitleDark]}>Your Reports</Text>
        <Pressable style={[styles.countChip, !isLight && styles.countChipDark]} onPress={() => setShowHistory((prev) => !prev)}>
          <Text style={styles.countChipText}>{showHistory ? 'Hide history' : `View history (${reportCountLabel})`}</Text>
        </Pressable>
      </View>

      {showHistory ? (
        <View style={styles.reportList}>
          {reports.map((report) => (
            <SwipeableReportCard
              key={report.id}
              report={report}
              onOpen={() => setReports((prev) => [report, ...prev.filter((item) => item.id !== report.id)])}
              onDelete={() => setReports((prev) => prev.filter((r) => r.id !== report.id))}
              isLight={isLight}
              highlightColor={sectionHighlight}
            />
          ))}
        </View>
      ) : null}

      {latestComparisonSummary ? (
        <Card style={[styles.detailCard, !isLight && styles.detailCardDark]}>
          <Text style={[styles.detailTitle, !isLight && styles.detailTitleDark]}>Recovery-Oriented Comparison</Text>
          <Text style={[styles.detailEmpty, !isLight && styles.detailEmptyDark]}>{latestComparisonSummary}</Text>
        </Card>
      ) : null}

      {!showUploadSheet && !showProcessing ? (
        <Pressable style={[styles.fab, { backgroundColor: sectionHighlight }]} onPress={() => setShowUploadSheet(true)}>
          <Ionicons name="cloud-upload-outline" size={24} color={colors.white} />
        </Pressable>
      ) : null}

      <Modal
        visible={showUploadSheet}
        animationType="slide"
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        hardwareAccelerated
        onRequestClose={() => setShowUploadSheet(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable style={styles.sheetDismissZone} onPress={() => setShowUploadSheet(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Health Report</Text>
            <Text style={styles.sheetSubtitle}>Fiteatsy will analyse all parameters automatically</Text>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScrollContent}>
              <View style={styles.uploadMethodRow}>
                {[
                  { key: 'camera', icon: 'camera-outline', title: 'Take Photo', copy: 'Photograph your report' },
                  { key: 'gallery', icon: 'image-outline', title: 'Choose Photo', copy: 'Select from library' },
                  { key: 'pdf', icon: 'document-outline', title: 'Upload PDF', copy: 'From your files' }
                ].map((item) => {
                  const active = uploadType === (item.key as 'camera' | 'gallery' | 'pdf');
                  return (
                    <Pressable
                      key={item.key}
                      style={[styles.uploadMethodCard, active && styles.uploadMethodCardActive]}
                      onPress={() => pickUpload(item.key as 'camera' | 'gallery' | 'pdf')}
                    >
                      <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={26} color={isLight ? palette.teal : sectionHighlight} />
                      <Text style={styles.uploadMethodTitle}>{item.title}</Text>
                      <Text style={styles.uploadMethodCopy}>{item.copy}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {uploadBusy ? (
                <View style={styles.uploadStatusRow}>
                  <ActivityIndicator size="small" color={isLight ? palette.teal : sectionHighlight} />
                  <Text style={styles.uploadStatusText}>Preparing file for upload...</Text>
                </View>
              ) : null}

              {selectedUpload ? (
                <View style={styles.uploadStatusCard}>
                  <Text style={styles.uploadStatusTitle}>Ready to analyze</Text>
                  <Text style={styles.uploadStatusText}>
                    {selectedUpload.name} · {bytesToLabel(selectedUpload.sizeBytes)} · {selectedUpload.source.toUpperCase()}
                  </Text>
                </View>
              ) : null}

              {uploadError ? (
                <View style={styles.uploadErrorCard}>
                  <Text style={styles.uploadErrorText}>{uploadError}</Text>
                  {lastPickSource ? (
                    <Pressable style={styles.retryBtn} onPress={() => pickUpload(lastPickSource)}>
                      <Text style={styles.retryBtnText}>Retry File Pick</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={styles.retryBtn} onPress={startAnalysis}>
                    <Text style={styles.retryBtnText}>Retry Analysis</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Report Date</Text>
                <Pressable style={styles.fieldRow} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={16} color={palette.textMid} />
                  <Text style={styles.inputText}>{reportDate}</Text>
                </Pressable>
                {showDatePicker ? (
                  <View style={styles.pickerWrap}>
                    <DateTimePicker
                      value={reportDateValue}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onDatePicked}
                      maximumDate={new Date()}
                    />
                    {Platform.OS === 'ios' ? (
                      <Pressable style={styles.pickerDoneBtn} onPress={() => setShowDatePicker(false)}>
                        <Text style={styles.pickerDoneText}>Done</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Lab / Hospital Name</Text>
                <View style={styles.fieldRow}>
                  <Ionicons name="business-outline" size={16} color={palette.textMid} />
                  <TextInput
                    value={labName}
                    onChangeText={setLabName}
                    placeholder="Auto-filled from report (editable)"
                    placeholderTextColor={palette.textLight}
                    style={styles.inputText}
                  />
                </View>
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Report Type</Text>
                <View style={styles.readonlyChip}>
                  <Text style={styles.readonlyChipText}>Full Body Checkup</Text>
                </View>
              </View>

              <View style={styles.privacyRow}>
                <Ionicons name="lock-closed-outline" size={12} color={isLight ? palette.teal : sectionHighlight} />
                <Text style={styles.privacyText}>Your reports are encrypted. Never shared with your employer.</Text>
              </View>

              <Pressable
                style={[styles.primaryBtn, (!selectedUpload || uploadBusy || analysisLaunching) && styles.primaryBtnDisabled]}
                onPress={startAnalysis}
              >
                <Text style={styles.primaryBtnText}>{analysisLaunching ? 'Starting analysis...' : 'Start Analysis'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showProcessing} animationType="fade" transparent>
        <View style={styles.processingScreen}>
          <View style={styles.processingCenter}>
            <View style={styles.processingLogo}>
              <MaterialCommunityIcons name="brain" size={36} color={colors.white} />
            </View>
            <Text style={styles.processingTitle}>Fiteatsy is reading your report</Text>

            <View style={styles.processingSteps}>
              {stepText.map((step, index) => {
                const done = processingStep > index;
                const active = processingStep === index;
                return (
                  <View key={step} style={styles.stepRow}>
                    <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                      {done ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
                    </View>
                    <Text style={[styles.stepText, active && styles.stepTextActive]}>
                      {step} {done ? 'Done' : ''}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.processingTrack}>
              <Animated.View style={[styles.processingFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.processingHint}>This takes about 15–20 seconds</Text>
            <ActivityIndicator color={palette.purple} style={{ marginTop: 8 }} />
            <Pressable
              style={styles.processingCancelBtn}
              onPress={() => {
                setShowProcessing(false);
                setAnalysisLaunching(false);
                setShowUploadSheet(true);
                setUploadError('Analysis cancelled. You can retry now.');
              }}
            >
              <Text style={styles.processingCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showUploadPreparing} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.processingScreen}>
          <View style={styles.processingCenter}>
            <View style={styles.processingLogo}>
              <Ionicons name="cloud-upload-outline" size={34} color={colors.white} />
            </View>
            <Text style={styles.processingTitle}>Preparing Report Upload</Text>
            <Text style={styles.processingHint}>Optimizing and validating file...</Text>
            <View style={styles.processingTrack}>
              <View style={[styles.processingFill, { width: `${preparingProgress}%` }]} />
            </View>
            <Text style={styles.processingHint}>{preparingProgress}% complete</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={showAnalysisReview} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.reviewBackdrop}>
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Analysis Review</Text>
            <Text style={styles.reviewSubtitle}>Please confirm to update My Health numbers.</Text>

            <View style={styles.reviewRow}>
              <Text style={styles.reviewGood}>Good: {analysisReview?.goodParameters.length ?? 0}</Text>
              <Text style={styles.reviewBad}>Needs Attention: {analysisReview?.attentionParameters.length ?? 0}</Text>
            </View>

            {analysisReview?.attentionParameters.length ? (
              <View style={styles.reviewList}>
                {analysisReview.attentionParameters.slice(0, 5).map((parameter) => (
                  <Text key={`${parameter.name}-${parameter.value}`} style={styles.reviewListItem}>
                    • {parameter.name}: {parameter.value} {parameter.unit} (Range {parameter.referenceRange})
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.reviewAllGood}>All tracked parameters are in normal range.</Text>
            )}

            <Text style={styles.reviewSummaryText}>{analysisReview?.summary}</Text>

            <View style={styles.reviewActions}>
              <Pressable
                style={styles.reviewSecondaryBtn}
                onPress={() => {
                  setShowAnalysisReview(false);
                  setAnalysisReview(null);
                }}
              >
                <Text style={styles.reviewSecondaryText}>Dismiss</Text>
              </Pressable>
              <Pressable style={styles.reviewPrimaryBtn} onPress={applyAnalysisReview}>
                <Text style={styles.reviewPrimaryText}>Confirm Update</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: 120,
    backgroundColor: palette.bg
  },
  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: palette.border
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.textDark
  },
  heroCard: {
    borderRadius: 16,
    backgroundColor: palette.card,
    borderColor: palette.border,
    marginBottom: 12,
    padding: 20,
    overflow: 'hidden'
  },
  heroCardInteractive: {
    shadowColor: colors.blueDark,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8
  },
  heroCardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  heroToggleChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 100,
    backgroundColor: colors.surfaceAccent,
    borderWidth: 1,
    borderColor: colors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  heroToggleText: {
    fontSize: 12,
    color: palette.teal,
    fontWeight: '600'
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  heroLabel: {
    fontSize: 13,
    color: palette.textMid
  },
  heroUpdated: {
    fontSize: 12,
    color: palette.textLight
  },
  heroScore: {
    fontSize: 56,
    marginTop: 4,
    lineHeight: 62,
    fontWeight: '400'
  },
  heroSub: {
    fontSize: 13,
    color: palette.textMid
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceTint,
    marginVertical: 12
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  categoryMetricCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  categoryMetricCardDark: {
    borderColor: colors.strokeStrong,
    backgroundColor: colors.cardRaised
  },
  categoryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  categoryIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6
  },
  categoryName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: palette.textMid
  },
  categoryScoreBadge: {
    fontSize: 16,
    fontWeight: '700'
  },
  miniTrack: {
    height: 7,
    borderRadius: 100,
    backgroundColor: colors.surfaceTint,
    overflow: 'hidden'
  },
  miniFill: {
    height: '100%'
  },
  categoryScore: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: palette.textDark
  },
  categoryCaption: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted
  },
  categoryCaptionDark: {
    color: colors.textMuted
  },
  heroBottomRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  lastReport: {
    fontSize: 12,
    color: palette.textMid,
    flex: 1,
    paddingRight: 8
  },
  seeAll: {
    fontSize: 12,
    color: palette.teal,
    fontWeight: '600'
  },
  nuetraCard: {
    borderRadius: 16,
    borderLeftWidth: 3,
    borderLeftColor: palette.purple,
    backgroundColor: palette.purpleLight,
    borderColor: colors.stroke,
    marginBottom: 12
  },
  nuetraBadge: {
    alignSelf: 'flex-start',
    borderRadius: 100,
    backgroundColor: palette.purple,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8
  },
  nuetraBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600'
  },
  nuetraTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6
  },
  nuetraCopy: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.textSecondary,
    marginBottom: 10
  },
  askNuetra: {
    color: palette.purple,
    fontSize: 13,
    fontWeight: '600'
  },
  shimmerBlock: {
    position: 'relative',
    gap: 8,
    marginBottom: 10,
    overflow: 'hidden'
  },
  shimmerLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(131,113,206,0.22)',
    width: '100%'
  },
  shimmerSweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 86,
    backgroundColor: 'rgba(0,0,0,0.29)',
    opacity: 0.7
  },
  detailCard: {
    borderRadius: 16,
    borderColor: palette.border,
    backgroundColor: colors.cardRaised,
    marginBottom: 12
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.textDark,
    marginBottom: 10
  },
  detailEmpty: {
    color: palette.textMid,
    fontSize: 13
  },
  parameterRow: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8
  },
  parameterTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  parameterName: {
    color: palette.textDark,
    fontSize: 14,
    fontWeight: '600'
  },
  parameterValue: {
    color: palette.coral,
    fontSize: 14,
    fontWeight: '700'
  },
  parameterRange: {
    marginTop: 3,
    color: palette.textMid,
    fontSize: 12
  },
  parameterInsight: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18
  },
  actionCard: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.cardRaised
  },
  actionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4
  },
  actionPriority: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.teal,
    backgroundColor: palette.tealLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 100
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textDark,
    flex: 1
  },
  actionDetail: {
    fontSize: 13,
    color: palette.textMid,
    lineHeight: 19
  },
  actionDoctor: {
    marginTop: 5,
    color: palette.coral,
    fontSize: 12,
    fontWeight: '600'
  },
  crossRow: {
    borderRadius: 12,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: 10,
    marginBottom: 8
  },
  crossConnection: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
    marginBottom: 3
  },
  crossMeta: {
    fontSize: 12,
    color: colors.textSecondary
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.textDark
  },
  countChip: {
    borderRadius: 100,
    backgroundColor: palette.tealLight,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  countChipText: {
    color: palette.teal,
    fontSize: 12,
    fontWeight: '700'
  },
  reportList: {
    gap: 10
  },
  swipeWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16
  },
  deleteReveal: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 88,
    backgroundColor: '#D04053',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  deleteText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600'
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  reportAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.teal,
    alignItems: 'center',
    justifyContent: 'center'
  },
  reportAvatarText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700'
  },
  reportMiddle: {
    flex: 1,
    paddingHorizontal: 10
  },
  reportLab: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textDark
  },
  reportDate: {
    fontSize: 13,
    color: palette.textMid,
    marginTop: 1
  },
  reportMeta: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500'
  },
  metaBad: {
    color: palette.coral
  },
  metaGood: {
    color: palette.teal
  },
  reportRight: {
    alignItems: 'center',
    gap: 3
  },
  scoreBadge: {
    minWidth: 46,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  scoreBadgeText: {
    fontSize: 17,
    fontWeight: '700'
  },
  trend: {
    fontSize: 16,
    fontWeight: '700'
  },
  trendUp: {
    color: '#60AF00'
  },
  trendDown: {
    color: palette.coral
  },
  trendFlat: {
    color: palette.textMid
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.teal,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,10,16,0.74)',
    justifyContent: 'flex-end'
  },
  sheetDismissZone: {
    flex: 1
  },
  sheet: {
    backgroundColor: colors.cardRaised,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    maxHeight: '78%',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16
  },
  sheetScrollContent: {
    paddingBottom: 10
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 4,
    backgroundColor: '#2A2A2A',
    marginBottom: 10
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary
  },
  sheetSubtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: colors.textSecondary
  },
  uploadMethodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  uploadMethodCard: {
    width: '31%',
    minHeight: 132,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: colors.card
  },
  uploadMethodCardActive: {
    borderColor: palette.teal,
    backgroundColor: palette.tealLight
  },
  uploadMethodTitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center'
  },
  uploadMethodCopy: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center'
  },
  uploadStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8
  },
  uploadStatusCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8
  },
  uploadStatusTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary
  },
  uploadStatusText: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary
  },
  uploadErrorCard: {
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8
  },
  uploadErrorText: {
    fontSize: 12,
    color: colors.danger,
    lineHeight: 16
  },
  retryBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 5
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger
  },
  fieldWrap: {
    marginBottom: 10
  },
  fieldLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6
  },
  fieldRow: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: colors.cardMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10
  },
  pickerWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: colors.cardMuted,
    alignItems: 'flex-start',
    overflow: 'hidden'
  },
  pickerDoneBtn: {
    alignSelf: 'flex-end',
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: colors.card
  },
  pickerDoneText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary
  },
  inputText: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 0
  },
  readonlyChip: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  readonlyChipText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600'
  },
  privacyRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary
  },
  primaryBtn: {
    marginTop: 14,
    height: 50,
    borderRadius: 12,
    backgroundColor: palette.teal,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryBtnDisabled: {
    opacity: 0.45
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600'
  },
  processingScreen: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  processingCenter: {
    width: '86%',
    alignItems: 'center'
  },
  processingLogo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.purple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: palette.textDark,
    marginBottom: 14,
    textAlign: 'center'
  },
  processingSteps: {
    width: '100%',
    marginBottom: 14,
    gap: 8
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepDotActive: {
    borderColor: palette.teal,
    backgroundColor: palette.tealLight
  },
  stepDotDone: {
    borderColor: '#60AF00',
    backgroundColor: '#60AF00'
  },
  stepText: {
    fontSize: 14,
    color: palette.textMid
  },
  stepTextActive: {
    color: palette.textDark,
    fontWeight: '600'
  },
  processingTrack: {
    width: '100%',
    height: 4,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    overflow: 'hidden'
  },
  processingFill: {
    height: '100%',
    backgroundColor: palette.teal
  },
  processingHint: {
    marginTop: 10,
    fontSize: 12,
    color: palette.textLight
  },
  processingCancelBtn: {
    marginTop: 14,
    height: 36,
    minWidth: 108,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card
  },
  processingCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary
  },
  reviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,10,16,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  reviewCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardRaised,
    padding: 16
  },
  reviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary
  },
  reviewSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary
  },
  reviewRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8
  },
  reviewGood: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.success
  },
  reviewBad: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.danger
  },
  reviewList: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.stroke
  },
  reviewListItem: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary
  },
  reviewAllGood: {
    marginTop: 10,
    fontSize: 12,
    color: colors.success
  },
  reviewSummaryText: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary
  },
  reviewActions: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10
  },
  reviewSecondaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card
  },
  reviewSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary
  },
  reviewPrimaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: palette.teal,
    alignItems: 'center',
    justifyContent: 'center'
  },
  reviewPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white
  },
  screenContentDark: {
    backgroundColor: colors.bgPrimary
  },
  headerIconBtnDark: {
    backgroundColor: colors.card,
    borderColor: colors.stroke
  },
  headerTitleDark: {
    color: colors.textPrimary
  },
  heroCardDark: {
    backgroundColor: colors.cardMuted,
    borderColor: colors.stroke
  },
  heroLabelDark: {
    color: colors.textSecondary
  },
  heroUpdatedDark: {
    color: colors.textMuted
  },
  heroSubDark: {
    color: '#939393'
  },
  heroToggleChipDark: {
    backgroundColor: '#151515',
    borderColor: '#C9CFD4'
  },
  heroToggleTextDark: {
    color: '#F5E1E1'
  },
  dividerDark: {
    backgroundColor: '#2A2A2A'
  },
  categoryNameDark: {
    color: '#939393'
  },
  miniTrackDark: {
    backgroundColor: '#2A2A2A'
  },
  categoryScoreDark: {
    color: colors.white
  },
  lastReportDark: {
    color: '#939393'
  },
  seeAllDark: {
    color: '#C9CFD4'
  },
  nuetraCardDark: {
    backgroundColor: colors.card,
    borderColor: '#C9CFD4'
  },
  nuetraTitleDark: {
    color: '#F5E1E1'
  },
  nuetraCopyDark: {
    color: '#C9CFD4'
  },
  askNuetraDark: {
    color: '#C9CFD4'
  },
  detailCardDark: {
    backgroundColor: '#151515',
    borderColor: colors.stroke
  },
  detailTitleDark: {
    color: colors.white
  },
  detailEmptyDark: {
    color: '#BDB6D9'
  },
  parameterRowDark: {
    borderColor: '#C9CFD4',
    backgroundColor: '#151515'
  },
  parameterNameDark: {
    color: '#F5E1E1'
  },
  parameterRangeDark: {
    color: '#BDB6D9'
  },
  parameterInsightDark: {
    color: '#C9CFD4'
  },
  actionCardDark: {
    borderColor: '#C9CFD4',
    backgroundColor: '#151515'
  },
  actionTitleDark: {
    color: colors.white
  },
  actionDetailDark: {
    color: '#939393'
  },
  crossRowDark: {
    backgroundColor: '#151515',
    borderColor: '#C9CFD4'
  },
  crossConnectionDark: {
    color: '#F5E1E1'
  },
  crossMetaDark: {
    color: '#939393'
  },
  sectionTitleDark: {
    color: colors.white
  },
  countChipDark: {
    backgroundColor: '#151515'
  },
  reportRowDark: {
    borderColor: '#C9CFD4',
    backgroundColor: '#151515'
  },
  reportLabDark: {
    color: colors.white
  },
  reportDateDark: {
    color: '#939393'
  },
  reportMetaDark: {
    color: '#C9CFD4'
  },
  trendDark: {
    opacity: 0.95
  }
});
