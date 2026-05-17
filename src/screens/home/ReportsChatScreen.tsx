import React, { useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { colors, gradients, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { generateNuetraChat, NuetraChatMessage, ReportParameter } from '../../services/nuetraService';
import { useAppContext } from '../../state/AppContext';

const suggestedQuestions = [
  'Why is my Vitamin D low?',
  'Am I pre-diabetic?',
  'What should I eat this week?',
  'Explain my cholesterol'
];

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ReportsChatRoute = RouteProp<RootStackParamList, 'ReportsChat'>;

const TypingDots = ({ color }: { color: string }) => {
  const anim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true
      })
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <View style={styles.typingWrap}>
      {[0, 1, 2].map((index) => {
        const opacity = anim.interpolate({
          inputRange: [0, 0.2 + index * 0.15, 0.35 + index * 0.15, 1],
          outputRange: [0.2, 1, 0.2, 0.2]
        });

        return <Animated.View key={index} style={[styles.typingDot, { backgroundColor: color, opacity }]} />;
      })}
    </View>
  );
};

const generateOfflineNuetraReply = (question: string, parameters: ReportParameter[]) => {
  const lowerQuestion = question.toLowerCase();
  const vitaminD = parameters.find((parameter) => parameter.name.toLowerCase().includes('vitamin d'));
  const hba1c = parameters.find((parameter) => parameter.name.toLowerCase().includes('hba1c'));
  const ldl = parameters.find((parameter) => parameter.name.toLowerCase().includes('ldl'));
  const primary = parameters.find((parameter) => parameter.status !== 'normal') ?? parameters[0];

  if (vitaminD && lowerQuestion.includes('vitamin d')) {
    return `Your Vitamin D is ${vitaminD.value} ${vitaminD.unit}, below the ${vitaminD.referenceRange} range. Low sunlight exposure and indoor routines often cause this. Start a consistent sunlight + nutrition routine this week and review supplement need with your clinician.`;
  }

  if (hba1c && (lowerQuestion.includes('diabet') || lowerQuestion.includes('sugar'))) {
    return `Your HbA1c is ${hba1c.value}${hba1c.unit}, compared with ${hba1c.referenceRange}. This indicates early glucose stress, not a diagnosis by itself. This week, prioritize post-meal walks and reduce refined sugar load.`;
  }

  if (ldl && lowerQuestion.includes('cholesterol')) {
    return `Your LDL is ${ldl.value} ${ldl.unit}, higher than ${ldl.referenceRange}. This can improve with food quality and movement consistency. Start with a 7-day plan focused on fiber, hydration, and daily steps.`;
  }

  if (primary) {
    return `I can still help while backend reconnects. Your ${primary.name} is ${primary.value} ${primary.unit} against ${primary.referenceRange}. Let us take one focused action this week and track change in your next report.`;
  }

  return 'I can still help while backend reconnects. Ask me about any parameter and I will explain it simply using your current report values.';
};

