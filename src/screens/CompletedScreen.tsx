import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Lucide from '@react-native-vector-icons/lucide';

import Card from '../components/Card';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import Screen from '../components/Screen';
import SectionHeader from '../components/SectionHeader';
import TorrentNative from '../native/TorrentNative';
import type { RootStackParamList } from '../navigation/types';
import { useTorrentStore } from '../store/torrentStore';
import { colors, radius, spacing, typography } from '../theme';
import { formatBytes, formatPercent } from '../utils/format';
import { isTerminalState } from '../utils/torrentStatus';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface HistoryEntry {
  id: string;
  name: string;
  totalSize: number;
  savePath: string;
  completedAt: number;
  fileCount: number;
  inEngine: boolean;
}

export default function CompletedScreen() {
  const navigation = useNavigation<Nav>();
  const torrents = useTorrentStore(s => s.torrents);
  const order = useTorrentStore(s => s.order);
  const refresh = useTorrentStore(s => s.refresh);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; mode: 'history' | 'files' } | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await TorrentNative.getCompletedHistory();
      setHistory(rows as unknown as HistoryEntry[]);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Unable to read the completion history');
    }
  }, []);

  useEffect(() => {
    load();
    refresh();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load, refresh]);

  const engineCompleted = useMemo(
    () =>
      order
        .map(id => torrents[id])
        .filter((t): t is NonNullable<typeof t> => Boolean(t) && isTerminalState(t.state)),
    [order, torrents],
  );

  const engineIds = new Set(engineCompleted.map(t => t.id));
  const historyOnly = history.filter(h => !engineIds.has(h.id));

  const openFile = async (id: string) => {
    try {
      const uri = await TorrentNative.getFileUri(id, 0);
      if (!uri) {
        setError('The first file is not available yet');
        return;
      }
      await TorrentNative.openExternal(uri);
    } catch (e: any) {
      setError(e?.message ?? 'Unable to open the file');
    }
  };

  const shareFile = async (id: string) => {
    try {
      const uri = await TorrentNative.getFileUri(id, 0);
      if (!uri) {
        setError('The first file is not available yet');
        return;
      }
      await Share.share({ message: uri, url: uri });
    } catch (e: any) {
      setError(e?.message ?? 'Unable to share the file');
    }
  };

  const browseLocation = async (id: string) => {
    try {
      const uri = await TorrentNative.getDirectoryUri(id);
      if (!uri) {
        setError('Location is not reachable from the document provider');
        return;
      }
      await TorrentNative.openExternal(uri);
    } catch (e: any) {
      setError(e?.message ?? 'Unable to open the folder');
    }
  };

  const removeEntry = async (id: string) => {
    try {
      await TorrentNative.removeTorrent(id, false);
      await load();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Unable to remove the entry');
    }
  };

  const deleteFiles = async (id: string) => {
    try {
      await TorrentNative.removeTorrent(id, true);
      await load();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Unable to delete the files');
    }
  };

  const renderEngineItem = (item: (typeof engineCompleted)[number]) => (
    <Card style={styles.card} key={item.id}>
      <Pressable
        onPress={() => navigation.navigate('TorrentDetails', { torrentId: item.id })}
        style={styles.cardHeader}>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.meta}>
            {formatBytes(item.totalSize)} · {formatPercent(item.progress)} ·{' '}
            {item.state === 'seeding' ? 'seeding' : 'complete'}
          </Text>
        </View>
        <Lucide name="chevron-right" size={18} color={colors.textSecondary} />
      </Pressable>
      <View style={styles.actions}>
        <Action icon="file-text" label="Open" onPress={() => openFile(item.id)} />
        <Action icon="share-2" label="Share" onPress={() => shareFile(item.id)} />
        <Action icon="folder-open" label="Location" onPress={() => browseLocation(item.id)} />
        <Action
          icon="history"
          label="Unlist"
          tint={colors.warning}
          onPress={() => setConfirm({ id: item.id, mode: 'history' })}
        />
        <Action
          icon="trash-2"
          label="Delete"
          tint={colors.error}
          onPress={() => setConfirm({ id: item.id, mode: 'files' })}
        />
      </View>
    </Card>
  );

  const renderHistoryItem = (entry: HistoryEntry) => (
    <Card style={styles.card} key={`h-${entry.id}`}>
      <View style={styles.cardHeader}>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2}>
            {entry.name}
          </Text>
          <Text style={styles.meta}>
            {formatBytes(entry.totalSize)} · {entry.fileCount} file(s) ·{' '}
            {new Date(entry.completedAt).toLocaleDateString()}
          </Text>
          <Text style={styles.path} numberOfLines={1}>
            {entry.savePath}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Action
          icon="history"
          label="Remove"
          tint={colors.warning}
          onPress={() => setConfirm({ id: entry.id, mode: 'history' })}
        />
        <Action
          icon="trash-2"
          label="Delete files"
          tint={colors.error}
          onPress={() => setConfirm({ id: entry.id, mode: 'files' })}
        />
      </View>
    </Card>
  );

  return (
    <Screen padded>
      <SectionHeader
        title="Completed"
        subtitle={`${engineCompleted.length + historyOnly.length} item(s)`}
      />

      {error ? (
        <View style={styles.errorBox}>
          <Lucide name="triangle-alert" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={engineCompleted}
        keyExtractor={item => item.id}
        renderItem={({ item }) => renderEngineItem(item)}
        ListHeaderComponent={
          historyOnly.length > 0 ? (
            <View>
              <Text style={styles.groupLabel}>History (files kept on disk)</Text>
              {historyOnly.map(renderHistoryItem)}
              <Text style={styles.groupLabel}>Active list</Text>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          historyOnly.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title="Nothing completed yet"
              message="Finished torrents and your completion history will appear here."
            />
          ) : (
            <Text style={styles.groupLabel}>History</Text>
          ) as React.ReactElement | undefined
        }
        contentContainerStyle={styles.list}
      />

      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.mode === 'files' ? 'Delete downloaded files?' : 'Remove from list?'}
        message={
          confirm?.mode === 'files'
            ? 'The files stored on disk for this entry will be permanently deleted.'
            : 'The entry is removed from the list. Downloaded files are kept on disk.'
        }
        confirmLabel={confirm?.mode === 'files' ? 'Delete files' : 'Remove'}
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const target = confirm;
          setConfirm(null);
          if (!target) return;
          if (target.mode === 'files') {
            deleteFiles(target.id);
          } else {
            removeEntry(target.id);
          }
        }}
      />
    </Screen>
  );
}

function Action({
  icon,
  label,
  onPress,
  tint = colors.textSecondary,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  tint?: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.action} hitSlop={4}>
      <Lucide name={icon as any} size={16} color={tint} />
      <Text style={[styles.actionLabel, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    paddingBottom: spacing.xxl,
  },
  card: {
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    ...typography.heading,
    color: colors.text,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  path: {
    ...typography.micro,
    color: colors.textSecondary,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  actionLabel: {
    ...typography.micro,
    textTransform: 'uppercase',
  },
  groupLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  errorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderColor: 'rgba(248, 113, 113, 0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
  },
});
