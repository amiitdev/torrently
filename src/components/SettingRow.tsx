import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import Lucide from '@react-native-vector-icons/lucide';
import { colors, radius, spacing, typography } from '../theme';

interface ToggleRowProps {
  icon?: string;
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({
  icon,
  title,
  description,
  value,
  onValueChange,
  disabled,
}: ToggleRowProps) {
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Lucide name={icon as any} size={17} color={colors.textSecondary} />
        </View>
      ) : null}
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.secondary, true: colors.primary }}
        thumbColor={colors.text}
        ios_backgroundColor={colors.secondary}
      />
    </View>
  );
}

interface ValueRowProps {
  icon?: string;
  title: string;
  description?: string;
  value: string;
  onPress?: () => void;
  danger?: boolean;
}

export function ValueRow({ icon, title, description, value, onPress, danger }: ValueRowProps) {
  return (
    <View
      style={[styles.row, onPress && styles.pressable]}
      onTouchEnd={onPress}
      accessible={!!onPress}
      accessibilityRole={onPress ? 'button' : undefined}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Lucide name={icon as any} size={17} color={danger ? colors.error : colors.textSecondary} />
        </View>
      ) : null}
      <View style={styles.textWrap}>
        <Text style={[styles.title, danger && { color: colors.error }]}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Text style={[styles.value, danger && { color: colors.error }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.elevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: 60,
  },
  pressable: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  value: {
    ...typography.caption,
    color: colors.textSecondary,
    maxWidth: 150,
    textAlign: 'right',
  },
});

