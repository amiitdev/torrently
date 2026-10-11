import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TorrentState } from '../types';
import { STATE_LABEL } from '../utils/torrentStatus';
import { colors, radius, spacing, typography } from '../theme';

const toneFor: Record<TorrentState, { bg: string; fg: string }> = {
  downloading: { bg: 'rgba(244, 63, 94, 0.16)', fg: colors.primary },
  metadata: { bg: 'rgba(139, 92, 246, 0.18)', fg: colors.secondaryAccent },
  checking: { bg: 'rgba(139, 92, 246, 0.18)', fg: colors.secondaryAccent },
  queued: { bg: 'rgba(52, 211, 153, 0.14)', fg: colors.success },
  stalled: { bg: 'rgba(251, 191, 36, 0.14)', fg: colors.warning },
  paused: { bg: 'rgba(161, 161, 178, 0.16)', fg: colors.textSecondary },
  completed: { bg: 'rgba(52, 211, 153, 0.14)', fg: colors.success },
  seeding: { bg: 'rgba(52, 211, 153, 0.14)', fg: colors.success },
  error: { bg: 'rgba(248, 113, 113, 0.16)', fg: colors.error },
};

export function StateBadge({ state }: { state: TorrentState }) {
  const tone = toneFor[state] ?? toneFor.paused;
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <View style={[styles.dot, { backgroundColor: tone.fg }]} />
      <Text style={[styles.text, { color: tone.fg }]} numberOfLines={1}>
        {STATE_LABEL[state] ?? state}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    ...typography.micro,
    textTransform: 'uppercase',
  },
});

export default StateBadge;
