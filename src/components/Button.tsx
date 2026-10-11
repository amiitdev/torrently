import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

const backgrounds: Record<Variant, string> = {
  primary: colors.primary,
  secondary: colors.secondaryAccent,
  ghost: colors.secondary,
  danger: colors.error,
  success: colors.success,
};

const labels: Record<Variant, string> = {
  primary: '#FFFFFF',
  secondary: '#FFFFFF',
  ghost: colors.text,
  danger: '#1A0508',
  success: '#052E1C',
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  icon,
  style,
  fullWidth,
}: ButtonProps) {
  const height = size === 'lg' ? 52 : size === 'sm' ? 36 : 44;
  const fontSize = size === 'lg' ? 16 : size === 'sm' ? 13 : 15;
  const labelStyle = [
    styles.label,
    { color: labels[variant], fontSize, marginLeft: icon ? spacing.sm : 0 },
  ];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: backgrounds[variant],
          borderRadius: radius.md,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={labels[variant]} />
      ) : (
        <>
          {icon}
          <Text style={labelStyle}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    ...typography.heading,
    fontWeight: '600',
  },
});

export default Button;
