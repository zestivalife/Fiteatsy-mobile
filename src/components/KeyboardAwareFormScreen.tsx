import React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, getThemeGradients, spacing } from '../design/tokens';
import { useAppContext } from '../state/AppContext';

type Props = {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: React.ReactNode;
  keyboardVerticalOffset?: number;
  testID?: string;
};

export const KeyboardAwareFormScreen = ({
  children,
  contentStyle,
  footer,
  keyboardVerticalOffset = 0,
  testID = 'keyboard-aware-form-screen'
}: Props) => {
  const { themeMode } = useAppContext();
  const insets = useSafeAreaInsets();
  const background = getThemeGradients(themeMode).appBackground;

  return (
    <LinearGradient colors={[...background]} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={keyboardVerticalOffset}
          style={styles.safe}
        >
          <Pressable accessibilityRole="none" onPress={Keyboard.dismiss} style={styles.safe}>
            <ScrollView
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }, contentStyle]}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              testID={testID}
            >
              {children}
            </ScrollView>
            {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>{footer}</View> : null}
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: { flex: 1, backgroundColor: colors.bgPrimary },
  safe: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm }
});
