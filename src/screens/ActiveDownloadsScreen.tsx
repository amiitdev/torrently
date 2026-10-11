import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Lucide from '@react-native-vector-icons/lucide';

import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import Screen from '../components/Screen';
import SectionHeader from '../components/SectionHeader';
import TorrentCard from '../components/TorrentCard';
import { useTorrentActions } from '../hooks/useTorrentActions';
import type { RootStackParamList } from '../navigation/types';
import { useTorrentStore } from '../store/torrentStore';
import { useUiPrefs, type ActiveFilter } from '../store/uiPrefsStore';
import { colors, radius, spacing, typography } from '../theme';
import { filterTorrents, sortTorrents, type SortKey } from '../utils/torrentStatus';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'name', label: 'Name' },
  { key: 'progress', label: 'Progress' },
  { key: 'size', label: 'Size' },
  { key: 'speed', label: 'Speed' },
];

const FILTERS: { key: ActiveFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'queued', label: 'Queued' },
  { key: 'paused', label: 'Paused' },
  { key: 'error', label: 'Error' },
];

export default function ActiveDownloadsScreen() {
  const navigation = useNavigation<Nav>();
  const torrents = useTorrentStore(s => s.torrents);
  const order = useTorrentStore(s => s.order);
  const sort = useUiPrefs(s => s.activeSort);
  const setSort = useUiPrefs(s => s.setSort);
  const filter = useUiPrefs(s => s.activeFilter);
  const setFilter = useUiPrefs(s => s.setFilter);
  const actions = useTorrentActions();

  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const all = useMemo(() => order.map(id => torrents[id]).filter(Boolean), [order, torrents]);
  const visible = useMemo(
    () => sortTorrents(filterTorrents(all, filter), sort),
    [all, filter, sort],
  );

  const target = pendingRemove ? torrents[pendingRemove] : null;

  const toggleSort = (key: SortKey) => {
    if (sort.key === key) {
      setSort({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ key, direction: 'asc' });
    }
  };

  return (
    <Screen padded>
      <SectionHeader
        title="Active downloads"
        subtitle={`${visible.length} torrent${visible.length === 1 ? '' : 's'}`}
      />

      <View style={styles.chipRow}>
        {FILTERS.map(f => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort</Text>
        {SORTS.map(s => (
          <Pressable key={s.key} onPress={() => toggleSort(s.key)} hitSlop={6}>
            <Text style={[styles.sortItem, sort.key === s.key && styles.sortItemActive]}>
              {s.label}
              {sort.key === s.key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="download"
            title={filter === 'all' ? 'Nothing here yet' : `No ${filter} torrents`}
            message={
              filter === 'all'
                ? 'Torrents you add will show up here with live progress.'
                : 'Try a different filter.'
            }
          />
        }
        renderItem={({ item }) => (
          <TorrentCard
            torrent={item}
            onPress={() => navigation.navigate('TorrentDetails', { torrentId: item.id })}
            onPause={() => actions.pause(item.id)}
            onResume={() => actions.resume(item.id)}
            onRetry={() => actions.retry(item.id)}
            onRemove={() => setPendingRemove(item.id)}
          />
        )}
        ListFooterComponent={
          visible.length > 0 ? (
            <View style={styles.footerRow}>
              <Pressable onPress={actions.pauseAll} style={styles.footerBtn}>
                <Lucide name="pause" size={16} color={colors.textSecondary} />
                <Text style={styles.footerText}>Pause all</Text>
              </Pressable>
              <Pressable onPress={actions.startAll} style={styles.footerBtn}>
                <Lucide name="play" size={16} color={colors.success} />
                <Text style={[styles.footerText, { color: colors.success }]}>Start all</Text>
              </Pressable>
            </View>
          ) : undefined
        }
      />

      <ConfirmDialog
        visible={!!pendingRemove}
        title="Remove torrent?"
        message={`"${target?.name ?? ''}" will be removed from the list. Downloaded files are kept on disk.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (pendingRemove) {
            actions.remove(pendingRemove, false);
          }
          setPendingRemove(null);
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sortLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  sortItem: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sortItemActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  list: {
    paddingBottom: spacing.xxl,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.elevated,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  footerText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
