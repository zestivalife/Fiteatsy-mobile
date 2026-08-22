import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation/types';
import {
  AssessmentDefinition,
  AssessmentResponse,
  AssessmentResult,
  AssessmentSession,
  completeAssessmentSession,
  getAssessmentDefinition,
  getAssessmentHistory,
  getDraftAssessmentSession,
  getLatestAssessmentResult,
  saveAssessmentResponses,
  startAssessmentSession
} from '../../services/assessmentService';
import { spacing, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Pss10Assessment'>;
type ViewState = 'intro' | 'question' | 'result' | 'history';
type ResponseMap = Record<string, 0 | 1 | 2 | 3 | 4>;

const MIND_ACCENT = '#8D7CFF';
const SURFACE = '#0F1010';
const SURFACE_RAISED = '#17181B';
const GRAPHITE = '#25262B';
const BORDER = '#343640';
const TEXT = '#FFFFFF';
const MUTED = '#A5A7B1';

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));

const buildResponseMap = (responses: AssessmentResponse[]) =>
  responses.reduce<ResponseMap>((acc, response) => {
    acc[response.itemId] = response.selectedValue;
    return acc;
  }, {});

const scoreChange = (current: AssessmentResult | null, previous: AssessmentResult | null) => {
  if (!current || !previous) return null;
  const delta = current.rawScore - previous.rawScore;
  if (delta === 0) return 'No change';
  return `${delta < 0 ? '↓' : '↑'} ${Math.abs(delta)} points`;
};