export const ReportsChatScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ReportsChatRoute>();
  const { themeMode } = useAppContext();
  const isLight = themeMode === 'light';

  const [messages, setMessages] = useState<NuetraChatMessage[]>([
    {
      role: 'assistant',
      content: `I reviewed your ${route.params.reportName} report. Ask anything and I will explain it simply.`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const canSend = input.trim().length > 0 && loading === false;

  const submitMessage = async (raw: string) => {
    const content = raw.trim();
    if (!content || loading) {
      return;
    }

    const nextMessages: NuetraChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await generateNuetraChat(content, nextMessages, route.params.reportParameters);
      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
    } catch {
      const fallback = generateOfflineNuetraReply(content, route.params.reportParameters);
      setMessages((prev) => [...prev, { role: 'assistant', content: fallback }]);
    } finally {
      setLoading(false);
    }
  };

  const userBubble = colors.blueDark;
  const assistantBubble = colors.cardRaised;
  const assistantText = colors.textPrimary;
  const headerIconColor = colors.textPrimary;

  return (
    <Screen contentStyle={[styles.container, isLight && styles.containerLight]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={[styles.headerBtn, isLight && styles.headerBtnLight]} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color={headerIconColor} />
        </Pressable>
        <Text style={[styles.title, isLight && styles.titleLight]}>Ask Fiteatsy</Text>
        <View style={[styles.headerGhost, isLight && styles.headerBtnLight]} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled">
          {messages.map((item, index) => {
            const isUser = item.role === 'user';
            return (
              <View
                key={`${item.role}-${index}`}
                style={[
                  styles.bubble,
                  isUser ? styles.userBubble : styles.nuetraBubble,
                  { backgroundColor: isUser ? userBubble : assistantBubble },
                  isLight && !isUser && styles.nuetraBubbleLight
                ]}
              >
                {!isUser ? <Text style={styles.nuetraTag}>Fiteatsy</Text> : null}
                <Text style={[styles.bubbleText, isUser ? styles.userText : { color: assistantText }]}>{item.content}</Text>
              </View>
            );
          })}

          {loading ? (
            <View
              style={[
                styles.bubble,
                styles.nuetraBubble,
                { backgroundColor: assistantBubble },
                isLight && styles.nuetraBubbleLight
              ]}
            >
              <Text style={styles.nuetraTag}>Fiteatsy</Text>
              <TypingDots color={colors.blueDark} />
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.chipsRow}>
          {suggestedQuestions.map((question) => (
            <Pressable
              key={question}
              accessibilityRole="button"
              accessibilityLabel={question}
              onPress={() => submitMessage(question)}
              style={[styles.questionChip, isLight && styles.questionChipLight]}
            >
              <Text style={[styles.questionChipText, isLight && styles.questionChipTextLight]}>{question}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel="Ask Fiteatsy a question"
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your values"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, isLight && styles.inputLight]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: !canSend }} style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]} onPress={() => submitMessage(input)}>
            <Ionicons name="send" size={16} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: 'transparent'
  },
  containerLight: {
    backgroundColor: 'transparent'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardRaised,
    borderWidth: 1,
    borderColor: colors.strokeStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerGhost: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'transparent'
  },
  headerBtnLight: {
    backgroundColor: 'rgba(0,0,0,0.29)',
    borderColor: 'rgba(167,184,229,0.7)'
  },
  title: {
    ...typography.section,
    fontSize: 17,
    color: colors.textPrimary
  },
  titleLight: {
    color: colors.textPrimary
  },
  chatScroll: {
    flex: 1
  },
  chatContent: {
    gap: spacing.xs,
    paddingBottom: spacing.sm
  },
  bubble: {
    maxWidth: '90%',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  userBubble: {
    alignSelf: 'flex-end'
  },
  nuetraBubble: {
    alignSelf: 'flex-start',
    borderLeftWidth: 3,
    borderLeftColor: colors.blue
  },
  nuetraBubbleLight: {
    borderColor: colors.stroke
  },
  nuetraTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.blueDark,
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.xxs
  },
  bubbleText: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20
  },
  userText: {
    color: colors.white
  },
  typingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.xxs
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.sm
  },
  questionChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.strokeStrong,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  questionChipLight: {
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted
  },
  questionChipText: {
    ...typography.bodyStrong,
    fontSize: 12,
    color: colors.textMuted
  },
  questionChipTextLight: {
    color: colors.blueDark
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  input: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.strokeStrong,
    backgroundColor: colors.cardRaised,
    paddingHorizontal: spacing.sm,
    ...typography.body,
    color: colors.textPrimary
  },
  inputLight: {
    borderColor: 'rgba(167,184,229,0.7)',
    backgroundColor: 'rgba(0,0,0,0.29)',
    color: colors.textPrimary
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendBtnDisabled: {
    opacity: 0.45
  }
});
