import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { AppBackButton } from '../../components/AppBackButton';
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
import { buildHealthProfileCompletion } from '../../utils/healthProfileCompletion';
import { resolveClientName } from '../../utils/clientIdentity';
import { BUSINESS_TIME_ZONE, toDayKey } from '../../utils/date';
import {
  deleteAllAnalyzedReports,
  deleteAnalyzedReport,
  getCurrentReportComparison,
  listAnalyzedReports,
  reanalyzeReport,
  ReportAnalysisResponse,
  ReportComparisonItem,
  ReportComparisonProjection,
  ReportDto,
  uploadAndAnalyzeReport
} from '../../services/reportUploadService';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type CategoryKey = 'Blood' | 'Metabolic' | 'Organs' | 'Thyroid' | 'Vitamins';

type ReportItem = {
  id: string;
  labName: string;
  date: string;
  parameters: number;
  abnormal: number;
  score: number | null;
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
  biomarkerObservations: NonNullable<ReportAnalysisResponse['biomarkerObservations']>;
  healthScores: NonNullable<ReportAnalysisResponse['healthScores']>;
};

type ProcessingPhase = 'uploading' | 'uploaded' | 'processing' | 'extraction' | 'validation' | 'completed' | 'failed';

const palette = {
  teal: '#2E6B00',
  tealLight: '#EEF4EA',
  amber: '#8A6400',
  amberLight: 'rgba(245, 181, 68, 0.18)',
  coral: '#B4233B',
  coralLight: 'rgba(208, 64, 83, 0.12)',
  purple: '#2E6B00',
  purpleLight: '#F4F8F1',
  bg: '#F3F6FA',
  card: '#FFFFFF',
  border: '#C7D2DF',
  textDark: '#0F172A',
  textMid: '#1E293B',
  textLight: '#475569'
} as const;

const categoryMeta: Array<{ key: CategoryKey; icon: keyof typeof Ionicons.glyphMap; color: string }> = [
  { key: 'Blood', icon: 'water', color: colors.pink },
  { key: 'Metabolic', icon: 'flame', color: colors.warning },
  { key: 'Organs', icon: 'heart', color: colors.pink },
  { key: 'Thyroid', icon: 'leaf', color: colors.blueDark },
  { key: 'Vitamins', icon: 'sunny', color: colors.warning }
];

const scoreColor = (score: number | null) => {
  if (score == null) {
    return palette.textMid;
  }
  if (score >= 80) {
    return palette.teal;
  }
  if (score >= 60) {
    return palette.amber;
  }
  return palette.coral;
};

const scorePillBg = (score: number | null) => {
  if (score == null) {
    return '#E2E8F0';
  }
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

const toReportItem = (
  analysis: ReportAnalysisResponse,
  fallback: { id?: string; source?: 'camera' | 'gallery' | 'pdf'; createdAtISO?: string } = {}
): ReportItem => {
  const abnormal = analysis.parameters.filter((parameter) => parameter.status !== 'normal').length;
  return {
    id: analysis.reportId ?? fallback.id ?? `rep-${Date.now()}`,
    labName: analysis.labName,
    date: analysis.reportDate,
    parameters: analysis.parameters.length,
    abnormal,
    score: analysis.score,
    categoryScores: analysis.categoryScores ?? buildCategoryScores(analysis.parameters),
    parametersData: analysis.parameters,
    uploadSource: fallback.source,
    uploadedAtISO: fallback.createdAtISO ?? new Date().toISOString()
  };
};

const reportDtoToItem = (report: ReportDto) => {
  if (!report.analysis || (report.status !== 'COMPLETED' && report.status !== 'PUBLISHED' && report.status !== 'PARTIALLY_VALIDATED')) return null;
  return toReportItem(
    {
      ...report.analysis,
      reportId: report.id,
      status: report.status
    },
    { id: report.id, source: report.source, createdAtISO: report.createdAtISO }
  );
};

const buildSpecificFallbackSummary = (_parameters: ReportParameter[], _userName?: string) =>
  'Clinical report guidance is temporarily unavailable. Verified report values remain visible and unchanged; retry when the guidance service is available.';

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
              <Text style={[styles.scoreBadgeText, { color: scoreColor(report.score) }]}>{report.score ?? 'Review'}</Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
};

const comparisonValue = (item: ReportComparisonItem, side: 'previous' | 'latest') => {
  const reading = item[side];
  return reading ? `${reading.value} ${reading.unit}`.trim() : 'Not reported';
};

const ComparisonMarkerRow = ({ item, tone }: { item: ReportComparisonItem; tone: 'good' | 'attention' | 'neutral' }) => (
  <View style={styles.comparisonMarkerRow}>
    <View style={styles.comparisonMarkerCopy}>
      <Text style={styles.comparisonMarkerName}>{item.displayName}</Text>
      <Text style={styles.comparisonMarkerValues}>
        {comparisonValue(item, 'previous')} → {comparisonValue(item, 'latest')}
      </Text>
    </View>
    <Text
      style={[
        styles.comparisonMarkerStatus,
        tone === 'good' ? styles.comparisonGood : tone === 'attention' ? styles.comparisonAttention : styles.comparisonNeutral
      ]}
    >
      {tone === 'good' ? 'Improved' : tone === 'attention' ? 'Needs attention' : 'Changed'}
    </Text>
  </View>
);

