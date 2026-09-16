import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Platform, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { spacing } from '../design/tokens';
import { AppBackground } from './AppBackground';

export const Screen = ({
  children,
  scroll = false,
  contentStyle,
  keyboardShouldPersistTaps = 'handled'
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
}) => {
  return (
    <AppBackground>
      <SafeAreaView style={styles.safe}>
        {scroll ? (
          <ScrollView
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            contentContainerStyle={[styles.content, contentStyle]}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >{children}</ScrollView>
        ) : (
          <View style={[styles.content, contentStyle]}>{children}</View>
        )}
      </SafeAreaView>
    </AppBackground>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  }
});
