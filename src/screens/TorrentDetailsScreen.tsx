import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Lucide from '@react-native-vector-icons/lucide';

import Button from '../components/Button';
import Card from '../components/Card';
import ConfirmDialog from '../components/ConfirmDialog';
import ProgressBar from '../components/ProgressBar';
import Screen from '../components/Screen';
import SectionHeader from '../components/SectionHeader';
import StateBadge from '../components/StateBadge';
import TorrentNative from '../native/TorrentNative';
import type { RootStackParamList } from '../navigation/types';
import { useTorrentStore } from '../store/torrentStore';
import type { TorrentDetails, TorrentFile } from '../types';
import { colors, radius, spacing, typography } from '../theme';
import { formatBytes, formatDuration, formatEta, formatPercent, formatSpeed } from '../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList, 'TorrentDetails'>;
type Route = RouteProp<RootStackParamList, 'TorrentDetails'>;

const PRIORITY_LABEL: Record<number, string> = {
  0: 'Skip',
  1: 'Low',
  4: 'Normal',
  7: 'High',
};

export default function TorrentDetailsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { torrentId } = route.params;

  const summary = useTorrentStore(s => s.torrents[torrentId]);
  const [details, setDetails] = useState<TorrentDetails | null>(null);
  const [files, setFiles] = useState<TorrentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'remove' | 'delete' | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await TorrentNative.getTorrentDetails(torrentId);
      setDetails(next);
      setFiles(next.files);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Unable to load torrent details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [torrentId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Operation failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleFile = async (file: TorrentFile) => {
    const next = !file.selected;
    setFiles(prev =>
      prev.map(f =>
        f.index === file.index
          ? { ...f, selected: next, priority: (next ? 4 : 0) as TorrentFile['priority'] }
          : f,
      ),
    );
    try {
      await TorrentNative.setFileSelection(torrentId, file.index, next);
    } catch (e: any) {
      setError(e?.message ?? 'Unable to change file selection');
      setFiles(prev => prev.map(f => (f.index === file.index ? file : f)));
    }
  };

  const cyclePriority = async (file: TorrentFile) => {
    const order = [4, 1, 7, 0];
    const next = order[(order.indexOf(file.priority) + 1) % order.length] as TorrentFile['priority'];
    setFiles(prev =>
      prev.map(f =>
        f.index === file.index ? { ...f, priority: next, selected: next !== 0 } : f,
      ),
    );
    try {
      await TorrentNative.setTorrentPriority(torrentId, file.index, next);
    } catch (e: any) {
      setError(e?.message ?? 'Unable to change priority');
    }
  };

  const state = summary?.state ?? details?.state ?? 'paused';
  const canPause = state !== 'paused' && state !== 'completed' && state !== 'seeding' && state !== 'error';

  if (loading && !details) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading details…</Text>
        </View>
      </Screen>
    );
  }

  const trackers = details?.trackers ?? [];

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }>
        <Card>
          <View style={styles.headerRow}>
            <Text style={styles.name} numberOfLines={3}>
              {details?.name ?? summary?.name ?? 'Unknown torrent'}
            </Text>
            <StateBadge state={state} />
          </View>

          <View style={styles.progressRow}>
            <ProgressBar
              progress={details?.progress ?? summary?.progress ?? 0}
              height={8}
              color={
                state === 'error'
                  ? colors.error
                  : state === 'completed' || state === 'seeding'
                    ? colors.success
                    : colors.primary
              }
            />
            <Text style={styles.percent}>{formatPercent(details?.progress ?? summary?.progress ?? 0)}</Text>
          </View>

          <View style={styles.grid}>
            <Metric label="Download" value={formatSpeed(details?.downloadSpeed ?? 0)} icon="arrow-down" />
            <Metric label="Upload" value={formatSpeed(details?.uploadSpeed ?? 0)} icon="arrow-up" />
            <Metric label="ETA" value={formatEta(details?.etaSeconds ?? null)} icon="clock" />
            <Metric label="Peers" value={`${details?.peers ?? 0}`} icon="users" />
            <Metric label="Seeds" value={`${details?.seeds ?? 0}`} icon="radio" />
            <Metric
              label="Session"
              value={formatDuration(details?.activeDurationSec ?? 0)}
              icon="activity"
            />
          </View>

          <View style={styles.statLine}>
            <Text style={styles.statText}>
              {formatBytes(details?.downloadedSize ?? 0)} / {formatBytes(details?.totalSize ?? 0)} ·
              uploaded {formatBytes(details?.uploadedSize ?? 0)}
            </Text>
          </View>

          <View style={styles.actions}>
            {canPause ? (
              <Button
                label="Pause"
                variant="ghost"
                disabled={busy}
                onPress={() => run(() => TorrentNative.pauseTorrent(torrentId))}
                style={styles.actionBtn}
              />
            ) : (
              <Button
                label={state === 'error' ? 'Retry' : 'Resume'}
                variant="success"
                disabled={busy}
                onPress={() => run(() => TorrentNative.resumeTorrent(torrentId))}
                style={styles.actionBtn}
              />
            )}
            <Button
              label="Remove"
              variant="danger"
              disabled={busy}
              onPress={() => setConfirm('remove')}
              style={styles.actionBtn}
            />
          </View>
        </Card>

        <SectionHeader title="Transfer" />
        <Card style={styles.card}>
          <Row label="Downloaded" value={formatBytes(details?.downloadedSize ?? 0)} />
          <Row label="Uploaded" value={formatBytes(details?.uploadedSize ?? 0)} />
          <Row label="All-time down" value={formatBytes(details?.allTimeDownload ?? 0)} />
          <Row label="All-time up" value={formatBytes(details?.allTimeUpload ?? 0)} />
          <Row label="Distributed copies" value={(details?.distributedCopies ?? 0).toFixed(2)} />
          <Row label="Connected seeds / peers" value={`${details?.totalSeedsListed ?? 0} / ${details?.totalPeersListed ?? 0}`} />
          <Row label="Pieces" value={`${details?.pieceCount ?? 0} × ${formatBytes(details?.pieceLength ?? 0)}`} />
          <Row label="Current tracker" value={details?.currentTracker ?? '—'} />
        </Card>

        <SectionHeader title="Storage" />
        <Card style={styles.card}>
          <Row label="Location" value={details?.savePath ?? summary?.savePath ?? '—'} />
          <Row label="Files" value={`${files.length}`} />
          <View style={styles.inlineActions}>
            <Button
              label="Delete files"
              variant="danger"
              size="sm"
              onPress={() => setConfirm('delete')}
            />
          </View>
        </Card>

        <SectionHeader title={`Files (${files.length})`} />
        {files.length === 0 ? (
          <Card>
            <Text style={styles.muted}>File list is not available yet.</Text>
          </Card>
        ) : (
          files.map(file => (
            <Pressable
              key={file.index}
              onPress={() => toggleFile(file)}
              style={[styles.fileRow, !file.selected && styles.fileRowOff]}>
              <Lucide
                name={file.selected ? 'check-square' : 'square'}
                size={18}
                color={file.selected ? colors.primary : colors.textSecondary}
              />
              <View style={styles.flex}>
                <Text style={[styles.fileName, !file.selected && styles.muted]} numberOfLines={2}>
                  {file.name}
                </Text>
                <ProgressBar
                  progress={file.progress}
                  height={4}
                  color={colors.secondaryAccent}
                  style={styles.fileProgress}
                />
                <Text style={styles.fileMeta}>
                  {formatBytes(file.size)} · {formatPercent(file.progress)}
                </Text>
              </View>
              <Pressable
                onPress={() => cyclePriority(file)}
                style={styles.priorityPill}
                hitSlop={6}>
                <Text style={styles.priorityText}>
                  {PRIORITY_LABEL[file.priority] ?? 'Normal'}
                </Text>
              </Pressable>
            </Pressable>
          ))
        )}

        <SectionHeader title={`Trackers (${trackers.length})`} />
        {trackers.length === 0 ? (
          <Card>
            <Text style={styles.muted}>No tracker information available.</Text>
          </Card>
        ) : (
          <Card style={styles.card}>
            {trackers.map((tracker, index) => (
              <View key={`${tracker.url}-${index}`} style={styles.trackerRow}>
                <Text style={styles.trackerUrl} numberOfLines={2}>
                  {tracker.url}
                </Text>
                <Text
                  style={[
                    styles.trackerStatus,
                    {
                      color:
                        tracker.status === 'working'
                          ? colors.success
                          : tracker.status === 'failed'
                            ? colors.error
                            : colors.textSecondary,
                    },
                  ]}>
                  {tracker.status}
                  {tracker.error ? ` · ${tracker.error}` : ''}
                </Text>
              </View>
            ))}
          </Card>
        )}

        <SectionHeader title="Session" />
        <Card style={styles.card}>
          <Row label="Torrent ID" value={torrentId} />
          <Row label="Added" value={new Date(details?.addedTime ?? 0).toLocaleString()} />
          <Row label="Seeding time" value={formatDuration(details?.seedingDurationSec ?? 0)} />
          <Row label="State" value={state} />
          <Row label="Error" value={details?.error ?? 'none'} danger={!!details?.error} />
        </Card>

        {error ? (
          <View style={styles.errorBox}>
            <Lucide name="triangle-alert" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={confirm === 'remove'}
        title="Remove torrent?"
        message="The torrent is removed from the list. Downloaded files stay on disk."
        confirmLabel="Remove"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          run(() => TorrentNative.removeTorrent(torrentId, false)).then(() => navigation.goBack());
        }}
      />
      <ConfirmDialog
        visible={confirm === 'delete'}
        title="Delete downloaded files?"
        message="This permanently deletes the files stored for this torrent. This cannot be undone."
        confirmLabel="Delete files"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          run(() => TorrentNative.removeTorrent(torrentId, true)).then(() => navigation.goBack());
        }}
      />
    </Screen>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.metric}>
      <Lucide name={icon as any} size={14} color={colors.textSecondary} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, danger && { color: colors.error }]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  headerRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  name: {
    ...typography.title,
    color: colors.text,
    flexShrink: 1,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  percent: {
    ...typography.heading,
    color: colors.primary,
    width: 58,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  metric: {
    width: '31%',
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'flex-start',
    gap: 2,
  },
  metricValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  statLine: {
    marginTop: spacing.md,
  },
  statText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  actionBtn: {
    flex: 1,
  },
  card: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  rowValue: {
    ...typography.caption,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  inlineActions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  fileRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  fileRowOff: {
    opacity: 0.7,
  },
  fileName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  fileProgress: {
    marginTop: 6,
    marginBottom: 4,
  },
  fileMeta: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  priorityPill: {
    backgroundColor: colors.secondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  priorityText: {
    ...typography.micro,
    color: colors.text,
    textTransform: 'uppercase',
  },
  trackerRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  trackerUrl: {
    ...typography.caption,
    color: colors.text,
  },
  trackerStatus: {
    ...typography.micro,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  muted: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  errorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderColor: 'rgba(248, 113, 113, 0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
  },
});
