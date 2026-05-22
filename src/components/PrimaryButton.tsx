import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, typography } from '../design/tokens';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const PrimaryButton = ({ title, onPress, disabled = false, style }: Props) => {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, disabled && styles.buttonDisabled, style]}
    >
      <Text style={styles.label}>{title}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.blue,
    borderRadius: radius.pill,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonPressed: {
    opacity: 0.9
  },
  buttonDisabled: {
    opacity: 0.5
  },
  label: {
    ...typography.bodyStrong,
    color: colors.white,
    fontSize: 15
  }
});
