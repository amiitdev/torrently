import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Lucide from '@react-native-vector-icons/lucide';

import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import Screen from '../components/Screen';
import SectionHeader from '../components/SectionHeader';
import StatTile from '../components/StatTile';
import TorrentCard from '../components/TorrentCard';
import { useTorrentActions } from '../hooks/useTorrentActions';
import type { RootStackParamList } from '../navigation/types';
import { useTorrentStore } from '../store/torrentStore';
import { colors, radius, spacing, typography } from '../theme';
import { formatBytes, formatSpeed } from '../utils/format';
import { isActiveState, isTerminalState } from '../utils/torrentStatus';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  const torrents = useTorrentStore(s => s.torrents);
  const order = useTorrentStore(s => s.order);
  const engineStatus = useTorrentStore(s => s.engineStatus);
  const storage = useTorrentStore(s => s.storage);
  const refreshing = useTorrentStore(s => s.loading);
  const bootError = useTorrentStore(s => s.bootError);
  const refresh = useTorrentStore(s => s.refresh);
  const loadStorage = useTorrentStore(s => s.loadStorage);
  const actions = useTorrentActions();

  const list = useMemo(() => order.map(id => torrents[id]).filter(Boolean), [order, torrents]);

  const active = list.filter(t => isActiveState(t.state));
  const queued = list.filter(t => t.state === 'queued');
  const completed = list.filter(t => isTerminalState(t.state));

  const downloadSpeed = engineStatus?.downloadSpeed ?? active.reduce((a, t) => a + t.downloadSpeed, 0);
  const uploadSpeed = engineStatus?.uploadSpeed ?? active.reduce((a, t) => a + t.uploadSpeed, 0);

  const onRefresh = async () => {
    await refresh();
    await loadStorage();
  };

  if (bootError && !engineStatus?.initialized) {
    return (
      <Screen>
        <View style={styles.inner}>
          <EmptyState
            icon="triangle-alert"
            title="Engine failed to start"
            message={bootError}
            actionLabel="Retry"
            onAction={() => useTorrentStore.getState().bootstrap()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }>
        <View style={styles.header}>
          <View style={styles.logo}>
            <Lucide name="arrow-down-to-line" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.appName}>Torrently</Text>
            <Text style={styles.appStatus}>
              {engineStatus?.initialized ? (engineStatus.running ? 'Engine running' : 'Engine idle') : 'Starting engine…'}
              {engineStatus?.dhtEnabled ? ` · DHT ${engineStatus.dhtNodes} nodes` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.speedRow}>
          <StatTile
            icon="arrow-down"
            label="Download"
            value={formatSpeed(downloadSpeed)}
            sub={`Total ${formatBytes(engineStatus?.totalDownload)}`}
            tint={colors.primary}
          />
          <StatTile
            icon="arrow-up"
            label="Upload"
            value={formatSpeed(uploadSpeed)}
            sub={`Total ${formatBytes(engineStatus?.totalUpload)}`}
            tint={colors.secondaryAccent}
          />
        </View>

        <View style={styles.speedRow}>
          <StatTile
            icon="activity"
            label="Active"
            value={String(active.length)}
            sub={`${queued.length} queued`}
            tint={colors.success}
          />
          <StatTile
            icon="check-circle"
            label="Completed"
            value={String(completed.length)}
            sub={
              storage
                ? `${formatBytes(storage.freeBytes)} free`
                : 'Storage unknown'
            }
            tint={colors.warning}
          />
        </View>

        <Button
          label="Add torrent"
          variant="primary"
          size="lg"
          fullWidth
          icon={<Lucide name="plus" size={20} color="#FFFFFF" />}
          onPress={() => navigation.navigate('AddTorrent')}
          style={styles.addBtn}
        />

        <SectionHeader
          title="Active downloads"
          subtitle={active.length ? `${active.length} in progress` : undefined}
          actionLabel={list.length ? 'See all' : undefined}
          onAction={() => navigation.navigate('Tabs', { screen: 'Downloads' })}
        />

        {active.length === 0 ? (
          <Card style={styles.emptyCard}>
            <EmptyState
              icon="download"
              title="No active downloads"
              message="Add a magnet link or a .torrent file to start downloading."
              actionLabel="Add torrent"
              onAction={() => navigation.navigate('AddTorrent')}
            />
          </Card>
        ) : (
          active.map(t => (
            <TorrentCard
              key={t.id}
              torrent={t}
              onPress={() => navigation.navigate('TorrentDetails', { torrentId: t.id })}
              onPause={() => actions.pause(t.id)}
              onResume={() => actions.resume(t.id)}
              onRetry={() => actions.retry(t.id)}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  logo: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  appName: {
    ...typography.display,
    color: colors.text,
    fontSize: 26,
    lineHeight: 30,
  },
  appStatus: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  speedRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  addBtn: {
    marginTop: spacing.sm,
  },
  emptyCard: {
    paddingVertical: spacing.sm,
  },
});
