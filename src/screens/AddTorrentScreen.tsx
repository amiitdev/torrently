import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Lucide from '@react-native-vector-icons/lucide';

import Button from '../components/Button';
import Card from '../components/Card';
import ProgressBar from '../components/ProgressBar';
import Screen from '../components/Screen';
import SectionHeader from '../components/SectionHeader';
import TorrentNative from '../native/TorrentNative';
import type { RootStackParamList } from '../navigation/types';
import { useTorrentStore } from '../store/torrentStore';
import type { TorrentDetails, TorrentFile } from '../types';
import { colors, radius, spacing, typography } from '../theme';
import { formatBytes, formatPercent } from '../utils/format';
import { isValidMagnet, looksLikeMagnetCandidate } from '../utils/magnet';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddTorrent'>;
type Route = RouteProp<RootStackParamList, 'AddTorrent'>;

const PRIORITY_LABEL: Record<number, string> = {
  0: 'Skip',
  1: 'Low',
  4: 'Normal',
  7: 'High',
};

export default function AddTorrentScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const settings = useTorrentStore(s => s.settings);
  const loadSettings = useTorrentStore(s => s.loadSettings);

  const [source, setSource] = useState<'magnet' | 'file' | null>(null);
  const [magnet, setMagnet] = useState('');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [destination, setDestination] = useState(settings.downloadDirectory);
  const [destinationTreeUri, setDestinationTreeUri] = useState<string | null>(
    settings.downloadDirectoryTreeUri,
  );
  const [startPaused, setStartPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [torrentId, setTorrentId] = useState<string | null>(null);
  const [details, setDetails] = useState<TorrentDetails | null>(null);
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const [files, setFiles] = useState<TorrentFile[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const finish = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    navigation.goBack();
  }, [navigation]);

  // Incoming magnet / torrent intent
  useEffect(() => {
    const magnetParam = route.params?.magnet;
    const fileParam = route.params?.fileUri;
    if (magnetParam) {
      setSource('magnet');
      setMagnet(magnetParam);
    }
    if (fileParam) {
      setSource('file');
      setFileUri(fileParam);
    }
  }, [route.params?.magnet, route.params?.fileUri]);

  useEffect(() => {
    loadSettings().catch(() => undefined);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [loadSettings]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollDetails = (id: string) => {
    stopPolling();
    setFetchingMetadata(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const next = await TorrentNative.getTorrentDetails(id);
        setDetails(next);
        setFiles(next.files);
        if (next.files.length > 0) {
          setFetchingMetadata(false);
          stopPolling();
        }
      } catch (e: any) {
        if (attempts > 3) {
          setFetchingMetadata(false);
          stopPolling();
          setError(e?.message ?? 'Unable to read torrent metadata');
        }
      }
      if (attempts >= 60) {
        setFetchingMetadata(false);
        stopPolling();
      }
    }, 1000);
  };

  const importFile = async () => {
    try {
      const uri = await TorrentNative.pickTorrentFile();
      if (uri) {
        setSource('file');
        setFileUri(uri);
        setMagnet('');
        setError(null);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unable to open the file picker');
    }
  };

  const pickDestination = async () => {
    try {
      const picked = await TorrentNative.pickDownloadDirectory();
      if (picked) {
        setDestination(picked.path);
        setDestinationTreeUri(picked.uri);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unable to choose a folder');
    }
  };

  const addTorrent = async () => {
    setError(null);
    setBusy(true);
    try {
      const options = {
        savePath: destination,
        savePathTreeUri: destinationTreeUri,
        paused: startPaused,
      };

      let created;
      if (source === 'file') {
        if (!fileUri) {
          throw new Error('Select a .torrent file first');
        }
        created = await TorrentNative.addTorrentFile(fileUri, options);
      } else {
        const trimmed = magnet.trim();
        if (!looksLikeMagnetCandidate(trimmed)) {
          throw new Error('Paste a magnet link that starts with "magnet:"');
        }
        if (!isValidMagnet(trimmed)) {
          throw new Error('This magnet link has no valid torrent info-hash');
        }
        created = await TorrentNative.addMagnet(trimmed, options);
      }

      setTorrentId(created.id);
      const immediate = await TorrentNative.getTorrentDetails(created.id);
      setDetails(immediate);
      setFiles(immediate.files);
      if (immediate.files.length === 0) {
        pollDetails(created.id);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not add the torrent');
    } finally {
      setBusy(false);
    }
  };

  const cancelAdd = async () => {
    if (torrentId) {
      try {
        await TorrentNative.removeTorrent(torrentId, false);
      } catch {
        // best effort
      }
    }
    finish();
  };

  const toggleFile = async (file: TorrentFile) => {
    if (!torrentId) {
      return;
    }
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
    if (!torrentId) {
      return;
    }
    const order = [4, 1, 7, 0];
    const current = order.indexOf(file.priority);
    const next = order[(current + 1) % order.length] as TorrentFile['priority'];
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

  const selectAll = async (value: boolean) => {
    if (!torrentId) {
      return;
    }
    const next = files.map(f => ({
      ...f,
      selected: value,
      priority: (value ? 4 : 0) as TorrentFile['priority'],
    }));
    setFiles(next);
    try {
      await Promise.all(
        next.map(f => TorrentNative.setFileSelection(torrentId, f.index, f.selected)),
      );
    } catch (e: any) {
      setError(e?.message ?? 'Unable to update the file selection');
    }
  };

  const added = torrentId !== null;
  const totalSize = details?.totalSize ?? 0;
  const selectedSize = files.filter(f => f.selected).reduce((sum, f) => sum + f.size, 0);

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!added ? (
            <>
              <Text style={styles.label}>Magnet link</Text>
              <TextInput
                value={magnet}
                onChangeText={text => {
                  setMagnet(text);
                  setSource(text.trim() ? 'magnet' : null);
                  setError(null);
                }}
                placeholder="magnet:?xt=urn:btih:…"
                placeholderTextColor={colors.textSecondary}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                editable={source !== 'file'}
              />

              <View style={styles.row}>
                <Button
                  label={fileUri ? 'File selected' : 'Import .torrent'}
                  variant="ghost"
                  onPress={importFile}
                  icon={<Lucide name="file-up" size={17} color={colors.text} />}
                  style={styles.flex}
                />
                <Button
                  label="Add torrent"
                  onPress={addTorrent}
                  loading={busy}
                  disabled={source === null}
                  style={styles.flex}
                />
              </View>

              {fileUri ? (
                <Card style={styles.fileChip}>
                  <Lucide name="file-check" size={16} color={colors.success} />
                  <Text style={styles.fileChipText} numberOfLines={2}>
                    {fileUri.split('/').pop()}
                  </Text>
                </Card>
              ) : null}

              <SectionHeader title="Download location" />
              <Pressable onPress={pickDestination} style={styles.destination}>
                <Lucide name="folder" size={17} color={colors.textSecondary} />
                <Text style={styles.destinationText} numberOfLines={2}>
                  {destination}
                </Text>
                <Lucide name="chevron-right" size={17} color={colors.textSecondary} />
              </Pressable>

              <View style={styles.switchRow}>
                <View style={styles.flex}>
                  <Text style={styles.switchLabel}>Start paused</Text>
                  <Text style={styles.switchHint}>The torrent is added but waits in the queue</Text>
                </View>
                <Switch
                  value={startPaused}
                  onValueChange={setStartPaused}
                  trackColor={{ false: colors.secondary, true: colors.primary }}
                  thumbColor={colors.text}
                />
              </View>
            </>
          ) : (
            <>
              <SectionHeader
                title={details?.name ?? 'Fetching metadata…'}
                subtitle={
                  totalSize > 0
                    ? `${formatBytes(totalSize)} · ${files.length} file(s)`
                    : 'Waiting for torrent metadata'
                }
              />

              {fetchingMetadata ? (
                <Card style={styles.metadataCard}>
                  <ActivityIndicator color={colors.primary} />
                  <View style={styles.flex}>
                    <Text style={styles.metadataTitle}>Retrieving metadata</Text>
                    <Text style={styles.metadataHint}>
                      Contacting peers and trackers to read the file list. This can take a minute.
                    </Text>
                  </View>
                </Card>
              ) : null}

              {details ? (
                <Card style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Progress</Text>
                    <Text style={styles.summaryValue}>{formatPercent(details.progress)}</Text>
                  </View>
                  <ProgressBar progress={details.progress} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Selected</Text>
                    <Text style={styles.summaryValue}>
                      {formatBytes(selectedSize)} / {formatBytes(totalSize)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Destination</Text>
                    <Text style={styles.summaryValue} numberOfLines={2}>
                      {details.savePath}
                    </Text>
                  </View>
                </Card>
              ) : null}

              {files.length > 0 ? (
                <>
                  <View style={styles.fileActions}>
                    <Pressable onPress={() => selectAll(true)} hitSlop={8}>
                      <Text style={styles.link}>Select all</Text>
                    </Pressable>
                    <Pressable onPress={() => selectAll(false)} hitSlop={8}>
                      <Text style={styles.link}>Select none</Text>
                    </Pressable>
                  </View>
                  {files.map(file => (
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
                        <Text
                          style={[styles.fileName, !file.selected && styles.dim]}
                          numberOfLines={2}>
                          {file.name}
                        </Text>
                        <Text style={styles.fileSize}>{formatBytes(file.size)}</Text>
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
                  ))}
                </>
              ) : (
                !fetchingMetadata && (
                  <Card>
                    <Text style={styles.metadataHint}>
                      The engine could not read the file list yet. You can keep this torrent and
                      manage its files from the details screen.
                    </Text>
                  </Card>
                )
              )}

              <View style={styles.row}>
                <Button label="Remove" variant="danger" onPress={cancelAdd} style={styles.flex} />
                <Button label="Done" variant="primary" onPress={finish} style={styles.flex} />
              </View>
            </>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Lucide name="triangle-alert" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    minHeight: 96,
    textAlignVertical: 'top',
    ...typography.body,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  fileChipText: {
    ...typography.caption,
    color: colors.text,
    flexShrink: 1,
  },
  destination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 54,
  },
  destinationText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  switchLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  switchHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metadataCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metadataTitle: {
    ...typography.heading,
    color: colors.text,
  },
  metadataHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  summaryCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typography.caption,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  fileActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  link: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  dim: {
    color: colors.textSecondary,
  },
  fileSize: {
    ...typography.micro,
    color: colors.textSecondary,
    marginTop: 2,
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
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderColor: 'rgba(248, 113, 113, 0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
  },
});
