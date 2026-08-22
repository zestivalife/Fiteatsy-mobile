import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, typography } from '../design/tokens';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
};

export const PrimaryButton = ({ title, onPress, disabled = false, loading = false, variant = 'primary', style }: Props) => {
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      onPress={onPress}
      disabled={unavailable}
      style={({ pressed }) => [styles.button, variant === 'secondary' && styles.secondary, pressed && styles.buttonPressed, unavailable && styles.buttonDisabled, style]}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' ? colors.white : colors.blue} /> : <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>{title}</Text>}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.blue,
    borderRadius: radius.pill,
    width: '100%',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.blue },
  buttonPressed: {
    opacity: 0.9
  },
  buttonDisabled: {
    opacity: 0.5
  },
  label: {
    ...typography.button,
    color: colors.white,
  },
  secondaryLabel: { color: colors.blue }
});