export const ReportsScreen = () => {
  const navigation = useNavigation<Nav>();
  const { wellness, onboarding, checkIns, themeMode, authSession } = useAppContext();
  const clientName = resolveClientName(authSession?.user.name);
  const isLight = themeMode === 'light';
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [comparison, setComparison] = useState<ReportComparisonProjection | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsLoadError, setReportsLoadError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'latest' | 'oldest' | 'lab' | 'type'>('latest');
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>('uploading');
  const [processingPercent, setProcessingPercent] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('Uploading Report');
  const [processingStatus, setProcessingStatus] = useState('UPLOADED');
  const [processingIntent, setProcessingIntent] = useState<'upload' | 'reanalysis' | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const initialReportDate = useMemo(() => new Date(), []);
  const [reportDate, setReportDate] = useState(() =>
    initialReportDate.toLocaleDateString('en-GB', {
      timeZone: BUSINESS_TIME_ZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  );
  const [reportDateValue, setReportDateValue] = useState<Date>(() =>
    new Date(`${toDayKey(initialReportDate)}T00:00:00.000+05:30`)
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [labName, setLabName] = useState('');
  const [uploadType, setUploadType] = useState<'camera' | 'gallery' | 'pdf' | null>(null);
  const [selectedUpload, setSelectedUpload] = useState<PickedUpload | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [reanalysisReportId, setReanalysisReportId] = useState<string | null>(null);
  const [reanalysisBusy, setReanalysisBusy] = useState(false);
  const [showUploadPreparing, setShowUploadPreparing] = useState(false);
  const [preparingProgress, setPreparingProgress] = useState(0);
  const [analysisLaunching, setAnalysisLaunching] = useState(false);
  const [lastPickSource, setLastPickSource] = useState<'camera' | 'gallery' | 'pdf' | null>(null);
  const [analysisReview, setAnalysisReview] = useState<AnalysisReviewState | null>(null);
  const [showAnalysisReview, setShowAnalysisReview] = useState(false);

  const [nuetraSummary, setNuetraSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [parameterInsights, setParameterInsights] = useState<Record<string, string>>({});
  const [actionPlan, setActionPlan] = useState<NuetraActionItem[]>([]);
  const [crossInsights, setCrossInsights] = useState<NuetraCrossInsight[]>([]);
  const [heroExpanded, setHeroExpanded] = useState(true);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState('');
  const heroAnim = useRef(new Animated.Value(1)).current;
  const activeUploadController = useRef<AbortController | null>(null);

  const shimmer = useRef(new Animated.Value(0)).current;
  const authenticatedReportOwnerKey = authSession
    ? `${authSession.accountId}:${authSession.client.fiteatsyClientId}:${authSession.sessionId}`
    : 'signed-out';

  const latestReport = reports[0] ?? null;
  const isReportBackedScore = latestReport?.score != null;
  const sortedReports = useMemo(() => {
    const next = [...reports];
    if (sortMode === 'oldest') {
      return next.reverse();
    }
    if (sortMode === 'lab') {
      return next.sort((a, b) => a.labName.localeCompare(b.labName));
    }
    if (sortMode === 'type') {
      return next.sort((a, b) => (a.uploadSource ?? 'manual').localeCompare(b.uploadSource ?? 'manual'));
    }
    return next;
  }, [reports, sortMode]);
  const overallScore = latestReport?.score ?? (wellness.availability === 'available' ? wellness.wellnessScore : null);
  const totalParams = latestReport?.parameters ?? 0;
  const healthScoreLabel = isReportBackedScore ? 'Report-backed Health Score' : 'Wellness score unavailable';
  const healthScoreDescription = isReportBackedScore
    ? `out of 100 · ${totalParams} lab parameters analysed`
    : 'sync current wellness data or upload a publishable lab report';
  const sectionHighlight = overallScore == null ? colors.textMuted : overallScore >= 80 ? colors.success : overallScore >= 60 ? colors.warning : colors.danger;
  const profileCompletion = useMemo(
    () => buildHealthProfileCompletion(onboarding, null, reports.length),
    [onboarding, reports.length]
  );
  const topMissingProfileFields = profileCompletion.missingItems.slice(0, 4);

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
  const reportDateRange = useMemo(() => {
    if (reports.length === 0) return 'No reports';
    const dates = reports.map((report) => report.date).filter(Boolean);
    return dates.length > 1 ? `${dates[dates.length - 1]} to ${dates[0]}` : dates[0] ?? 'Selected reports';
  }, [reports]);

  const clearReportDerivedState = () => {
    setReports([]);
    setComparison(null);
    setComparisonError(null);
    setReportsLoadError(null);
    setAnalysisReview(null);
    setShowAnalysisReview(false);
    setNuetraSummary('');
    setParameterInsights({});
    setActionPlan([]);
    setCrossInsights([]);
    setShowHistory(false);
  };

  const refreshReportData = async () => {
    setReportsLoadError(null);
    const reportDtos = await listAnalyzedReports();
    const hydratedReports = reportDtos.reduce<ReportItem[]>((acc, dto) => {
      const item = reportDtoToItem(dto);
      return item ? [...acc, item] : acc;
    }, []);
    setReports(hydratedReports);
    try {
      setComparison(await getCurrentReportComparison());
      setComparisonError(null);
    } catch {
      setComparison(null);
      setComparisonError('Comparison is temporarily unavailable. Your latest report remains available.');
    }
  };

  const reloadReportsAfterDelete = async () => {
    clearReportDerivedState();
    setReportsLoading(true);
    try {
      await refreshReportData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refresh reports.';
      setReportsLoadError(message);
    } finally {
      setReportsLoading(false);
    }
  };

  const confirmDeleteReport = (report: ReportItem) => {
    Alert.alert(
      'Delete this report?',
      'This can be undone within 30 days by support. The report will disappear from health score, trends, AI summary, and action plan immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void handleDeleteReport(report);
          }
        }
      ]
    );
  };

  const handleDeleteReport = async (report: ReportItem) => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deleteAnalyzedReport(report.id);
      await reloadReportsAfterDelete();
      Alert.alert('Report deleted', 'This report is hidden from your health insights and can be restored by support within 30 days.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete report.';
      Alert.alert('Delete failed', message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDeleteAllReports = async () => {
    if (deleteBusy || deleteAllConfirmation.trim().toUpperCase() !== 'DELETE') return;
    setDeleteBusy(true);
    try {
      const result = await deleteAllAnalyzedReports();
      setShowDeleteAllConfirm(false);
      setDeleteAllConfirmation('');
      await reloadReportsAfterDelete();
      Alert.alert(
        'Reports deleted',
        `${result.deletedCount} report${result.deletedCount === 1 ? '' : 's'} hidden from your health insights. Support can restore within ${result.recoveryWindowDays} days.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete reports.';
      Alert.alert('Delete all failed', message);
    } finally {
      setDeleteBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    clearReportDerivedState();
    if (!authSession) {
      setReportsLoading(false);
      return () => {
        active = false;
      };
    }
    setReportsLoading(true);
    refreshReportData()
      .catch((error) => {
        if (!active) return;
        setReportsLoadError(error instanceof Error ? error.message : 'Unable to load report history.');
      })
      .finally(() => {
        if (active) setReportsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authenticatedReportOwnerKey]);

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
    setReanalysisReportId(null);
    setUploadType(selectedUpload.source);
    setAnalysisLaunching(true);
    setProcessingPhase('uploading');
    setProcessingPercent(8);
    setProcessingMessage('Uploading Report');
    setProcessingStatus('UPLOADED');
    setProcessingIntent('upload');
    setShowUploadSheet(false);
    setShowProcessing(true);
  };

  const applyAnalysisReview = () => {
    if (!analysisReview) return;
    setReports((prev) => [analysisReview.report, ...prev.filter((item) => item.id !== analysisReview.report.id)]);
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
        const summaryPromise = generateNuetraSummary(latestReport.id, clientName);

        const insightPairsPromise = Promise.all(
          abnormalParameters.map(async (parameter) => {
            const insight = await generateParameterInsight(latestReport.id, parameter);
            return [parameter.name, insight] as const;
          })
        );

        const actionPlanPromise = generateActionPlan(latestReport.id);
        const crossInsightsPromise =
          checkIns.length > 0 ? generateCrossReferenceInsights(latestReport.id, checkIns) : Promise.resolve([]);

        const [summary, insightPairs, actions, cross] = await Promise.all([
          summaryPromise,
          insightPairsPromise,
          actionPlanPromise,
          crossInsightsPromise
        ]);

        if (cancelled) {
          return;
        }

        setNuetraSummary(summary || buildSpecificFallbackSummary(latestReport.parametersData, clientName));
        setParameterInsights(Object.fromEntries(insightPairs));
        setActionPlan(actions);
        setCrossInsights(cross);
      } catch {
        if (!cancelled) {
          setNuetraSummary(buildSpecificFallbackSummary(latestReport.parametersData, clientName));
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
  }, [abnormalParameters, checkIns, clientName, latestReport]);

  useEffect(() => {
    if (!showProcessing || processingIntent !== 'upload') {
      return;
    }

    setProcessingStep(0);
    setProcessingPhase('uploading');
    setProcessingPercent(8);
    setProcessingMessage('Uploading Report');
    setProcessingStatus('UPLOADED');
    let cancelled = false;
    const controller = new AbortController();
    activeUploadController.current = controller;
    const failSafeTimeout = setTimeout(() => {
      if (cancelled) return;
      controller.abort();
      setProcessingPhase('failed');
      setProcessingMessage('Processing failed. Analysis is taking too long.');
      setShowProcessing(false);
      setAnalysisLaunching(false);
      setShowUploadSheet(true);
      setUploadError('Analysis is taking too long. Please retry. If issue continues, restart backend and app.');
    }, 125000);

    const execute = async () => {
      try {
        if (!selectedUpload) throw new Error('No report file selected.');
        const analysis: ReportAnalysisResponse = await uploadAndAnalyzeReport({
          fileUri: selectedUpload.uri,
          fileName: selectedUpload.name,
          mimeType: selectedUpload.mimeType,
          source: selectedUpload.source,
          reportDate,
          labName,
          signal: controller.signal,
          onProgress: (event) => {
            if (cancelled) return;
            if (event.reportId) {
              setReanalysisReportId(event.reportId);
            }
            setProcessingPhase(event.stage);
            setProcessingPercent(event.percent);
            setProcessingMessage(event.message);
            setProcessingStatus(event.status ?? event.stage.toUpperCase());
            const statusStep: Record<string, number> = {
              UPLOADED: 0,
              PROCESSING: 1,
              DOCUMENT_ANALYSIS_COMPLETED: 2,
              EXTRACTION_COMPLETED: 3,
              VALIDATION_PENDING: 4,
              VALIDATION_COMPLETED: 4,
              PRIORITIZATION_COMPLETED: 5,
              SCORE_GENERATED: 6,
              PUBLISHED: 6,
              PARTIALLY_VALIDATED: 6
            };
            const nextStep = statusStep[event.status ?? ''] ?? (event.stage === 'failed' ? 4 : 1);
            setProcessingStep(nextStep);
          }
        });

        if (cancelled) return;
        setProcessingPhase('completed');
        setProcessingPercent(100);
        setProcessingMessage(
          analysis.status === 'PARTIALLY_VALIDATED' ? 'Report analysed. Some biomarkers need review.' : 'Report analysis completed.'
        );
        setProcessingStatus(analysis.status === 'PARTIALLY_VALIDATED' ? 'PARTIALLY_VALIDATED' : 'PUBLISHED');
        setProcessingStep(6);
        setReportDate(analysis.reportDate);
        setLabName(analysis.labName);

        const previous = reports[0] ?? null;
        const newReport = toReportItem(analysis, { id: analysis.reportId, source: selectedUpload.source });

        const prevText = previous ? `Compared with ${previous.date} (${previous.labName}), ` : '';
        const comparisonSummary = previous
          ? `${prevText}${analysis.summary}`
          : 'This is your first health report. Future reports will be compared against this baseline.';
        setAnalysisReview({
          report: newReport,
          summary: analysis.summary,
          comparisonSummary,
          actionPlan: analysis.actionPlan.map((item) => ({ ...item, requiresDoctor: false })),
          goodParameters: analysis.parameters.filter((parameter) => parameter.status === 'normal'),
          attentionParameters: analysis.parameters.filter((parameter) => parameter.status !== 'normal'),
          biomarkerObservations: analysis.biomarkerObservations ?? [],
          healthScores: analysis.healthScores ?? []
        });
        setShowAnalysisReview(true);
        setReanalysisReportId(null);
        refreshReportData().catch(() => undefined);
        setShowProcessing(false);
        setAnalysisLaunching(false);
        setUploadType(null);
        setSelectedUpload(null);
        setShowUploadSheet(false);
        setProcessingIntent(null);
      } catch (error) {
        if (cancelled) return;
        setProcessingPhase('failed');
        setProcessingMessage('Processing failed');
        setProcessingStatus('FAILED');
        setShowProcessing(false);
        setAnalysisLaunching(false);
        setShowUploadSheet(true);
        setProcessingIntent(null);
        const detail = error instanceof Error ? error.message : 'Analysis failed. Please retry with a clear report.';
        setUploadError(`Some information could not be confidently analysed. ${detail}`);
      } finally {
        activeUploadController.current = null;
        clearTimeout(failSafeTimeout);
      }
    };
    execute();

    return () => {
      cancelled = true;
      controller.abort();
      if (activeUploadController.current === controller) {
        activeUploadController.current = null;
      }
      clearTimeout(failSafeTimeout);
    };
  }, [showProcessing, processingIntent]);

  const startReanalysis = async () => {
    if (!reanalysisReportId || reanalysisBusy) return;
    const controller = new AbortController();
    try {
      setReanalysisBusy(true);
      setUploadError(null);
      setProcessingPhase('processing');
      setProcessingPercent(45);
      setProcessingMessage('Re-analysing report with document intelligence...');
      setProcessingStatus('REANALYSIS');
      setProcessingIntent('reanalysis');
      setProcessingStep(2);
      setShowUploadSheet(false);
      setShowProcessing(true);
      const analysis = await reanalyzeReport(reanalysisReportId, controller.signal);
      setProcessingPhase('completed');
      setProcessingPercent(100);
      setProcessingMessage(
        analysis.status === 'PARTIALLY_VALIDATED' ? 'Report re-analysed. Some biomarkers need review.' : 'Report analysis completed.'
      );
      setProcessingStatus(analysis.status === 'PARTIALLY_VALIDATED' ? 'PARTIALLY_VALIDATED' : 'PUBLISHED');
      setProcessingStep(6);

      const previous = reports.find((report) => report.id !== analysis.reportId) ?? reports[0] ?? null;
      const newReport = toReportItem(analysis, { id: analysis.reportId, source: selectedUpload?.source });
      const comparisonSummary = previous
        ? `Compared with ${previous.date} (${previous.labName}), ${analysis.summary}`
        : 'This is your first health report. Future reports will be compared against this baseline.';
      setAnalysisReview({
        report: newReport,
        summary: analysis.summary,
        comparisonSummary,
        actionPlan: analysis.actionPlan.map((item) => ({ ...item, requiresDoctor: false })),
        goodParameters: analysis.parameters.filter((parameter) => parameter.status === 'normal'),
        attentionParameters: analysis.parameters.filter((parameter) => parameter.status !== 'normal'),
        biomarkerObservations: analysis.biomarkerObservations ?? [],
        healthScores: analysis.healthScores ?? []
      });
      setShowAnalysisReview(true);
      await refreshReportData();
      setReanalysisReportId(null);
      setShowProcessing(false);
      setSelectedUpload(null);
      setShowUploadSheet(false);
      setProcessingIntent(null);
    } catch (error) {
      setProcessingPhase('failed');
      setProcessingMessage('Re-analysis failed');
      setProcessingStatus('REVIEW_REQUIRED');
      setShowProcessing(false);
      setShowUploadSheet(true);
      setProcessingIntent(null);
      const detail = error instanceof Error ? error.message : 'Re-analysis failed. Please retry with a clearer file.';
      setUploadError(`Some information could not be confidently analysed. ${detail}`);
    } finally {
      setReanalysisBusy(false);
    }
  };

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

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220]
  });

  const reportCountLabel = `${reports.length}`;
  const stepText = [
    'Uploading report',
    'Reading document',
    'Detecting report structure',
    'Scanning pages and extracting health parameters',
    'Validating extracted values',
    'Checking health markers',
    'Generating health assessment'
  ];

  return (
    <Screen scroll contentStyle={[styles.screenContent, !isLight && styles.screenContentDark]}>
      <View style={styles.header}>
        <AppBackButton onPress={() => navigation.goBack()} iconOnly style={[styles.headerIconBtn, !isLight && styles.headerIconBtnDark]} />
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, !isLight && styles.headerTitleDark]}>My Health</Text>
          <Text style={[styles.headerSubtitle, !isLight && styles.headerSubtitleDark]}>REPORTS &amp; INTELLIGENCE</Text>
        </View>
        <Pressable style={[styles.headerIconBtn, !isLight && styles.headerIconBtnDark]} onPress={() => setShowUploadSheet(true)}>
          <Ionicons name="cloud-upload-outline" size={18} color={isLight ? palette.teal : sectionHighlight} />
        </Pressable>
      </View>

      <Card style={[styles.profileSummaryCard, !isLight && styles.profileSummaryCardDark]}>
        <View style={styles.profileSummaryTopRow}>
          <Text style={[styles.profileSummaryTitle, !isLight && styles.profileSummaryTitleDark]}>Health Profile</Text>
          <Text style={styles.profileSummaryPercent}>{profileCompletion.completionPercent}%</Text>
        </View>
        <View style={styles.profileSummaryBottomRow}>
          <View style={[styles.profileSummaryTrack, !isLight && styles.profileSummaryTrackDark]}>
            <View style={[styles.profileSummaryFill, { width: `${profileCompletion.completionPercent}%` as any }]} />
          </View>
          <Text style={styles.profileSummaryAction}>Complete →</Text>
        </View>
        <Text numberOfLines={1} style={[styles.profileSummaryMissing, !isLight && styles.profileSummaryMissingDark]}>
          {topMissingProfileFields.length} details remaining · {topMissingProfileFields.join(' · ') || 'Profile ready'}
        </Text>
      </Card>

      {latestReport ? (
        <Card style={[styles.heroCard, !isLight && styles.heroCardDark, heroExpanded && styles.heroCardInteractive]}>
          <LinearGradient
            colors={heroExpanded ? [isLight ? 'rgba(15,110,86,0.12)' : 'rgba(53,209,140,0.22)', isLight ? 'rgba(83,74,183,0.08)' : 'rgba(141,83,255,0.18)', 'rgba(255,255,255,0)'] : [isLight ? 'rgba(15,110,86,0.08)' : 'rgba(53,209,140,0.12)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCardGradient}
          />
          <View style={styles.heroTopRow}>
            <Text style={[styles.heroLabel, !isLight && styles.heroLabelDark]}>{healthScoreLabel}</Text>
            <Text style={[styles.heroUpdated, !isLight && styles.heroUpdatedDark]}>Updated {latestReport.date}</Text>
          </View>

          <Animated.Text
            style={[
              styles.heroScore,
              {
                color: overallScore == null ? colors.textMuted : scoreColor(overallScore),
                transform: [{ scale: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }]
              }
            ]}
          >
            {overallScore ?? '—'}
          </Animated.Text>
          <Text style={[styles.heroSub, !isLight && styles.heroSubDark]}>{healthScoreDescription}</Text>

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
      ) : reportsLoading ? (
        <Card style={[styles.detailCard, !isLight && styles.detailCardDark]}>
          <ActivityIndicator size="small" color={isLight ? palette.teal : sectionHighlight} />
          <Text style={[styles.detailTitle, !isLight && styles.detailTitleDark]}>Loading report history</Text>
          <Text style={[styles.detailEmpty, !isLight && styles.detailEmptyDark]}>Checking your completed health reports and biomarkers...</Text>
        </Card>
      ) : (
        <Card style={[styles.noReportCard, !isLight && styles.noReportCardDark]}>
          <View style={styles.noReportIconWrap}>
            <Ionicons name="document-text-outline" size={28} color={sectionHighlight} />
          </View>
          <Text style={[styles.noReportTitle, !isLight && styles.noReportTitleDark]}>Understand your health report</Text>
          <Text style={[styles.noReportCopy, !isLight && styles.noReportCopyDark]}>
            Upload your blood or diagnostic report and Fiteatsy will organise your biomarkers, highlight important changes and help you understand what deserves attention.
          </Text>
          <Pressable accessibilityRole="button" style={styles.noReportUploadButton} onPress={() => setShowUploadSheet(true)}>
            <Text style={styles.noReportUploadText}>Upload Health Report</Text>
          </Pressable>
          <View style={styles.noReportMetaRow}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.noReportMetaText, !isLight && styles.noReportCopyDark]}>PDF supported · Securely encrypted</Text>
          </View>
          <Text style={styles.noReportLearnMore}>How report analysis works →</Text>
          <View style={[styles.noReportTrustRow, !isLight && styles.noReportTrustRowDark]}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.textMuted} />
            <Text style={[styles.noReportTrustText, !isLight && styles.noReportCopyDark]}>
              Your health reports are securely stored and only shared with authorised care professionals.
            </Text>
          </View>
          {reportsLoadError ? (
            <View>
              <Text style={styles.uploadErrorText}>History sync: {reportsLoadError}</Text>
              <Pressable style={styles.retryBtn} onPress={refreshReportData}>
                <Text style={styles.retryBtnText}>Retry sync</Text>
              </Pressable>
            </View>
          ) : null}
        </Card>
      )}

      {latestReport ? (
        <>
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
          <Text style={[styles.nuetraCopy, !isLight && styles.nuetraCopyDark]}>
            {latestReport ? nuetraSummary : 'Upload a report to unlock a health summary based on your own extracted biomarkers.'}
          </Text>
        )}

        <Pressable
          onPress={() =>
            latestReport
              ? navigation.navigate('ReportsChat', {
                  reportName: latestReport.labName,
                  reportId: latestReport.id,
                  reportParameters: latestReport.parametersData
                })
              : null
          }
        >
          <Text style={[styles.askNuetra, !isLight && styles.askNuetraDark]}>Ask Fiteatsy anything →</Text>
        </Pressable>
      </Card>

      {comparison ? (
        <Card style={[styles.comparisonCard, !isLight && styles.comparisonCardDark]}>
          <View style={styles.comparisonHeader}>
            <View style={styles.comparisonHeaderCopy}>
              <Text style={[styles.comparisonTitle, !isLight && styles.comparisonTitleDark]}>Since Your Last Report</Text>
              <Text style={[styles.comparisonSubtitle, !isLight && styles.comparisonSubtitleDark]}>
                vs. {comparison.previousReport.title} · {comparison.previousReport.reportDate}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate('ReportComparison')}>
              <Text style={styles.comparisonLink}>Full comparison →</Text>
            </Pressable>
          </View>

          <View style={styles.comparisonStats}>
            {[
              { value: comparison.summary.improvedCount, label: 'Improved', tone: styles.comparisonGood },
              { value: comparison.summary.stableCount, label: 'Stable', tone: styles.comparisonNeutral },
              { value: comparison.summary.needsAttentionCount, label: 'Needs attention', tone: styles.comparisonAttention }
            ].map((stat) => (
              <View key={stat.label} style={[styles.comparisonStat, !isLight && styles.comparisonStatDark]}>
                <Text style={[styles.comparisonStatValue, stat.tone]}>{stat.value}</Text>
                <Text style={[styles.comparisonStatLabel, !isLight && styles.comparisonStatLabelDark]}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {comparison.improved.length > 0 ? (
            <View style={styles.comparisonGroup}>
              <Text style={[styles.comparisonGroupTitle, styles.comparisonGood]}>What Improved</Text>
              {comparison.improved.slice(0, 3).map((item) => (
                <ComparisonMarkerRow key={`improved-${item.biomarkerId}`} item={item} tone="good" />
              ))}
            </View>
          ) : null}

          {comparison.needsAttention.length > 0 ? (
            <View style={styles.comparisonGroup}>
              <Text style={[styles.comparisonGroupTitle, styles.comparisonAttention]}>Needs Attention</Text>
              {comparison.needsAttention.slice(0, 3).map((item) => (
                <ComparisonMarkerRow key={`attention-${item.biomarkerId}`} item={item} tone="attention" />
              ))}
            </View>
          ) : null}

          {comparison.changed.length > 0 ? (
            <View style={styles.comparisonGroup}>
              <Text style={[styles.comparisonGroupTitle, styles.comparisonNeutral]}>Changed</Text>
              {comparison.changed.slice(0, 2).map((item) => (
                <ComparisonMarkerRow key={`changed-${item.biomarkerId}`} item={item} tone="neutral" />
              ))}
            </View>
          ) : null}

          {comparison.summary.incomparableCount > 0 ? (
            <Text style={[styles.comparisonFootnote, !isLight && styles.comparisonSubtitleDark]}>
              {comparison.summary.incomparableCount} marker{comparison.summary.incomparableCount === 1 ? '' : 's'} could not be compared safely because units or readings differ.
            </Text>
          ) : null}
        </Card>
      ) : reports.length > 1 ? (
        <Card style={[styles.detailCard, !isLight && styles.detailCardDark]}>
          <Text style={[styles.detailTitle, !isLight && styles.detailTitleDark]}>Since Your Last Report</Text>
          <Text style={[styles.detailEmpty, !isLight && styles.detailEmptyDark]}>
            {comparisonError ?? 'A safe marker-by-marker comparison is not available for these reports.'}
          </Text>
          {comparisonError ? (
            <Pressable style={styles.retryBtn} onPress={() => void refreshReportData()}>
              <Text style={styles.retryBtnText}>Retry comparison</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : (
        <Card style={[styles.detailCard, !isLight && styles.detailCardDark]}>
          <Text style={[styles.detailTitle, !isLight && styles.detailTitleDark]}>Your First Report Is Your Baseline</Text>
          <Text style={[styles.detailEmpty, !isLight && styles.detailEmptyDark]}>
            Upload a future report and Fiteatsy will compare matching biomarkers using verified units and reference ranges.
          </Text>
        </Card>
      )}

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
        </>
      ) : null}

      {reports.length > 0 ? <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, !isLight && styles.sectionTitleDark]}>Report History</Text>
        <View style={styles.historyActions}>
          {reports.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete all reports"
              style={[styles.deleteAllChip, deleteBusy && styles.disabledChip]}
              disabled={deleteBusy}
              onPress={() => setShowDeleteAllConfirm(true)}
            >
              <Text style={styles.deleteAllChipText}>Delete all</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.countChip, !isLight && styles.countChipDark]} onPress={() => setShowHistory((prev) => !prev)}>
            <Text style={styles.countChipText}>{showHistory ? 'Hide history' : `View history (${reportCountLabel})`}</Text>
          </Pressable>
        </View>
      </View> : null}

      {showHistory ? (
        <View style={styles.reportList}>
          <View style={styles.sortRow}>
            {[
              ['latest', 'Latest'],
              ['oldest', 'Oldest'],
              ['lab', 'Lab'],
              ['type', 'Type']
            ].map(([key, label]) => {
              const active = sortMode === key;
              return (
                <Pressable key={key} style={[styles.sortChip, active && styles.sortChipActive]} onPress={() => setSortMode(key as typeof sortMode)}>
                  <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {sortedReports.map((report) => (
            <SwipeableReportCard
              key={report.id}
              report={report}
              onOpen={() => setReports((prev) => [report, ...prev.filter((item) => item.id !== report.id)])}
              onDelete={() => confirmDeleteReport(report)}
              isLight={isLight}
              highlightColor={sectionHighlight}
            />
          ))}
          {sortedReports.length === 0 ? (
            <Text style={[styles.detailEmpty, !isLight && styles.detailEmptyDark]}>
              No completed reports are available yet. Upload a report to start your timeline.
            </Text>
          ) : null}
        </View>
      ) : null}

      {!showUploadSheet && !showProcessing ? (
        <Pressable style={[styles.fab, { backgroundColor: sectionHighlight }]} onPress={() => setShowUploadSheet(true)}>
          <Ionicons name="cloud-upload-outline" size={24} color={colors.white} />
        </Pressable>
      ) : null}

      <Modal visible={showDeleteAllConfirm} animationType="fade" transparent onRequestClose={() => setShowDeleteAllConfirm(false)}>
        <View style={styles.confirmBackdrop}>
          <View style={[styles.confirmCard, !isLight && styles.confirmCardDark]}>
            <Text style={[styles.confirmTitle, !isLight && styles.confirmTitleDark]}>Delete all reports?</Text>
            <Text style={[styles.confirmCopy, !isLight && styles.confirmCopyDark]}>
              This will hide {reports.length} report{reports.length === 1 ? '' : 's'} from health score, trends, AI summary, category
              breakdown, and action plan immediately. Date range: {reportDateRange}. Support can restore within 30 days.
            </Text>
            <Text style={[styles.confirmLabel, !isLight && styles.confirmCopyDark]}>Type DELETE to confirm</Text>
            <TextInput
              value={deleteAllConfirmation}
              onChangeText={setDeleteAllConfirmation}
              autoCapitalize="characters"
              placeholder="DELETE"
              placeholderTextColor={palette.textLight}
              style={[styles.confirmInput, !isLight && styles.confirmInputDark]}
            />
            <View style={styles.confirmActions}>
              <Pressable
                style={[styles.confirmSecondaryBtn, !isLight && styles.confirmSecondaryBtnDark]}
                disabled={deleteBusy}
                onPress={() => {
                  setShowDeleteAllConfirm(false);
                  setDeleteAllConfirmation('');
                }}
              >
                <Text style={[styles.confirmSecondaryText, !isLight && styles.confirmSecondaryTextDark]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmDangerBtn,
                  (deleteBusy || deleteAllConfirmation.trim().toUpperCase() !== 'DELETE') && styles.primaryBtnDisabled
                ]}
                disabled={deleteBusy || deleteAllConfirmation.trim().toUpperCase() !== 'DELETE'}
                onPress={handleDeleteAllReports}
              >
                <Text style={styles.confirmDangerText}>{deleteBusy ? 'Deleting...' : 'Delete all'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
                  <Text style={styles.uploadStatusTitle}>Ready to upload</Text>
                  <Text style={styles.uploadStatusText}>
                    {selectedUpload.name} · {bytesToLabel(selectedUpload.sizeBytes)} · {selectedUpload.source.toUpperCase()}
                  </Text>
                  <Text style={styles.uploadStatusText}>Review the file details, then tap Upload Report to start analysis.</Text>
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
                  {reanalysisReportId ? (
                    <Pressable style={styles.retryBtn} onPress={startReanalysis} disabled={reanalysisBusy}>
                      <Text style={styles.retryBtnText}>{reanalysisBusy ? 'Re-analysing...' : 'Re-analyse Report'}</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.retryBtn} onPress={startAnalysis}>
                      <Text style={styles.retryBtnText}>Retry Analysis</Text>
                    </Pressable>
                  )}
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
                <Text style={styles.primaryBtnText}>{analysisLaunching ? 'Starting upload...' : 'Upload Report'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showProcessing} animationType="fade" transparent>
        <View style={styles.processingScreen}>
          <View style={styles.processingCenter}>
            <View style={styles.processingLogo}>
              {processingPhase === 'uploading' ? (
                <Ionicons name="cloud-upload-outline" size={34} color={colors.white} />
              ) : processingPhase === 'completed' ? (
                <Ionicons name="checkmark" size={36} color={colors.white} />
              ) : processingPhase === 'failed' ? (
                <Ionicons name="warning-outline" size={34} color={colors.white} />
              ) : (
                <MaterialCommunityIcons name="brain" size={36} color={colors.white} />
              )}
            </View>
            <Text style={styles.processingTitle}>{processingMessage}</Text>
            <Text style={styles.processingStatusText}>
              Status: {processingStatus}
            </Text>

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

            {processingPhase === 'extraction' || processingPhase === 'validation' || processingPhase === 'completed' ? (
              <View style={styles.findingCard}>
                <Text style={styles.findingTitle}>Extraction checks</Text>
                {['Reading visible report rows', 'Mapping original names to biomarkers', 'Validating values, units, and ranges'].map((item) => (
                  <Text key={item} style={styles.findingText}>• {item}</Text>
                ))}
              </View>
            ) : null}

            <View style={styles.processingTrack}>
              <View style={[styles.processingFill, { width: `${processingPercent}%` }]} />
            </View>
            <Text style={styles.processingHint}>{processingPercent}% complete · This can take 15–45 seconds for large reports.</Text>
            <ActivityIndicator color={palette.purple} style={{ marginTop: 8 }} />
            <Pressable
              style={styles.processingCancelBtn}
              onPress={() => {
                activeUploadController.current?.abort();
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

            {analysisReview?.biomarkerObservations.length ? (
              <View style={styles.reviewList}>
                <Text style={styles.reviewSectionTitle}>Extracted biomarkers</Text>
                {analysisReview.biomarkerObservations.slice(0, 6).map((item) => (
                  <Text key={item.id} style={styles.reviewListItem}>
                    • {item.biomarkerName}: {Math.round(item.confidence * 100)}% confidence · {item.validationStatus}
                  </Text>
                ))}
              </View>
            ) : null}

            {analysisReview?.healthScores.length ? (
              <View style={styles.reviewList}>
                <Text style={styles.reviewSectionTitle}>Health score updates</Text>
                {analysisReview.healthScores.map((item) => (
                  <Text key={item.scoreType} style={styles.reviewListItem}>
                    • {item.scoreType}: {item.scoreValue ?? 'insufficient data'} · {Math.round(item.confidence * 100)}% confidence
                  </Text>
                ))}
              </View>
            ) : null}

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
    fontFamily: 'Exo_600SemiBold',
    color: palette.textDark
  },
  headerCopy: {
    alignItems: 'center'
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 9,
    letterSpacing: 2,
    fontFamily: 'Exo_500Medium',
    color: palette.textLight
  },
  profileSummaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    marginBottom: 12,
    padding: 14
  },
  profileSummaryCardDark: {
    borderColor: colors.stroke,
    backgroundColor: '#151515'
  },
  profileSummaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  profileSummaryTitle: {
    fontSize: 14,
    fontFamily: 'Exo_700Bold',
    color: palette.textDark
  },
  profileSummaryTitleDark: {
    color: colors.white
  },
  profileSummaryPercent: {
    fontSize: 14,
    fontFamily: 'Exo_700Bold',
    color: colors.success
  },
  profileSummaryBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10
  },
  profileSummaryTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#E5EAF0'
  },
  profileSummaryTrackDark: {
    backgroundColor: '#2A2A2A'
  },
  profileSummaryFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.success
  },
  profileSummaryAction: {
    fontSize: 12,
    fontFamily: 'Exo_600SemiBold',
    color: colors.success
  },
  profileSummaryMissing: {
    marginTop: 8,
    fontSize: 11,
    color: palette.textLight
  },
  profileSummaryMissingDark: {
    color: colors.textMuted
  },
  noReportCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    marginBottom: 12,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center'
  },
  noReportCardDark: {
    borderColor: colors.stroke,
    backgroundColor: '#101010'
  },
  noReportIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(53, 209, 140, 0.10)'
  },
  noReportTitle: {
    marginTop: 18,
    maxWidth: 260,
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 28,
    fontFamily: 'Exo_700Bold',
    color: palette.textDark
  },
  noReportTitleDark: {
    color: colors.white
  },
  noReportCopy: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
    color: palette.textLight
  },
  noReportCopyDark: {
    color: colors.textMuted
  },
  noReportUploadButton: {
    width: '100%',
    minHeight: 52,
    marginTop: 22,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success
  },
  noReportUploadText: {
    fontSize: 15,
    fontFamily: 'Exo_700Bold',
    color: '#071009'
  },
  noReportMetaRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  noReportMetaText: {
    fontSize: 11,
    color: palette.textLight
  },
  noReportLearnMore: {
    marginTop: 16,
    fontSize: 13,
    fontFamily: 'Exo_600SemiBold',
    color: colors.success,
    textDecorationLine: 'underline'
  },
  noReportTrustRow: {
    width: '100%',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9
  },
  noReportTrustRowDark: {
    borderTopColor: colors.stroke
  },
  noReportTrustText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: palette.textLight
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  heroToggleText: {
    fontSize: 12,
    color: '#000000',
    fontFamily: 'Exo_600SemiBold'
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
    fontFamily: 'Exo_400Regular'
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
    backgroundColor: '#FFFFFF',
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
    fontFamily: 'Exo_600SemiBold',
    color: palette.textMid
  },
  categoryScoreBadge: {
    fontSize: 16,
    fontFamily: 'Exo_700Bold'
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
    fontFamily: 'Exo_600SemiBold',
    color: palette.textDark
  },
  categoryCaption: {
    marginTop: 5,
    fontSize: 11,
    fontFamily: 'Exo_500Medium',
    color: colors.textMuted
  },
  categoryCaptionDark: {
    color: colors.white
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
    fontFamily: 'Exo_600SemiBold'
  },
  nuetraCard: {
    borderRadius: 16,
    borderLeftWidth: 3,
    borderLeftColor: palette.purple,
    backgroundColor: '#FFFFFF',
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
    fontFamily: 'Exo_600SemiBold'
  },
  nuetraTitle: {
    fontSize: 17,
    fontFamily: 'Exo_600SemiBold',
    color: '#000000',
    marginBottom: 6
  },
  nuetraCopy: {
    fontSize: 15,
    lineHeight: 24,
    color: '#000000',
    marginBottom: 10
  },
  askNuetra: {
    color: '#000000',
    fontSize: 13,
    fontFamily: 'Exo_600SemiBold'
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
    backgroundColor: '#FFFFFF',
    marginBottom: 12
  },
  detailTitle: {
    fontSize: 16,
    fontFamily: 'Exo_600SemiBold',
    color: palette.textDark,
    marginBottom: 10
  },
  detailEmpty: {
    color: '#000000',
    fontSize: 13
  },
  comparisonCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D9E2D3',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    padding: 16
  },
  comparisonCardDark: {
    borderColor: colors.stroke,
    backgroundColor: colors.card
  },
  comparisonHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  comparisonHeaderCopy: {
    flex: 1
  },
  comparisonTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Exo_700Bold',
    color: palette.textDark
  },
  comparisonTitleDark: {
    color: colors.white
  },
  comparisonSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    color: palette.textMid
  },
  comparisonSubtitleDark: {
    color: colors.textSecondary
  },
  comparisonLink: {
    paddingTop: 2,
    fontSize: 12,
    lineHeight: 20,
    fontFamily: 'Exo_600SemiBold',
    color: colors.success
  },
  comparisonStats: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8
  },
  comparisonStat: {
    flex: 1,
    minHeight: 72,
    borderRadius: 12,
    backgroundColor: '#F5F7F4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  comparisonStatDark: {
    backgroundColor: colors.cardMuted
  },
  comparisonStatValue: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'Exo_700Bold'
  },
  comparisonStatLabel: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    color: palette.textMid
  },
  comparisonStatLabelDark: {
    color: colors.textSecondary
  },
  comparisonGood: {
    color: colors.success
  },
  comparisonAttention: {
    color: colors.danger
  },
  comparisonNeutral: {
    color: colors.textMuted
  },
  comparisonGroup: {
    marginTop: 18
  },
  comparisonGroupTitle: {
    marginBottom: 4,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Exo_700Bold',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  comparisonMarkerRow: {
    minHeight: 56,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke
  },
  comparisonMarkerCopy: {
    flex: 1
  },
  comparisonMarkerName: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Exo_600SemiBold',
    color: colors.textPrimary
  },
  comparisonMarkerValues: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary
  },
  comparisonMarkerStatus: {
    maxWidth: 104,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'right',
    fontFamily: 'Exo_600SemiBold'
  },
  comparisonFootnote: {
    marginTop: 14,
    fontSize: 11,
    lineHeight: 17,
    color: palette.textMid
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
    fontFamily: 'Exo_600SemiBold'
  },
  parameterValue: {
    color: palette.coral,
    fontSize: 14,
    fontFamily: 'Exo_700Bold'
  },
  parameterRange: {
    marginTop: 3,
    color: '#000000',
    fontSize: 12
  },
  parameterInsight: {
    marginTop: 6,
    color: '#000000',
    fontSize: 12,
    lineHeight: 18
  },
  actionCard: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF'
  },
  actionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4
  },
  actionPriority: {
    fontSize: 11,
    fontFamily: 'Exo_700Bold',
    color: palette.teal,
    backgroundColor: palette.tealLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 100
  },
  actionTitle: {
    fontSize: 14,
    fontFamily: 'Exo_600SemiBold',
    color: palette.textDark,
    flex: 1
  },
  actionDetail: {
    fontSize: 13,
    color: '#000000',
    lineHeight: 19
  },
  actionDoctor: {
    marginTop: 5,
    color: palette.coral,
    fontSize: 12,
    fontFamily: 'Exo_600SemiBold'
  },
  crossRow: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: 10,
    marginBottom: 8
  },
  crossConnection: {
    fontSize: 13,
    color: '#000000',
    lineHeight: 18,
    marginBottom: 3
  },
  crossMeta: {
    fontSize: 12,
    color: '#000000'
  },
  trendChartRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: '#FFFFFF',
    padding: 10,
    marginBottom: 8
  },
  trendChartRowDark: {
    backgroundColor: colors.cardRaised,
    borderColor: colors.strokeStrong
  },
  trendChartHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8
  },
  trendChartName: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Exo_700Bold',
    color: palette.textDark
  },
  trendChartNameDark: {
    color: colors.white
  },
  trendChartBadge: {
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontFamily: 'Exo_700Bold'
  },
  trendChartBadgeGood: {
    color: palette.teal,
    backgroundColor: palette.tealLight
  },
  trendChartBadgeWatch: {
    color: palette.amber,
    backgroundColor: palette.amberLight
  },
  trendBarLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 5
  },
  trendBarLabel: {
    width: 78,
    fontSize: 11,
    color: palette.textMid
  },
  trendBarLabelDark: {
    color: colors.white
  },
  trendTrack: {
    flex: 1,
    height: 8,
    borderRadius: 100,
    backgroundColor: colors.surfaceTint,
    overflow: 'hidden'
  },
  trendPreviousFill: {
    height: '100%',
    borderRadius: 100,
    backgroundColor: colors.textMuted
  },
  trendCurrentFill: {
    height: '100%',
    borderRadius: 100,
    backgroundColor: palette.teal
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'Exo_600SemiBold',
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
    fontFamily: 'Exo_700Bold'
  },
  historyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  deleteAllChip: {
    borderRadius: 100,
    borderWidth: 1,
    borderColor: palette.coral,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  deleteAllChipText: {
    color: palette.coral,
    fontSize: 12,
    fontFamily: 'Exo_700Bold'
  },
  disabledChip: {
    opacity: 0.45
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
    fontFamily: 'Exo_600SemiBold'
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#FFFFFF',
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
    fontFamily: 'Exo_700Bold'
  },
  reportMiddle: {
    flex: 1,
    paddingHorizontal: 10
  },
  reportLab: {
    fontSize: 15,
    fontFamily: 'Exo_600SemiBold',
    color: palette.textDark
  },
  reportDate: {
    fontSize: 13,
    color: '#000000',
    marginTop: 1
  },
  reportMeta: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'Exo_500Medium'
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
    fontFamily: 'Exo_700Bold'
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
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,10,16,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  confirmCard: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18
  },
  confirmCardDark: {
    backgroundColor: colors.cardRaised,
    borderColor: colors.stroke
  },
  confirmTitle: {
    fontSize: 20,
    color: palette.textDark,
    fontFamily: 'Exo_700Bold',
    marginBottom: 8
  },
  confirmTitleDark: {
    color: colors.white
  },
  confirmCopy: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.textMid,
    marginBottom: 14
  },
  confirmCopyDark: {
    color: colors.white
  },
  confirmLabel: {
    fontSize: 12,
    color: palette.textDark,
    fontFamily: 'Exo_600SemiBold',
    marginBottom: 6
  },
  confirmInput: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.textDark,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: 'Exo_600SemiBold',
    marginBottom: 16
  },
  confirmInputDark: {
    backgroundColor: colors.cardMuted,
    borderColor: colors.stroke,
    color: colors.white
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10
  },
  confirmSecondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  confirmSecondaryBtnDark: {
    borderColor: colors.stroke
  },
  confirmSecondaryText: {
    color: palette.textDark,
    fontSize: 14,
    fontFamily: 'Exo_600SemiBold'
  },
  confirmSecondaryTextDark: {
    color: colors.white
  },
  confirmDangerBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: palette.coral,
    alignItems: 'center',
    justifyContent: 'center'
  },
  confirmDangerText: {
    color: colors.white,
    fontSize: 14,
    fontFamily: 'Exo_700Bold'
  },
  sheetDismissZone: {
    flex: 1
  },
  sheet: {
    backgroundColor: '#FFFFFF',
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
    fontFamily: 'Exo_600SemiBold',
    color: '#000000'
  },
  sheetSubtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: '#000000'
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
    backgroundColor: '#FFFFFF'
  },
  uploadMethodCardActive: {
    borderColor: palette.teal,
    backgroundColor: palette.tealLight
  },
  uploadMethodTitle: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: 'Exo_600SemiBold',
    color: '#000000',
    textAlign: 'center'
  },
  uploadMethodCopy: {
    marginTop: 2,
    fontSize: 11,
    color: '#000000',
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
    fontFamily: 'Exo_600SemiBold',
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
    fontFamily: 'Exo_600SemiBold',
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
    fontFamily: 'Exo_600SemiBold',
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
    fontFamily: 'Exo_600SemiBold'
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
    fontFamily: 'Exo_600SemiBold'
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
    fontFamily: 'Exo_600SemiBold',
    color: palette.textDark,
    marginBottom: 6,
    textAlign: 'center'
  },
  processingStatusText: {
    marginBottom: 14,
    fontSize: 12,
    color: palette.textLight,
    fontFamily: 'Exo_600SemiBold',
    letterSpacing: 0.3
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
    fontFamily: 'Exo_600SemiBold'
  },
  findingCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14
  },
  findingTitle: {
    fontSize: 12,
    fontFamily: 'Exo_700Bold',
    color: palette.textDark,
    marginBottom: 4
  },
  findingText: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.textMid
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
    fontFamily: 'Exo_600SemiBold',
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
    fontFamily: 'Exo_700Bold',
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
    fontFamily: 'Exo_600SemiBold',
    color: colors.success
  },
  reviewBad: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Exo_600SemiBold',
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
  reviewSectionTitle: {
    marginBottom: 5,
    fontSize: 12,
    fontFamily: 'Exo_700Bold',
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
    fontFamily: 'Exo_600SemiBold',
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
    fontFamily: 'Exo_700Bold',
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
    color: colors.white
  },
  headerSubtitleDark: {
    color: colors.textMuted
  },
  heroCardDark: {
    backgroundColor: colors.cardMuted,
    borderColor: colors.stroke
  },
  heroLabelDark: {
    color: colors.white
  },
  heroUpdatedDark: {
    color: colors.white
  },
  heroSubDark: {
    color: colors.white
  },
  heroToggleChipDark: {
    backgroundColor: '#151515',
    borderColor: colors.stroke
  },
  heroToggleTextDark: {
    color: colors.white
  },
  dividerDark: {
    backgroundColor: '#2A2A2A'
  },
  categoryNameDark: {
    color: colors.white
  },
  miniTrackDark: {
    backgroundColor: '#2A2A2A'
  },
  categoryScoreDark: {
    color: colors.white
  },
  lastReportDark: {
    color: colors.white
  },
  seeAllDark: {
    color: colors.white
  },
  nuetraCardDark: {
    backgroundColor: colors.card,
    borderColor: colors.stroke
  },
  nuetraTitleDark: {
    color: colors.white
  },
  nuetraCopyDark: {
    color: colors.white
  },
  askNuetraDark: {
    color: colors.white
  },
  detailCardDark: {
    backgroundColor: '#151515',
    borderColor: colors.stroke
  },
  detailTitleDark: {
    color: colors.white
  },
  detailEmptyDark: {
    color: colors.white
  },
  profilePromptBox: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D7DFE7',
    backgroundColor: '#F8FBFF',
    padding: 14
  },
  profilePromptTitle: {
    fontSize: 14,
    fontFamily: 'Exo_700Bold',
    color: '#111827'
  },
  profilePromptTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E5EAF0',
    overflow: 'hidden',
    marginTop: 10
  },
  profilePromptFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#59BE08'
  },
  profilePromptMissing: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: '#475569'
  },
  profilePromptHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B'
  },
  profilePromptTitleDark: {
    color: colors.white
  },
  profilePromptTrackDark: {
    backgroundColor: '#2A2A2A'
  },
  profilePromptMissingDark: {
    color: colors.white
  },
  profilePromptHintDark: {
    color: colors.white
  },
  parameterRowDark: {
    borderColor: colors.stroke,
    backgroundColor: '#151515'
  },
  parameterNameDark: {
    color: colors.white
  },
  parameterRangeDark: {
    color: colors.white
  },
  parameterInsightDark: {
    color: colors.white
  },
  actionCardDark: {
    borderColor: colors.stroke,
    backgroundColor: '#151515'
  },
  actionTitleDark: {
    color: colors.white
  },
  actionDetailDark: {
    color: colors.white
  },
  crossRowDark: {
    backgroundColor: '#151515',
    borderColor: colors.stroke
  },
  crossConnectionDark: {
    color: colors.white
  },
  crossMetaDark: {
    color: colors.white
  },
  sectionTitleDark: {
    color: colors.white
  },
  countChipDark: {
    backgroundColor: '#151515'
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  sortChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D7DFE7',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  sortChipActive: {
    borderColor: '#59BE08',
    backgroundColor: '#EEF6E8'
  },
  sortChipText: {
    color: '#475569',
    fontSize: 12,
    fontFamily: 'Exo_500Medium'
  },
  sortChipTextActive: {
    color: '#2E6B00'
  },
  reportRowDark: {
    borderColor: colors.stroke,
    backgroundColor: '#151515'
  },
  reportLabDark: {
    color: colors.white
  },
  reportDateDark: {
    color: colors.white
  },
  reportMetaDark: {
    color: '#4A4A4A'
  },
});