export const Pss10AssessmentScreen = ({ navigation, route }: Props) => {
  const { authSession } = useAppContext();
  const sessionToken = authSession?.sessionToken;
  const [view, setView] = useState<ViewState>(route.params?.mode === 'history' ? 'history' : 'intro');
  const [definition, setDefinition] = useState<AssessmentDefinition | null>(null);
  const [session, setSession] = useState<AssessmentSession | null>(null);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [latestResult, setLatestResult] = useState<AssessmentResult | null>(null);
  const [previousResult, setPreviousResult] = useState<AssessmentResult | null>(null);
  const [history, setHistory] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentItem = definition?.items[questionIndex] ?? null;
  const selectedValue = currentItem ? responses[currentItem.id] : undefined;
  const answeredCount = definition?.items.filter((item) => responses[item.id] != null).length ?? 0;
  const progressPercent = definition ? ((questionIndex + 1) / definition.itemCount) * 100 : 0;
  const changeText = scoreChange(latestResult, previousResult);

  const loadAssessment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [definitionResult, draftResult, latestResultResponse, historyResponse] = await Promise.all([
        getAssessmentDefinition(sessionToken),
        getDraftAssessmentSession(sessionToken),
        getLatestAssessmentResult(sessionToken),
        getAssessmentHistory(sessionToken)
      ]);
      setDefinition(definitionResult);
      setSession(draftResult.session);
      setResponses(draftResult.session ? buildResponseMap(draftResult.session.responses) : {});
      setLatestResult(latestResultResponse.result);
      setPreviousResult(latestResultResponse.previousResult);
      setHistory(historyResponse.items);
    } catch {
      setError('Assessment data could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void loadAssessment();
  }, [loadAssessment]);

  const beginAssessment = async (continueDraft: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      const activeSession = continueDraft && session ? session : (await startAssessmentSession(sessionToken)).session;
      const mapped = buildResponseMap(activeSession.responses);
      const firstMissingIndex = definition?.items.findIndex((item) => mapped[item.id] == null) ?? 0;
      setSession(activeSession);
      setResponses(mapped);
      setQuestionIndex(firstMissingIndex >= 0 ? firstMissingIndex : 0);
      setView('question');
    } catch {
      setError('Assessment could not be started. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const persistResponses = async (nextResponses: ResponseMap) => {
    if (!session) return null;
    const payload = Object.entries(nextResponses).map(([itemId, value]) => ({ itemId, selectedValue: value }));
    const saved = await saveAssessmentResponses(session.id, payload, sessionToken);
    setSession(saved.session);
    return saved.session;
  };

  const selectResponse = (value: 0 | 1 | 2 | 3 | 4) => {
    if (!currentItem) return;
    setResponses((current) => ({ ...current, [currentItem.id]: value }));
  };

  const continueNext = async () => {
    if (!definition || !currentItem || selectedValue == null) return;
    setSubmitting(true);
    setError(null);
    try {
      const nextResponses = { ...responses, [currentItem.id]: selectedValue };
      await persistResponses(nextResponses);
      if (questionIndex < definition.itemCount - 1) {
        setQuestionIndex((index) => index + 1);
      } else {
        const missing = definition.items.some((item) => nextResponses[item.id] == null);
        if (missing || !session) {
          setError('All 10 responses are required before completion.');
          return;
        }
        const completed = await completeAssessmentSession(session.id, sessionToken);
        setLatestResult(completed.result);
        setPreviousResult(completed.previousResult);
        const historyResponse = await getAssessmentHistory(sessionToken);
        setHistory(historyResponse.items);
        setSession(null);
        setResponses({});
        setView('result');
      }
    } catch {
      setError('Assessment progress could not be saved. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const goBackWithinFlow = () => {
    setError(null);
    if (view === 'question' && questionIndex > 0) {
      setQuestionIndex((index) => index - 1);
      return;
    }
    if (view === 'history' || view === 'result' || view === 'question') {
      setView('intro');
      return;
    }
    navigation.goBack();
  };

  const trendPoints = useMemo(() => history.slice().reverse().slice(-6), [history]);

  if (loading) {
    return (
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator color={MIND_ACCENT} />
        <Text style={styles.loadingText}>Loading assessment</Text>
      </Screen>
    );
  }

  const renderHeader = (title: string, subtitle?: string) => (
    <View style={styles.header}>
      <AppBackButton iconOnly onPress={goBackWithinFlow} />
      <View style={styles.headerTextWrap}>
        <Text style={styles.eyebrow}>MIND / STRESS</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );

  const renderIntro = () => (
    <>
      {renderHeader('Perceived Stress Check', definition?.subtitle ?? 'Thinking about the last 30 days, select how often each of the following applied to you.')}
      <View style={styles.heroPanel}>
        <View style={styles.heroIcon}>
          <Ionicons name="sparkles-outline" size={24} color={MIND_ACCENT} />
        </View>
        <Text style={styles.heroTitle}>PSS-10</Text>
        <Text style={styles.heroCopy}>This self-reported assessment is not a diagnosis. Results are stored as a score and trend only.</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}><Text style={styles.metaText}>10 questions</Text></View>
          <View style={styles.metaPill}><Text style={styles.metaText}>~2-3 minutes</Text></View>
        </View>
        <Text style={styles.notice}>Thinking about the last 30 days...</Text>
      </View>
      {session ? (
        <View style={styles.draftPanel}>
          <Text style={styles.panelTitle}>Assessment in progress</Text>
          <Text style={styles.panelCopy}>{answeredCount} of {definition?.itemCount ?? 10} responses saved.</Text>
          <Pressable style={styles.primaryButton} onPress={() => beginAssessment(true)} disabled={submitting} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Continue Assessment</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => beginAssessment(false)} disabled={submitting} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Start Again</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.primaryButton} onPress={() => beginAssessment(false)} disabled={submitting} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>Start Assessment</Text>
        </Pressable>
      )}
      {latestResult ? (
        <Pressable style={styles.secondaryButton} onPress={() => setView('history')} accessibilityRole="button">
          <Text style={styles.secondaryButtonText}>View History</Text>
        </Pressable>
      ) : null}
    </>
  );

  const renderQuestion = () => {
    if (!definition || !currentItem) return null;
    return (
      <>
        {renderHeader('PSS-10', `Question ${questionIndex + 1} of ${definition.itemCount}`)}
        <View accessible accessibilityLabel={`Question ${questionIndex + 1} of ${definition.itemCount}`} style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
        <View style={styles.questionPanel}>
          <Text style={styles.questionText}>{currentItem.label}</Text>
          <View style={styles.optionsStack}>
            {definition.responseOptions.map((option) => {
              const active = selectedValue === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.optionCard, active && styles.optionCardActive]}
                  onPress={() => selectResponse(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={option.label}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <Ionicons name="checkmark" size={14} color={TEXT} /> : null}
                  </View>
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.actionsRow}>
          <Pressable style={styles.backButton} onPress={goBackWithinFlow} accessibilityRole="button">
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.continueButton, selectedValue == null && styles.disabledButton]}
            onPress={continueNext}
            disabled={selectedValue == null || submitting}
            accessibilityRole="button"
            accessibilityState={{ disabled: selectedValue == null || submitting }}
          >
            <Text style={styles.primaryButtonText}>{questionIndex === definition.itemCount - 1 ? 'Complete Assessment' : 'Continue'}</Text>
          </Pressable>
        </View>
      </>
    );
  };

  const renderResult = () => (
    <>
      {renderHeader('Perceived Stress', latestResult ? `Completed ${formatDate(latestResult.completedAtISO)}` : undefined)}
      {latestResult ? (
        <View style={styles.resultPanel} accessibilityLabel={`Perceived stress score ${latestResult.rawScore} out of ${latestResult.maxScore}`}>
          <View style={styles.scoreArc}>
            <Text style={styles.scoreValue}>{latestResult.rawScore}</Text>
            <Text style={styles.scoreMax}>/ {latestResult.maxScore}</Text>
          </View>
          <Text style={styles.resultCopy}>Higher scores represent greater perceived stress.</Text>
          <Text style={styles.interpretation}>{latestResult.interpretationLabel}</Text>
          <Text style={styles.resultCopy}>This score reflects your self-reported perceived stress over the last 30 days and is not a diagnosis.</Text>
          <View style={styles.resultGrid}>
            <View style={styles.resultMini}>
              <Text style={styles.resultLabel}>Previous</Text>
              <Text style={styles.resultValue}>{previousResult ? `${previousResult.rawScore} / ${previousResult.maxScore}` : 'No previous'}</Text>
            </View>
            <View style={styles.resultMini}>
              <Text style={styles.resultLabel}>Change</Text>
              <Text style={styles.resultValue}>{changeText ?? 'Not available'}</Text>
            </View>
          </View>
        </View>
      ) : (
        <Text style={styles.emptyText}>No completed result is available yet.</Text>
      )}
      <Pressable style={styles.primaryButton} onPress={() => setView('history')} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>View Trend</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => navigation.goBack()} accessibilityRole="button">
        <Text style={styles.secondaryButtonText}>Done</Text>
      </Pressable>
    </>
  );

  const renderHistory = () => (
    <>
      {renderHeader('Stress Assessment History', 'Completed assessments are listed by completion date.')}
      {history.length === 0 ? (
        <Text style={styles.emptyText}>No completed PSS-10 assessments yet.</Text>
      ) : (
        <>
          <View style={styles.trendPanel}>
            <Text style={styles.panelTitle}>Trend</Text>
            <View style={styles.trendRow}>
              {trendPoints.map((item) => (
                <View key={item.id} style={styles.trendItem}>
                  <View style={styles.trendBarTrack}>
                    <View style={[styles.trendBarFill, { height: `${Math.max(6, (item.rawScore / item.maxScore) * 100)}%` }]} />
                  </View>
                  <Text style={styles.trendScore}>{item.rawScore}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.historyList}>
            {history.map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <Text style={styles.historyDate}>{formatDate(item.completedAtISO)}</Text>
                <View style={styles.historyValue}>
                  <Text style={styles.historyScore}>{item.rawScore} / {item.maxScore}</Text>
                  <Text style={styles.historyInterpretation}>{item.interpretationLabel}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
      <Pressable style={styles.primaryButton} onPress={() => beginAssessment(false)} disabled={submitting} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>Take Again</Text>
      </Pressable>
    </>
  );

  return (
    <Screen scroll contentStyle={styles.content}>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {view === 'intro' ? renderIntro() : null}
      {view === 'question' ? renderQuestion() : null}
      {view === 'result' ? renderResult() : null}
      {view === 'history' ? renderHistory() : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 56,
    gap: 16
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12
  },
  loadingText: {
    ...typography.caption,
    color: MUTED
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE_RAISED,
    borderWidth: 1,
    borderColor: BORDER
  },
  headerTextWrap: {
    flex: 1,
    gap: 4
  },
  eyebrow: {
    ...typography.caption,
    fontFamily: 'Exo_600SemiBold',
    color: MIND_ACCENT
  },
  title: {
    ...typography.title,
    fontFamily: 'Exo_700Bold',
    color: TEXT
  },
  subtitle: {
    ...typography.body,
    color: MUTED
  },
  heroPanel: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 14
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(141,124,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(141,124,255,0.34)'
  },
  heroTitle: {
    ...typography.titleXL,
    fontFamily: 'Exo_700Bold',
    color: TEXT
  },
  heroCopy: {
    ...typography.body,
    color: MUTED
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap'
  },
  metaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: GRAPHITE
  },
  metaText: {
    ...typography.caption,
    color: TEXT
  },
  notice: {
    ...typography.caption,
    color: MUTED
  },
  draftPanel: {
    backgroundColor: SURFACE_RAISED,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12
  },
  panelTitle: {
    ...typography.bodyStrong,
    fontFamily: 'Exo_600SemiBold',
    color: TEXT
  },
  panelCopy: {
    ...typography.body,
    color: MUTED
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MIND_ACCENT,
    paddingHorizontal: spacing.md
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_RAISED,
    paddingHorizontal: spacing.md
  },
  primaryButtonText: {
    ...typography.bodyStrong,
    color: TEXT
  },
  secondaryButtonText: {
    ...typography.bodyStrong,
    color: TEXT
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: GRAPHITE,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: MIND_ACCENT
  },
  questionPanel: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 18
  },
  questionText: {
    ...typography.section,
    fontFamily: 'Exo_600SemiBold',
    color: TEXT
  },
  optionsStack: {
    gap: 10
  },
  optionCard: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_RAISED,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  optionCardActive: {
    backgroundColor: GRAPHITE,
    borderColor: '#C9C7FF'
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: MUTED,
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioActive: {
    borderColor: MIND_ACCENT,
    backgroundColor: MIND_ACCENT
  },
  optionLabel: {
    ...typography.body,
    flex: 1,
    color: MUTED
  },
  optionLabelActive: {
    color: TEXT
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10
  },
  backButton: {
    flex: 0.38,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE_RAISED
  },
  backButtonText: {
    ...typography.bodyStrong,
    color: TEXT
  },
  continueButton: {
    flex: 0.62,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MIND_ACCENT
  },
  disabledButton: {
    opacity: 0.42
  },
  resultPanel: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 18
  },
  scoreArc: {
    minHeight: 150,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(141,124,255,0.34)',
    backgroundColor: 'rgba(141,124,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  scoreValue: {
    fontFamily: 'Exo_700Bold',
    fontSize: 68,
    lineHeight: 76,
    color: TEXT
  },
  scoreMax: {
    ...typography.bodyStrong,
    color: MUTED
  },
  resultCopy: {
    ...typography.body,
    color: MUTED,
    textAlign: 'center'
  },
  interpretation: {
    ...typography.bodyStrong,
    color: '#E7C36A',
    textAlign: 'center'
  },
  resultGrid: {
    flexDirection: 'row',
    gap: 10
  },
  resultMini: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE_RAISED,
    padding: 14,
    gap: 4
  },
  resultLabel: {
    ...typography.caption,
    color: MUTED
  },
  resultValue: {
    ...typography.bodyStrong,
    color: TEXT
  },
  trendPanel: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 14
  },
  trendRow: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10
  },
  trendItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8
  },
  trendBarTrack: {
    height: 88,
    width: '100%',
    borderRadius: 10,
    backgroundColor: GRAPHITE,
    justifyContent: 'flex-end',
    overflow: 'hidden'
  },
  trendBarFill: {
    width: '100%',
    borderRadius: 10,
    backgroundColor: MIND_ACCENT
  },
  trendScore: {
    ...typography.caption,
    color: MUTED
  },
  historyList: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    overflow: 'hidden'
  },
  historyRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER
  },
  historyDate: {
    ...typography.body,
    color: TEXT
  },
  historyScore: {
    ...typography.bodyStrong,
    color: TEXT
  },
  historyValue: {
    alignItems: 'flex-end',
    gap: 2
  },
  historyInterpretation: {
    ...typography.caption,
    color: MUTED
  },
  emptyText: {
    ...typography.body,
    color: MUTED,
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16
  },
  errorText: {
    ...typography.caption,
    color: '#FFD1D6',
    backgroundColor: 'rgba(208,64,83,0.14)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(208,64,83,0.32)',
    padding: 12
  }
});
