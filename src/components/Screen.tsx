import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, Platform, RefreshControlProps, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, getThemeGradients, spacing } from '../design/tokens';
import { useAppContext } from '../state/AppContext';

export const Screen = ({
  children,
  scroll = false,
  keyboardAware = false,
  contentStyle,
  refreshControl
}: {
  children: React.ReactNode;
  scroll?: boolean;
  keyboardAware?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) => {
  const { themeMode } = useAppContext();
  const themeGradients = getThemeGradients(themeMode);
  const backgroundGradient = themeGradients.appBackground;

  const content = scroll ? (
    <ScrollView
      automaticallyAdjustKeyboardInsets={keyboardAware && Platform.OS === 'ios'}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardDismissMode={keyboardAware ? 'interactive' : 'none'}
      keyboardShouldPersistTaps={keyboardAware ? 'handled' : 'never'}
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );

  return (
    <LinearGradient colors={[...backgroundGradient]} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        {keyboardAware ? (
          <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {content}
          </KeyboardAvoidingView>
        ) : content}
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    backgroundColor: colors.bgPrimary
  },
  safe: {
    flex: 1
  },
  keyboardAvoiding: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  }
});
