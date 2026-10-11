import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Lucide from '@react-native-vector-icons/lucide';
import { colors, radius, spacing, typography } from '../theme';

interface StatTileProps {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  tint?: string;
  style?: ViewStyle;
}

export function StatTile({ icon, label, value, sub, tint = colors.primary, style }: StatTileProps) {
  return (
    <View style={[styles.tile, style]}>
      <View style={[styles.iconWrap, { backgroundColor: `${tint}22` }]}>
        <Lucide name={icon as any} size={16} color={tint} />
      </View>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {sub ? (
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.elevated,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    flex: 1,
    minWidth: 150,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  value: {
    ...typography.title,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sub: {
    ...typography.micro,
    color: colors.textSecondary,
    marginTop: 6,
  },
});

export default StatTile;
