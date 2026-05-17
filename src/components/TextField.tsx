import React from 'react';
import { StyleSheet, Text, TextInput, View, TextInputProps } from 'react-native';
import { colors, radius, typography } from '../design/tokens';

type Props = TextInputProps & {
  label: string;
};

export const TextField = ({ label, ...props }: Props) => {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
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
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
    color: colors.textPrimary,
    paddingHorizontal: 14
  }
});
