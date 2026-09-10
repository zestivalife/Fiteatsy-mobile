import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Platform, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, getThemeGradients, spacing } from '../design/tokens';
import { useAppContext } from '../state/AppContext';

export const Screen = ({
  children,
  scroll = false,
  contentStyle
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) => {
  const { themeMode } = useAppContext();
  const themeGradients = getThemeGradients(themeMode);
  const backgroundGradient = themeGradients.appBackground;

  return (
    <LinearGradient colors={[...backgroundGradient]} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        {scroll ? (
          <ScrollView
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            contentContainerStyle={[styles.content, contentStyle]}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >{children}</ScrollView>
        ) : (
          <View style={[styles.content, contentStyle]}>{children}</View>
        )}
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
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  }
});
