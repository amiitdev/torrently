import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Button from '../components/Button';
import Card from '../components/Card';
import ConfirmDialog from '../components/ConfirmDialog';
import Screen from '../components/Screen';
import SectionHeader from '../components/SectionHeader';
import { ToggleRow, ValueRow } from '../components/SettingRow';
import TorrentNative from '../native/TorrentNative';
import type { RootStackParamList } from '../navigation/types';
import { useTorrentStore } from '../store/torrentStore';
import type { AppSettings } from '../types';
import { colors, radius, spacing, typography } from '../theme';
import { formatBytes, formatSpeed } from '../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SPEED_PRESETS = [0, 512 * 1024, 1024 * 1024, 2 * 1024 * 1024, 5 * 1024 * 1024, 10 * 1024 * 1024, 25 * 1024 * 1024];

function speedLabel(value: number): string {
  return value === 0 ? 'Unlimited' : formatSpeed(value);
}

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const settings = useTorrentStore(s => s.settings);
  const saveSettings = useTorrentStore(s => s.saveSettings);
  const storage = useTorrentStore(s => s.storage);
  const loadStorage = useTorrentStore(s => s.loadStorage);
  const engineStatus = useTorrentStore(s => s.engineStatus);
  const refresh = useTorrentStore(s => s.refresh);

  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [licenses, setLicenses] = useState<string | null>(null);
  const [showLicenses, setShowLicenses] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    loadStorage().catch(() => undefined);
  }, [loadStorage]);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    setDraft(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next).catch(() => undefined);
      return next;
    });
    setMessage(null);
  }, [saveSettings]);

  const pickDirectory = async () => {
    setBusy(true);
    try {
      const picked = await TorrentNative.pickDownloadDirectory();
      if (picked) {
        await update({ downloadDirectory: picked.path, downloadDirectoryTreeUri: picked.uri });
        await loadStorage();
        setMessage('Download folder updated');
      }
    } catch (e: any) {
      setMessage(e?.message ?? 'Unable to change the folder');
    } finally {
      setBusy(false);
    }
  };

  const resetDirectory = async () => {
    const info = await TorrentNative.getStorageInfo();
    await update({ downloadDirectory: info.downloadDirectory, downloadDirectoryTreeUri: null });
    await loadStorage();
    setMessage('Download folder reset');
  };

  const persistLimits = async () => {
    setSaving(true);
    try {
      await saveSettings(draft);
      await TorrentNative.setDownloadLimit(draft.downloadLimitBps);
      await TorrentNative.setUploadLimit(draft.uploadLimitBps);
      setMessage('Settings saved');
      await loadStorage();
    } catch (e: any) {
      setMessage(e?.message ?? 'Unable to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleLicenses = async () => {
    if (showLicenses) {
      setShowLicenses(false);
      return;
    }
    if (licenses === null) {
      try {
        const text = await TorrentNative.getOpenSourceLicenses();
        setLicenses(text);
      } catch {
        setLicenses('License text is unavailable.');
      }
    }
    setShowLicenses(true);
  };

  const clearHistory = async () => {
    setBusy(true);
    try {
      const removed = await TorrentNative.clearCompletedHistory(false);
      setMessage(`Cleared ${removed} history entr${removed === 1 ? 'y' : 'ies'}`);
      await refresh();
    } catch (e: any) {
      setMessage(e?.message ?? 'Unable to clear history');
    } finally {
      setBusy(false);
      setConfirmClear(false);
    }
  };

  const usedPercent = useMemo(() => {
    if (!storage || storage.totalBytes <= 0) return 0;
    return Math.round(((storage.totalBytes - storage.freeBytes) / storage.totalBytes) * 100);
  }, [storage]);

  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionHeader title="Storage" />
        <Card style={styles.card}>
          <ValueRow
            icon="folder"
            title="Download directory"
            description={draft.downloadDirectoryTreeUri ? 'Custom folder (SAF)' : 'App-managed folder'}
            value={draft.downloadDirectory.split('/').slice(-2).join('/') || '—'}
          />
          <View style={styles.rowButtons}>
            <Button label={busy ? 'Opening…' : 'Change'} variant="ghost" size="sm" onPress={pickDirectory} disabled={busy} />
            <Button label="Use default" variant="ghost" size="sm" onPress={resetDirectory} />
          </View>
          {storage ? (
            <View style={styles.storageBlock}>
              <View style={styles.storageLine}>
                <Text style={styles.storageLabel}>Free space</Text>
                <Text style={styles.storageValue}>
                  {formatBytes(storage.freeBytes)} / {formatBytes(storage.totalBytes)}
                </Text>
              </View>
              <View style={styles.storageTrack}>
                <View style={[styles.storageFill, { width: `${usedPercent}%` }]} />
              </View>
              <Text style={styles.storageHint}>
                {storage.downloadDirectoryWritable ? 'Writable' : 'Not writable'} ·{' '}
                {formatBytes(storage.totalBytes - storage.freeBytes)} used
              </Text>
            </View>
          ) : null}
        </Card>

        <SectionHeader title="Queue" />
        <Card style={styles.card}>
          <View style={styles.sliderHead}>
            <Text style={styles.sliderLabel}>Max simultaneous active torrents</Text>
            <Text style={styles.sliderValue}>{draft.maxActiveTorrents}</Text>
          </View>
          <Slider
            minimumValue={1}
            maximumValue={10}
            step={1}
            value={draft.maxActiveTorrents}
            onValueChange={v => setDraft(prev => ({ ...prev, maxActiveTorrents: Math.round(v) }))}
            onSlidingComplete={v => update({ maxActiveTorrents: Math.round(v) })}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.secondary}
            thumbTintColor={colors.primary}
          />
          <ToggleRow
            icon="package-check"
            title="Seed after completion"
            description="Keep uploading once a torrent finishes"
            value={draft.seedAfterCompletion}
            onValueChange={v => update({ seedAfterCompletion: v })}
          />
          <ToggleRow
            icon="list-ordered"
            title="Sequential download"
            description="Fetch pieces in file order for streaming"
            value={draft.sequentialDownload}
            onValueChange={v => update({ sequentialDownload: v })}
          />
        </Card>

        <SectionHeader title="Speed limits" subtitle="0 = unlimited" />
        <Card style={styles.card}>
          <Text style={styles.sliderLabel}>Download limit</Text>
          <View style={styles.chips}>
            {SPEED_PRESETS.map(value => (
              <Pressable
                key={`dl-${value}`}
                onPress={() => update({ downloadLimitBps: value })}
                style={[styles.chip, draft.downloadLimitBps === value && styles.chipActive]}>
                <Text
                  style={[
                    styles.chipText,
                    draft.downloadLimitBps === value && styles.chipTextActive,
                  ]}>
                  {speedLabel(value)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.sliderLabel, styles.spaced]}>Upload limit</Text>
          <View style={styles.chips}>
            {SPEED_PRESETS.map(value => (
              <Pressable
                key={`ul-${value}`}
                onPress={() => update({ uploadLimitBps: value })}
                style={[styles.chip, draft.uploadLimitBps === value && styles.chipActive]}>
                <Text
                  style={[
                    styles.chipText,
                    draft.uploadLimitBps === value && styles.chipTextActive,
                  ]}>
                  {speedLabel(value)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <SectionHeader title="Connections" />
        <Card style={styles.card}>
          <View style={styles.sliderHead}>
            <Text style={styles.sliderLabel}>Max connections (session)</Text>
            <Text style={styles.sliderValue}>{draft.maxConnections}</Text>
          </View>
          <Slider
            minimumValue={50}
            maximumValue={1000}
            step={10}
            value={draft.maxConnections}
            onValueChange={v => setDraft(prev => ({ ...prev, maxConnections: Math.round(v) }))}
            onSlidingComplete={v => update({ maxConnections: Math.round(v) })}
            minimumTrackTintColor={colors.secondaryAccent}
            maximumTrackTintColor={colors.secondary}
            thumbTintColor={colors.secondaryAccent}
          />
          <View style={styles.sliderHead}>
            <Text style={styles.sliderLabel}>Peers per torrent</Text>
            <Text style={styles.sliderValue}>{draft.maxPeersPerTorrent}</Text>
          </View>
          <Slider
            minimumValue={5}
            maximumValue={200}
            step={5}
            value={draft.maxPeersPerTorrent}
            onValueChange={v => setDraft(prev => ({ ...prev, maxPeersPerTorrent: Math.round(v) }))}
            onSlidingComplete={v => update({ maxPeersPerTorrent: Math.round(v) })}
            minimumTrackTintColor={colors.secondaryAccent}
            maximumTrackTintColor={colors.secondary}
            thumbTintColor={colors.secondaryAccent}
          />
        </Card>

        <SectionHeader title="Restrictions" />
        <Card style={styles.card}>
          <ToggleRow
            icon="wifi"
            title="Wi-Fi only"
            description="Pause transfers on metered networks"
            value={draft.wifiOnly}
            onValueChange={v => update({ wifiOnly: v })}
          />
          <ToggleRow
            icon="battery-charging"
            title="Charging only"
            description="Pause transfers unless the device is charging"
            value={draft.chargingOnly}
            onValueChange={v => update({ chargingOnly: v })}
          />
        </Card>

        <SectionHeader title="Notifications" />
        <Card style={styles.card}>
          <ToggleRow
            icon="bell"
            title="Persistent notification"
            description="Show ongoing transfer status"
            value={draft.notificationsEnabled}
            onValueChange={v => update({ notificationsEnabled: v })}
          />
          <ToggleRow
            icon="activity"
            title="Show progress"
            description="Include an overall progress bar"
            value={draft.notificationProgress}
            onValueChange={v => update({ notificationProgress: v })}
          />
        </Card>

        <SectionHeader title="Session" />
        <Card style={styles.card}>
          <ToggleRow
            icon="rotate-ccw"
            title="Resume on start"
            description="Restore transfers when the app launches"
            value={draft.autoResumeOnStart}
            onValueChange={v => update({ autoResumeOnStart: v })}
          />
          <ValueRow
            icon="info"
            title="Engine"
            value={
              engineStatus?.running
                ? `running · DHT ${engineStatus.dhtNodes} nodes`
                : 'idle'
            }
          />
          <ValueRow
            icon="arrow-down"
            title="Session totals"
            value={`${formatBytes(engineStatus?.totalDownload)} down · ${formatBytes(
              engineStatus?.totalUpload,
            )} up`}
          />
        </Card>

        <SectionHeader title="Data" />
        <Card style={styles.card}>
          <ValueRow
            icon="trash"
            title="Clear completion history"
            description="Never deletes downloaded files"
            value="Run"
            danger
            onPress={() => setConfirmClear(true)}
          />
        </Card>

        <SectionHeader title="About" />
        <Card style={styles.card}>
          <ValueRow icon="info" title="Version" value="1.0.0" />
          <ValueRow
            icon="book-open"
            title="Open-source licenses"
            value={showLicenses ? 'Hide' : 'View'}
            onPress={toggleLicenses}
          />
          <Text style={styles.about}>
            Torrently uses libtorrent (via libtorrent4j) for the BitTorrent protocol. It does not
            include or fetch any content itself — you provide magnet links or .torrent files.
          </Text>
          {showLicenses && licenses ? <Text style={styles.licenses}>{licenses}</Text> : null}
        </Card>

        <View style={styles.saveBar}>
          <Button
            label={saving ? 'Saving…' : 'Save limits & connections'}
            onPress={persistLimits}
            loading={saving}
            fullWidth
          />
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Engine module: TorrentModule · Native events: onTorrentProgress, onTorrentStateChanged
          </Text>
          <Button
            label="Open source screen"
            variant="ghost"
            size="sm"
            onPress={() => navigation.navigate('AddTorrent')}
          />
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmClear}
        title="Clear history?"
        message="Completed torrent entries are removed from the list. Downloaded files are kept on disk."
        confirmLabel="Clear history"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={clearHistory}
      />
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  card: {
    padding: spacing.sm,
    gap: 2,
    marginBottom: spacing.sm,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  storageBlock: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: 6,
  },
  storageLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  storageLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  storageValue: {
    ...typography.caption,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  storageTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
    overflow: 'hidden',
  },
  storageFill: {
    height: '100%',
    backgroundColor: colors.success,
  },
  storageHint: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  sliderHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  sliderLabel: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  spaced: {
    marginTop: spacing.lg,
  },
  sliderValue: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  about: {
    ...typography.caption,
    color: colors.textSecondary,
    padding: spacing.md,
    lineHeight: 19,
  },
  licenses: {
    ...typography.micro,
    color: colors.textSecondary,
    padding: spacing.md,
    lineHeight: 16,
  },
  saveBar: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  message: {
    ...typography.caption,
    color: colors.success,
    textAlign: 'center',
  },
  footer: {
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerText: {
    ...typography.micro,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  busy: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
  },
});
