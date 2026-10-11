import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Lucide from '@react-native-vector-icons/lucide';
import ProgressBar from './ProgressBar';
import StateBadge from './StateBadge';
import type { TorrentSummary } from '../types';
import { colors, radius, spacing, typography } from '../theme';
import { formatBytes, formatEta, formatPercent, formatSpeed } from '../utils/format';

interface TorrentCardProps {
  torrent: TorrentSummary;
  onPress: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
}

function stateColor(state: TorrentSummary['state']): string {
  switch (state) {
    case 'error':
      return colors.error;
    case 'completed':
    case 'seeding':
      return colors.success;
    case 'paused':
    case 'queued':
      return colors.secondaryAccent;
    default:
      return colors.primary;
  }
}

export function TorrentCard({
  torrent,
  onPress,
  onPause,
  onResume,
  onRetry,
  onRemove,
}: TorrentCardProps) {
  const canPause = torrent.state !== 'paused' && torrent.state !== 'completed' && torrent.state !== 'seeding' && torrent.state !== 'error';
  const canResume = torrent.state === 'paused' || torrent.state === 'queued' || torrent.state === 'error';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open details for ${torrent.name}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={2}>
          {torrent.name}
        </Text>
        <StateBadge state={torrent.state} />
      </View>

      <View style={styles.progressRow}>
        <ProgressBar
          progress={torrent.progress}
          color={stateColor(torrent.state)}
          indeterminate={torrent.state === 'metadata'}
        />
        <Text style={[styles.percent, { color: stateColor(torrent.state) }]}>
          {torrent.state === 'metadata' ? '…' : formatPercent(torrent.progress)}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <Stat icon="arrow-down" value={formatSpeed(torrent.downloadSpeed)} />
        <Stat icon="arrow-up" value={formatSpeed(torrent.uploadSpeed)} />
        <Stat icon="clock" value={formatEta(torrent.etaSeconds)} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.size}>
          {formatBytes(torrent.downloadedSize)} <Text style={styles.dim}>/ {formatBytes(torrent.totalSize)}</Text>
        </Text>
        <Text style={styles.peers}>
          {torrent.seeds} seeds · {torrent.peers} peers
        </Text>
      </View>

      <View style={styles.actions}>
        {canPause ? (
          <IconButton icon="pause" label="Pause" onPress={onPause} tint={colors.textSecondary} />
        ) : null}
        {canResume ? (
          <IconButton
            icon={torrent.state === 'error' ? 'refresh-cw' : 'play'}
            label={torrent.state === 'error' ? 'Retry' : 'Resume'}
            onPress={torrent.state === 'error' && onRetry ? onRetry : onResume}
            tint={colors.success}
          />
        ) : null}
        <View style={styles.spacer} />
        {onRemove ? (
          <IconButton icon="trash-2" label="Remove" onPress={onRemove} tint={colors.error} />
        ) : null}
        <IconButton icon="chevron-right" label="Details" onPress={onPress} tint={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

function Stat({ icon, value }: { icon: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Lucide name={icon as any} size={13} color={colors.textSecondary} />
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tint = colors.text,
  size = 38,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  tint?: string;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, opacity: pressed ? 0.6 : 1 },
      ]}>
      <Lucide name={icon as any} size={17} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.elevated,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.9,
    borderColor: colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  name: {
    ...typography.heading,
    color: colors.text,
    flexShrink: 1,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  percent: {
    ...typography.caption,
    fontWeight: '700',
    width: 46,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    ...typography.caption,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  size: {
    ...typography.caption,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  dim: {
    color: colors.textSecondary,
  },
  peers: {
    ...typography.caption,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  spacer: {
    flex: 1,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.secondary,
  },
});

export default TorrentCard;
