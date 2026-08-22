import React, { ReactNode, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../design/tokens';

export type OnboardingPhase = 'BASICS' | 'LIFESTYLE' | 'RECOVERY' | 'CONNECT' | 'READY';

const phaseIndex: Record<OnboardingPhase, number> = { BASICS: 0, LIFESTYLE: 1, RECOVERY: 2, CONNECT: 3, READY: 4 };

export const OnboardingShell = ({ phase, phaseLabel, step, total, onBack, children, action, direction = 'forward', scroll = true }: {
  phase: OnboardingPhase;
  phaseLabel?: string;
  step: number;
  total: number;
  onBack?: () => void;
  children: ReactNode;
  action?: ReactNode;
  direction?: 'forward' | 'back';
  scroll?: boolean;
}) => {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentX = useRef(new Animated.Value(direction === 'forward' ? 16 : -16)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active) return;
      progress.setValue(0);
      contentOpacity.setValue(reduced ? 1 : 0);
      contentX.setValue(reduced ? 0 : direction === 'forward' ? 16 : -16);
      Animated.parallel([
        Animated.timing(progress, { toValue: 1, duration: reduced ? 0 : 220, useNativeDriver: false }),
        Animated.timing(contentOpacity, { toValue: 1, duration: reduced ? 0 : 200, useNativeDriver: true }),
        Animated.timing(contentX, { toValue: 0, duration: reduced ? 0 : 220, useNativeDriver: true })
      ]).start();
    });
    return () => { active = false; };
  }, [contentOpacity, contentX, direction, phase, progress, step]);

  const currentPhase = phaseIndex[phase];
  const content = (
    <Animated.View style={[styles.content, { opacity: contentOpacity, transform: [{ translateX: contentX }] }]}>
      {children}
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
          ) : <View style={styles.backSpacer} />}
          <View style={styles.progressColumn}>
            <View style={styles.phaseRow}>
              <Text style={[styles.phase, phaseLabel && styles.phaseQualifier]}>{phaseLabel ?? phase}</Text>
              <Text style={styles.counter}>{step} of {total}</Text>
            </View>
            <View style={styles.segments}>
              {[0, 1, 2, 3, 4].map((index) => {
                const completed = index < currentPhase;
                const current = index === currentPhase;
                const width = current
                  ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.max(12, (step / total) * 100)}%`] })
                  : completed ? '100%' : '0%';
                return <View key={index} style={styles.track}><Animated.View style={[styles.fill, current && styles.currentFill, { width }]} /></View>;
              })}
            </View>
          </View>
        </View>
        {scroll ? <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}
        {action ? <View style={[styles.action, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>{action}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export const OnboardingAction = ({ title, onPress, disabled = false, secondary }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.actionButton, secondary && styles.secondaryButton, disabled && styles.disabled, pressed && styles.actionPressed]}
  >
    <Text style={[styles.actionText, secondary && styles.secondaryText]}>{title}</Text>
  </Pressable>
);

export const ChoiceCard = ({ label, description, selected, onPress, accent = colors.success, icon }: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  accent?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) => (
  <Pressable
    accessibilityRole="checkbox"
    accessibilityState={{ checked: selected }}
    onPress={onPress}
    style={({ pressed }) => [styles.choice, selected && { borderColor: accent, backgroundColor: `${accent}12` }, pressed && styles.choicePressed]}
  >
    {icon ? <View style={[styles.choiceIcon, selected && { backgroundColor: `${accent}22` }]}><Ionicons name={icon} size={20} color={selected ? accent : colors.textSecondary} /></View> : null}
    <View style={styles.choiceCopy}><Text style={styles.choiceLabel}>{label}</Text>{description ? <Text style={styles.choiceDescription}>{description}</Text> : null}</View>
    <View style={[styles.check, selected && { backgroundColor: accent, borderColor: accent }]}>{selected ? <Ionicons name="checkmark" size={16} color="#06100B" /> : null}</View>
  </Pressable>
);

export const QuestionHeader = ({ title, description }: { title: string; description?: string }) => (
  <View style={styles.questionWrap}><Text style={styles.question}>{title}</Text>{description ? <Text style={styles.description}>{description}</Text> : null}</View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg },
  back: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardMuted },
  backSpacer: { width: 44, height: 44 },
  pressed: { opacity: 0.72 },
  progressColumn: { flex: 1, gap: spacing.xs },
  phaseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  phase: { ...typography.label, fontSize: 12, lineHeight: 17, color: colors.success },
  phaseQualifier: { color: colors.blue },
  counter: { ...typography.caption, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  segments: { flexDirection: 'row', gap: 4 },
  track: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: '#262832' },
  fill: { height: 3, borderRadius: 2, backgroundColor: colors.success },
  currentFill: { backgroundColor: colors.blue },
  scroll: { flexGrow: 1, paddingBottom: spacing.xl },
  content: { flex: 1, width: '100%', paddingHorizontal: spacing.md },
  action: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.stroke, paddingHorizontal: spacing.md, paddingTop: spacing.md, backgroundColor: colors.bgPrimary },
  actionButton: { minHeight: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: '#49DF86' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.stroke, marginTop: spacing.sm },
  disabled: { opacity: 0.45 },
  actionPressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  actionText: { ...typography.button, fontSize: 16, lineHeight: 20, color: '#07120D' },
  secondaryText: { color: colors.textSecondary },
  questionWrap: { marginBottom: spacing.xl },
  question: { ...typography.sectionTitle, fontSize: 20, lineHeight: 26, color: colors.textPrimary },
  description: { ...typography.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.sm },
  choice: { minHeight: 64, borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.lg, backgroundColor: colors.cardMuted, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  choicePressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  choiceIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' },
  choiceCopy: { flex: 1 },
  choiceLabel: { ...typography.bodyStrong, fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  choiceDescription: { ...typography.caption, fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke, alignItems: 'center', justifyContent: 'center' }
});
