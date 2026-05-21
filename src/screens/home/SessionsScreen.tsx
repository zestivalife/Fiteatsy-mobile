import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { RootStackParamList } from '../../navigation/types';
import { colors, getThemeColors, radius, spacing, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type SessionType =
  | 'breathing_sync'
  | 'focus_light'
  | 'mood_bloom'
  | 'breathing_garden'
  | 'memory_pulse'
  | 'emotional_color_flow'
  | 'energy_rhythm_match';

type SessionResult = {
  sessionType: SessionType;
  emotionalState: 'settling' | 'steady' | 'lifted';
  calmImpact: number;
  focusImpact: number;
  stressRecoveryImpact: number;
  recoveryContribution: number;
  trendDirection: 'up' | 'steady';
  timestamp: string;
};

type SessionStoragePayload =
  | {
      type: 'mood_bloom';
      emotionalTone: string;
      bloomState: string;
      calmWeight: number;
      emotionalRecoveryWeight: number;
      timestamp: string;
    }
  | {
      type: 'emotional_color_flow';
      primaryColorEmotion: string;
      secondaryEmotion: string;
      calmDirection: string;
      emotionalRecoveryTrend: 'up' | 'steady';
      timestamp: string;
    }
  | {
      type: 'energy_rhythm_match';
      tapConsistency: number;
      rhythmStability: number;
      stressRecoveryWeight: number;
      calmInfluence: number;
      timestamp: string;
    }
  | {
      type: 'memory_pulse';
      recallAccuracy: number;
      focusConsistency: number;
      mentalFatigueWeight: number;
      cognitiveRecoveryWeight: number;
      timestamp: string;
    };

type SessionConfig = {
  key: SessionType;
  title: string;
  subtitle: string;
  category: 'Calm Recovery' | 'Focus & Brain' | 'Cycle Wellness' | 'Emotional Balance';
  impactLabel: string;
  mode: 'breathing' | 'focus' | 'cycle' | 'emotion';
};

const sessionCatalog: SessionConfig[] = [
  {
    key: 'breathing_sync',
    title: 'Breathing Sync',
    subtitle: 'Match your breath with a calm pulse and reset stress response.',
    category: 'Calm Recovery',
    impactLabel: 'Calm + Stress Recovery',
    mode: 'breathing'
  },
  {
    key: 'breathing_garden',
    title: 'Breathing Garden',
    subtitle: 'Slow breathing grows a restorative environment and supports sleep calmness.',
    category: 'Calm Recovery',
    impactLabel: 'Calm + Sleep',
    mode: 'breathing'
  },
  {
    key: 'focus_light',
    title: 'Focus Light',
    subtitle: 'Follow soft drifting particles to rebuild attention stability.',
    category: 'Focus & Brain',
    impactLabel: 'Focus Stability',
    mode: 'focus'
  },
  {
    key: 'memory_pulse',
    title: 'Memory Pulse',
    subtitle: 'Gentle sequence recall for cognitive freshness and mental clarity.',
    category: 'Focus & Brain',
    impactLabel: 'Brain Freshness',
    mode: 'focus'
  },
  {
    key: 'mood_bloom',
    title: 'Mood Bloom',
    subtitle: 'Express today’s emotional tone through a guided bloom ritual.',
    category: 'Cycle Wellness',
    impactLabel: 'Cycle + Mood Rhythm',
    mode: 'cycle'
  },
  {
    key: 'energy_rhythm_match',
    title: 'Energy Rhythm Match',
    subtitle: 'Tap with a soft cadence to stabilize emotional pacing.',
    category: 'Cycle Wellness',
    impactLabel: 'Cycle + Calm',
    mode: 'cycle'
  },
  {
    key: 'emotional_color_flow',
    title: 'Emotional Color Flow',
    subtitle: 'Choose intuitive color atmospheres to interpret recovery mood direction.',
    category: 'Emotional Balance',
    impactLabel: 'Emotional Recovery',
    mode: 'emotion'
  }
];

export const SessionsScreen = () => {
  const navigation = useNavigation<Nav>();
  const { setWellness, themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const isLight = themeMode === 'light';
  const [selectedKey, setSelectedKey] = useState<SessionType>('breathing_sync');
  const [lastResult, setLastResult] = useState<SessionResult | null>(null);
  const [statusMessage, setStatusMessage] = useState('Pick one guided session to support calm recovery today.');
  const [activeExperience, setActiveExperience] = useState<SessionType | null>(null);

  const [bloomColor, setBloomColor] = useState<'rose' | 'lavender' | 'peach' | 'dusk'>('rose');
  const [bloomSoftness, setBloomSoftness] = useState<'soft' | 'gentle' | 'deep'>('gentle');
  const [bloomTone, setBloomTone] = useState<'light' | 'balanced' | 'reflective'>('balanced');
  const [bloomMood, setBloomMood] = useState<'calm' | 'heavy' | 'emotional' | 'balanced' | 'drained' | 'hopeful' | null>(null);

  const [flowPrimary, setFlowPrimary] = useState<'rose_haze' | 'lavender_mist' | 'peach_warmth' | 'deep_night' | null>(null);
  const [flowSecondary, setFlowSecondary] = useState<'calm' | 'warmth' | 'clarity' | 'rest' | 'focus' | null>(null);
  const [flowDirection, setFlowDirection] = useState<'calm' | 'warmth' | 'clarity' | 'rest' | 'focus' | null>(null);

  const [rhythmStartedAt, setRhythmStartedAt] = useState<number | null>(null);
  const [rhythmElapsed, setRhythmElapsed] = useState(0);
  const [rhythmPulse, setRhythmPulse] = useState(false);
  const rhythmPulseTimesRef = useRef<number[]>([]);
  const rhythmTapTimesRef = useRef<number[]>([]);
  const rhythmTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rhythmPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [memorySequence, setMemorySequence] = useState<number[]>([]);
  const [memoryUserInput, setMemoryUserInput] = useState<number[]>([]);
  const [memoryHighlight, setMemoryHighlight] = useState<number | null>(null);
  const [memoryPhase, setMemoryPhase] = useState<'idle' | 'observe' | 'repeat'>('idle');
  const [memoryFailures, setMemoryFailures] = useState(0);
  const [memoryHits, setMemoryHits] = useState(0);
  const [memoryAttempts, setMemoryAttempts] = useState(0);
  const memoryStartedRef = useRef<number | null>(null);
  const memoryPlaybackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const grouped = useMemo(() => {
    return {
      calm: sessionCatalog.filter((session) => session.category === 'Calm Recovery'),
      focus: sessionCatalog.filter((session) => session.category === 'Focus & Brain'),
      cycle: sessionCatalog.filter((session) => session.category === 'Cycle Wellness'),
      emotion: sessionCatalog.filter((session) => session.category === 'Emotional Balance')
    };
  }, []);

  const persistSessionPayload = async (payload: SessionStoragePayload) => {
    const key = 'fiteatsy.sessionSignals.v1';
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as SessionStoragePayload[]) : [];
    parsed.unshift(payload);
    await AsyncStorage.setItem(key, JSON.stringify(parsed.slice(0, 60)));
  };

  const cleanupRhythm = () => {
    if (rhythmTickerRef.current) clearInterval(rhythmTickerRef.current);
    if (rhythmPulseTimerRef.current) clearTimeout(rhythmPulseTimerRef.current);
    rhythmTickerRef.current = null;
    rhythmPulseTimerRef.current = null;
  };

  const cleanupMemory = () => {
    if (memoryPlaybackRef.current) clearInterval(memoryPlaybackRef.current);
    memoryPlaybackRef.current = null;
  };

  useEffect(() => {
    return () => {
      cleanupRhythm();
      cleanupMemory();
    };
  }, []);

  const runSession = async (session: SessionConfig) => {
    if (
      session.key === 'mood_bloom' ||
      session.key === 'emotional_color_flow' ||
      session.key === 'energy_rhythm_match' ||
      session.key === 'memory_pulse'
    ) {
      setActiveExperience(session.key);
      if (session.key === 'energy_rhythm_match') {
        const now = Date.now();
        setRhythmStartedAt(now);
        setRhythmElapsed(0);
        rhythmPulseTimesRef.current = [];
        rhythmTapTimesRef.current = [];
        cleanupRhythm();
        const schedulePulse = () => {
          const current = Date.now();
          setRhythmPulse((prev) => !prev);
          rhythmPulseTimesRef.current.push(current);
          const wait = [900, 980, 860, 1020, 940, 890][rhythmPulseTimesRef.current.length % 6];
          rhythmPulseTimerRef.current = setTimeout(schedulePulse, wait);
        };
        schedulePulse();
        rhythmTickerRef.current = setInterval(() => {
          setRhythmElapsed(Date.now() - now);
        }, 300);
      }
      if (session.key === 'memory_pulse') {
        setMemoryFailures(0);
        setMemoryHits(0);
        setMemoryAttempts(0);
        setMemoryUserInput([]);
        setMemoryHighlight(null);
        memoryStartedRef.current = Date.now();
        const seed = [Math.floor(Math.random() * 4), Math.floor(Math.random() * 4), Math.floor(Math.random() * 4)];
        setMemorySequence(seed);
        setMemoryPhase('observe');
      }
      return;
    }

    const now = new Date().toISOString();
    const result: SessionResult = {
      sessionType: session.key,
      emotionalState: session.mode === 'emotion' ? 'lifted' : 'steady',
      calmImpact: session.mode === 'breathing' ? 9 : session.mode === 'emotion' ? 6 : 4,
      focusImpact: session.mode === 'focus' ? 8 : 3,
      stressRecoveryImpact: session.mode === 'breathing' ? 8 : 5,
      recoveryContribution: session.mode === 'breathing' ? 7 : 5,
      trendDirection: 'up',
      timestamp: now
    };

    setLastResult(result);
    setWellness((previous) => {
      const breathingGain = session.mode === 'breathing' ? 4 : 1;
      const focusGain = session.mode === 'focus' ? 6 : 2;
      const stressDrop = session.mode === 'breathing' ? 3 : 1;
      const calmBoost = session.mode === 'emotion' ? 2 : 1;
      const nextStress = Math.max(10, previous.stressScore - stressDrop);
      return {
        ...previous,
        breathingMinutes: previous.breathingMinutes + breathingGain,
        focusMinutes: previous.focusMinutes + focusGain,
        stressScore: nextStress,
        moodScore: Math.min(100, previous.moodScore + calmBoost),
        wellnessScore: Math.min(100, previous.wellnessScore + result.recoveryContribution)
      };
    });

    if (session.key === 'breathing_sync') {
      navigation.navigate('BreathingSession');
    } else if (session.key === 'focus_light') {
      navigation.navigate('FocusSession');
    } else if (session.key === 'breathing_garden') {
      navigation.navigate('BreathingSession');
    } else {
      setStatusMessage('Session logged. Calm rhythm is improving with consistent daily practice.');
    }
  };

  useEffect(() => {
    if (activeExperience !== 'memory_pulse' || memoryPhase !== 'observe' || memorySequence.length === 0) return;
    cleanupMemory();
    let index = 0;
    memoryPlaybackRef.current = setInterval(() => {
      const node = memorySequence[index];
      setMemoryHighlight(node);
      setTimeout(() => setMemoryHighlight(null), 260);
      index += 1;
      if (index >= memorySequence.length) {
        cleanupMemory();
        setMemoryPhase('repeat');
      }
    }, 620);
  }, [activeExperience, memoryPhase, memorySequence]);

  const finalizeInteractiveResult = async (result: SessionResult, message: string, payload: SessionStoragePayload) => {
    setLastResult(result);
    setStatusMessage(message);
    setWellness((previous) => ({
      ...previous,
      breathingMinutes: previous.breathingMinutes + Math.max(1, Math.round(result.calmImpact / 3)),
      focusMinutes: previous.focusMinutes + Math.max(1, Math.round(result.focusImpact / 2)),
      stressScore: Math.max(10, previous.stressScore - Math.max(1, Math.round(result.stressRecoveryImpact / 2))),
      moodScore: Math.min(100, previous.moodScore + Math.max(1, Math.round(result.calmImpact / 4))),
      wellnessScore: Math.min(100, previous.wellnessScore + result.recoveryContribution)
    }));
    await persistSessionPayload(payload);
    setActiveExperience(null);
  };

  const completeMoodBloom = async () => {
    if (!bloomMood) return;
    const calmWeight = bloomMood === 'calm' || bloomMood === 'balanced' || bloomMood === 'hopeful' ? 8 : 5;
    const emotionalRecoveryWeight = bloomMood === 'drained' || bloomMood === 'heavy' ? 5 : 8;
    await finalizeInteractiveResult(
      {
        sessionType: 'mood_bloom',
        emotionalState: bloomMood === 'drained' ? 'settling' : 'lifted',
        calmImpact: calmWeight,
        focusImpact: 4,
        stressRecoveryImpact: emotionalRecoveryWeight,
        recoveryContribution: 6,
        trendDirection: 'up',
        timestamp: new Date().toISOString()
      },
      'Emotional balance settling. Your mood rhythm is becoming more coherent.',
      {
        type: 'mood_bloom',
        emotionalTone: bloomMood,
        bloomState: `${bloomColor}-${bloomSoftness}-${bloomTone}`,
        calmWeight,
        emotionalRecoveryWeight,
        timestamp: new Date().toISOString()
      }
    );
  };

  const completeColorFlow = async () => {
    if (!flowPrimary || !flowSecondary || !flowDirection) return;
    const calmWeight = flowDirection === 'calm' || flowDirection === 'rest' ? 8 : 6;
    await finalizeInteractiveResult(
      {
        sessionType: 'emotional_color_flow',
        emotionalState: 'steady',
        calmImpact: calmWeight,
        focusImpact: flowDirection === 'focus' || flowDirection === 'clarity' ? 7 : 4,
        stressRecoveryImpact: 6,
        recoveryContribution: 6,
        trendDirection: 'up',
        timestamp: new Date().toISOString()
      },
      'Emotional direction is stabilizing. Calm tendency is improving.',
      {
        type: 'emotional_color_flow',
        primaryColorEmotion: flowPrimary,
        secondaryEmotion: flowSecondary,
        calmDirection: flowDirection,
        emotionalRecoveryTrend: 'up',
        timestamp: new Date().toISOString()
      }
    );
  };

  const tapRhythm = () => {
    rhythmTapTimesRef.current.push(Date.now());
  };

  const completeRhythm = async () => {
    cleanupRhythm();
    const elapsedSec = Math.max(1, Math.round(rhythmElapsed / 1000));
    const taps = rhythmTapTimesRef.current;
    const pulses = rhythmPulseTimesRef.current;
    const matches = taps.filter((tap) => pulses.some((pulse) => Math.abs(tap - pulse) <= 220)).length;
    const tapConsistency = Math.min(100, Math.round((matches / Math.max(1, taps.length)) * 100));
    const rhythmStability = Math.min(100, Math.round((elapsedSec / 60) * 55 + (tapConsistency / 100) * 45));
    const stressRecoveryWeight = Math.round((tapConsistency + rhythmStability) / 20);
    const calmInfluence = Math.round((tapConsistency + rhythmStability) / 22);
    await finalizeInteractiveResult(
      {
        sessionType: 'energy_rhythm_match',
        emotionalState: tapConsistency >= 65 ? 'steady' : 'settling',
        calmImpact: calmInfluence,
        focusImpact: 4,
        stressRecoveryImpact: stressRecoveryWeight,
        recoveryContribution: Math.max(4, Math.round((tapConsistency + rhythmStability) / 30)),
        trendDirection: 'up',
        timestamp: new Date().toISOString()
      },
      tapConsistency >= 65 ? 'Calm rhythm improving. Nervous-system pacing is settling.' : 'Rhythm is still adapting. A second short round may improve steadiness.',
      {
        type: 'energy_rhythm_match',
        tapConsistency,
        rhythmStability,
        stressRecoveryWeight,
        calmInfluence,
        timestamp: new Date().toISOString()
      }
    );
  };

  const onMemoryTap = async (node: number) => {
    if (activeExperience !== 'memory_pulse' || memoryPhase !== 'repeat') return;
    const next = [...memoryUserInput, node];
    setMemoryUserInput(next);
    setMemoryAttempts((prev) => prev + 1);
    const expected = memorySequence[next.length - 1];
    if (node !== expected) {
      const failures = memoryFailures + 1;
      setMemoryFailures(failures);
      setMemoryUserInput([]);
      if (failures >= 3 || (memoryStartedRef.current && Date.now() - memoryStartedRef.current >= 120000)) {
        const recallAccuracy = Math.max(20, Math.round((memoryHits / Math.max(1, memoryAttempts + 1)) * 100));
        const focusConsistency = Math.max(25, Math.round((memoryHits / Math.max(1, memorySequence.length * (failures + 1))) * 100));
        const mentalFatigueWeight = Math.max(2, 10 - Math.round(failures * 2.2));
        const cognitiveRecoveryWeight = Math.max(3, Math.round((recallAccuracy + focusConsistency) / 22));
        await finalizeInteractiveResult(
          {
            sessionType: 'memory_pulse',
            emotionalState: failures >= 3 ? 'settling' : 'steady',
            calmImpact: 4,
            focusImpact: cognitiveRecoveryWeight,
            stressRecoveryImpact: 5,
            recoveryContribution: Math.max(4, Math.round(cognitiveRecoveryWeight / 1.4)),
            trendDirection: 'steady',
            timestamp: new Date().toISOString()
          },
          failures >= 3 ? 'Focus steadiness is rebuilding. Short daily memory practice can improve clarity.' : 'Focus continuity recovered. Cognitive rhythm looks steadier.',
          {
            type: 'memory_pulse',
            recallAccuracy,
            focusConsistency,
            mentalFatigueWeight,
            cognitiveRecoveryWeight,
            timestamp: new Date().toISOString()
          }
        );
      } else {
        setMemoryPhase('observe');
      }
      return;
    }

    setMemoryHits((prev) => prev + 1);
    if (next.length >= memorySequence.length) {
      const nextLength = Math.min(5, memorySequence.length + 1);
      const newSeq = Array.from({ length: nextLength }, () => Math.floor(Math.random() * 4));
      setMemorySequence(newSeq);
      setMemoryUserInput([]);
      setMemoryPhase('observe');
    }
  };

  return (
    <Screen scroll contentStyle={styles.screenContent}>
      <Text style={[styles.heading, { color: palette.textPrimary }]}>Sessions</Text>
      <Text style={[styles.subheading, { color: palette.textSecondary }]}>Emotional Recovery & Brain Wellness</Text>

      <Card style={[styles.infoCard, { borderColor: '#60AF00', backgroundColor: isLight ? 'rgba(96,175,0,0.10)' : 'rgba(96,175,0,0.08)' }]}>
        <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>Today’s Session Focus</Text>
        <Text style={[styles.bodyText, { color: palette.textSecondary }]}>Choose one session. We’ll use interaction consistency to improve calm and stress recovery signals.</Text>
      </Card>

      <SessionGroup
        title="Calm Recovery"
        sessions={grouped.calm}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onStart={runSession}
        isLight={isLight}
        palette={palette}
        primaryActionLabels={{
          breathing_sync: 'Start Breathing',
          breathing_garden: 'Start Walk'
        }}
      />
      <SessionGroup
        title="Focus & Brain"
        sessions={grouped.focus}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onStart={runSession}
        isLight={isLight}
        palette={palette}
      />
      <SessionGroup
        title="Cycle Wellness"
        sessions={grouped.cycle}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onStart={runSession}
        isLight={isLight}
        palette={palette}
      />
      <SessionGroup
        title="Emotional Balance"
        sessions={grouped.emotion}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onStart={runSession}
        isLight={isLight}
        palette={palette}
      />

      <Card style={[styles.statusCard, { borderColor: palette.stroke, backgroundColor: isLight ? '#FFFFFF' : palette.cardRaised }]}>
        <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>Session Interpretation</Text>
        <Text style={[styles.bodyText, { color: palette.textSecondary }]}>{statusMessage}</Text>
        {lastResult ? (
          <View style={styles.resultRow}>
            <Text style={[styles.resultLabel, { color: palette.textSecondary }]}>Calm impact</Text>
            <Text style={[styles.resultValue, { color: palette.textPrimary }]}>+{lastResult.calmImpact}</Text>
          </View>
        ) : null}
        {lastResult ? (
          <View style={styles.resultRow}>
            <Text style={[styles.resultLabel, { color: palette.textSecondary }]}>Stress recovery</Text>
            <Text style={[styles.resultValue, { color: palette.textPrimary }]}>+{lastResult.stressRecoveryImpact}</Text>
          </View>
        ) : null}
      </Card>

      <Modal visible={activeExperience !== null} transparent animationType="fade" onRequestClose={() => setActiveExperience(null)}>
        <View style={[styles.modalOverlay, { backgroundColor: isLight ? 'rgba(15,23,42,0.40)' : 'rgba(0,0,0,0.62)' }]}>
          <View style={[styles.modalCard, { borderColor: isLight ? '#CBD5E1' : '#3B4555', backgroundColor: isLight ? '#FFFFFF' : '#1A1E28' }]}>
            {activeExperience === 'mood_bloom' ? (
              <>
                <Text style={styles.cardTitle}>Mood Bloom</Text>
                <Text style={styles.bodyText}>Choose today’s emotional atmosphere.</Text>
                <View style={styles.rowWrap}>
                  {(['rose', 'lavender', 'peach', 'dusk'] as const).map((value) => (
                    <Pressable key={value} style={[styles.softChip, bloomColor === value && styles.softChipActive]} onPress={() => setBloomColor(value)}>
                      <Text style={[styles.chipText, { color: palette.textPrimary }]}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.rowWrap}>
                  {(['soft', 'gentle', 'deep'] as const).map((value) => (
                    <Pressable key={value} style={[styles.softChip, bloomSoftness === value && styles.softChipActive]} onPress={() => setBloomSoftness(value)}>
                      <Text style={[styles.chipText, { color: palette.textPrimary }]}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.rowWrap}>
                  {(['light', 'balanced', 'reflective'] as const).map((value) => (
                    <Pressable key={value} style={[styles.softChip, bloomTone === value && styles.softChipActive]} onPress={() => setBloomTone(value)}>
                      <Text style={[styles.chipText, { color: palette.textPrimary }]}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
                <LinearGradient colors={['rgba(214,136,176,0.42)', 'rgba(179,128,214,0.14)']} style={styles.bloomPreview}>
                  <Text style={styles.previewText}>Daily Bloom</Text>
                </LinearGradient>
                <View style={styles.rowWrap}>
                  {(['calm', 'heavy', 'emotional', 'balanced', 'drained', 'hopeful'] as const).map((value) => (
                    <Pressable key={value} style={[styles.softChip, bloomMood === value && styles.softChipActive]} onPress={() => setBloomMood(value)}>
                      <Text style={[styles.chipText, { color: palette.textPrimary }]}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable style={styles.sessionCTA} onPress={completeMoodBloom} disabled={!bloomMood}>
                  <Text style={styles.sessionCTAText}>Complete Mood Bloom</Text>
                </Pressable>
              </>
            ) : null}

            {activeExperience === 'emotional_color_flow' ? (
              <>
                <Text style={styles.cardTitle}>Emotional Color Flow</Text>
                <Text style={styles.bodyText}>Tap the atmosphere that feels closest right now.</Text>
                <View style={styles.orbRow}>
                  {[
                    { id: 'rose_haze', colors: ['#6A293D', '#321B2D'] as const },
                    { id: 'lavender_mist', colors: ['#6A5FA2', '#30284B'] as const },
                    { id: 'peach_warmth', colors: ['#8C5A45', '#382A28'] as const },
                    { id: 'deep_night', colors: ['#36495A', '#1B2434'] as const }
                  ].map((orb) => (
                    <Pressable key={orb.id} onPress={() => setFlowPrimary(orb.id as typeof flowPrimary)}>
                      <LinearGradient colors={orb.colors} style={[styles.colorOrb, flowPrimary === orb.id && styles.colorOrbActive]} />
                    </Pressable>
                  ))}
                </View>
                <View style={styles.rowWrap}>
                  {(['calm', 'warmth', 'clarity', 'rest', 'focus'] as const).map((value) => (
                    <Pressable key={value} style={[styles.softChip, flowSecondary === value && styles.softChipActive]} onPress={() => setFlowSecondary(value)}>
                      <Text style={[styles.chipText, { color: palette.textPrimary }]}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.bodyText}>Drag direction substitute: choose your direction.</Text>
                <View style={styles.rowWrap}>
                  {(['calm', 'warmth', 'clarity', 'rest', 'focus'] as const).map((value) => (
                    <Pressable key={value} style={[styles.softChip, flowDirection === value && styles.softChipActive]} onPress={() => setFlowDirection(value)}>
                      <Text style={styles.chipText}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable style={styles.sessionCTA} onPress={completeColorFlow} disabled={!flowPrimary || !flowSecondary || !flowDirection}>
                  <Text style={styles.sessionCTAText}>Complete Color Flow</Text>
                </Pressable>
              </>
            ) : null}

            {activeExperience === 'energy_rhythm_match' ? (
              <>
                <Text style={styles.cardTitle}>Energy Rhythm Match</Text>
                <Text style={styles.bodyText}>Tap with the soft pulse. Keep a calm rhythm for 30-60 seconds.</Text>
                <View style={[styles.rhythmPulse, rhythmPulse && styles.rhythmPulseActive]}>
                  <Text style={styles.previewText}>{Math.round(rhythmElapsed / 1000)}s</Text>
                </View>
                <Pressable style={styles.sessionCTA} onPress={tapRhythm}>
                  <Text style={styles.sessionCTAText}>Tap with Pulse</Text>
                </Pressable>
                <Pressable style={[styles.sessionCTA, styles.secondaryCTA]} onPress={completeRhythm} disabled={rhythmElapsed < 30000}>
                  <Text style={styles.sessionCTAText}>Finish Session</Text>
                </Pressable>
              </>
            ) : null}

            {activeExperience === 'memory_pulse' ? (
              <>
                <Text style={styles.cardTitle}>Memory Pulse</Text>
                <Text style={styles.bodyText}>
                  {memoryPhase === 'observe' ? 'Watch the glow sequence.' : 'Repeat the sequence calmly.'} Failures: {memoryFailures}/3
                </Text>
                <View style={styles.memoryGrid}>
                  {[0, 1, 2, 3].map((node) => (
                    <Pressable
                      key={String(node)}
                      style={[styles.memoryNode, memoryHighlight === node && styles.memoryNodeActive]}
                      onPress={() => onMemoryTap(node)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <Pressable
              style={[styles.sessionCTA, styles.closeCTA]}
              onPress={() => {
                cleanupRhythm();
                cleanupMemory();
                setActiveExperience(null);
              }}
            >
              <Text style={styles.sessionCTAText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const SessionGroup = ({
  title,
  sessions,
  selectedKey,
  onSelect,
  onStart,
  primaryActionLabels,
  isLight,
  palette
}: {
  title: string;
  sessions: SessionConfig[];
  selectedKey: SessionType;
  onSelect: (key: SessionType) => void;
  onStart: (session: SessionConfig) => void;
  primaryActionLabels?: Partial<Record<SessionType, string>>;
  isLight: boolean;
  palette: ReturnType<typeof getThemeColors>;
}) => {
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: '#60AF00' }]}>{title}</Text>
      {sessions.map((session) => {
        const selected = session.key === selectedKey;
        const ctaLabel = primaryActionLabels?.[session.key] ?? 'Start Session';
        return (
          <Card key={session.key} style={[styles.sessionCard, { backgroundColor: isLight ? '#FFFFFF' : palette.cardRaised, borderColor: palette.stroke }, selected && [styles.sessionCardActive, { borderColor: '#60AF00', backgroundColor: isLight ? 'rgba(96,175,0,0.10)' : colors.blueSoft }]]}>
            <Pressable onPress={() => onSelect(session.key)} style={styles.sessionMeta}>
              <Text style={[styles.sessionTitle, { color: palette.textPrimary }]}>{session.title}</Text>
              <Text style={[styles.bodyText, { color: palette.textSecondary }]}>{session.subtitle}</Text>
              <Text style={styles.impactText}>{session.impactLabel}</Text>
            </Pressable>
            <Pressable style={[styles.sessionCTA, { backgroundColor: '#60AF00' }]} onPress={() => onStart(session)}>
              <Text style={styles.sessionCTAText}>{ctaLabel}</Text>
            </Pressable>
          </Card>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: 130
  },
  heading: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2
  },
  subheading: {
    ...typography.body,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.sm
  },
  infoCard: {
    marginBottom: spacing.sm,
    backgroundColor: 'rgba(96, 175, 0, 0.08)',
    borderColor: colors.blue
  },
  statusCard: {
    marginTop: spacing.sm,
    marginBottom: spacing.md
  },
  cardTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6
  },
  bodyText: {
    ...typography.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary
  },
  group: {
    marginTop: spacing.xs,
    gap: spacing.xs
  },
  groupTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 20,
    color: colors.blue
  },
  sessionCard: {
    gap: spacing.sm
  },
  sessionCardActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  sessionMeta: {
    gap: 4
  },
  sessionTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 20
  },
  impactText: {
    ...typography.bodyStrong,
    fontSize: 12,
    lineHeight: 18,
    color: colors.blue,
    marginTop: 2
  },
  sessionCTA: {
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sessionCTAText: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 20,
    color: '#000000'
  },
  resultRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  resultLabel: {
    ...typography.body,
    fontSize: 12,
    lineHeight: 18
  },
  resultValue: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 20
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    padding: spacing.md
  },
  modalCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#3B4555',
    backgroundColor: '#1A1E28',
    padding: spacing.md,
    gap: spacing.sm
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  softChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#4A5261',
    backgroundColor: '#252B36',
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  softChipActive: {
    borderColor: '#D5A4C7',
    backgroundColor: '#3D2E42'
  },
  chipText: {
    ...typography.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary
  },
  bloomPreview: {
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)'
  },
  previewText: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 20
  },
  orbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  colorOrb: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)'
  },
  colorOrbActive: {
    borderColor: '#E5C4DA',
    borderWidth: 2
  },
  rhythmPulse: {
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: '#4D586C',
    backgroundColor: '#2A3140',
    alignItems: 'center',
    justifyContent: 'center'
  },
  rhythmPulseActive: {
    backgroundColor: '#3C4960'
  },
  secondaryCTA: {
    backgroundColor: '#7A5B6D'
  },
  closeCTA: {
    backgroundColor: '#2B3344'
  },
  memoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    paddingVertical: 6
  },
  memoryNode: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: '#5A6477',
    backgroundColor: '#272D3B'
  },
  memoryNodeActive: {
    backgroundColor: '#A67FC4'
  }
});
