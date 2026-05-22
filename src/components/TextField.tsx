import React from 'react';
import { StyleSheet, Text, TextInput, View, TextInputProps } from 'react-native';
import { getThemeColors, radius, typography } from '../design/tokens';
import { useAppContext } from '../state/AppContext';

type Props = TextInputProps & {
  label: string;
};

export const TextField = ({ label, ...props }: Props) => {
  const { themeMode } = useAppContext();
  const themeColors = getThemeColors(themeMode);

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: themeColors.textPrimary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={themeColors.textMuted}
        style={[
          styles.input,
          {
            borderColor: themeColors.stroke,
            backgroundColor: themeColors.cardMuted,
            color: themeColors.textPrimary
          }
        ]}
        {...props}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: 6
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  input: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14
  }
});
