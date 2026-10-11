jest.mock('../src/native/TorrentNative', () => {
  const mockListeners = new Map<string, Set<(payload: unknown) => void>>();
  const mockStatus = {
    initialized: true,
    running: true,
    dhtEnabled: true,
    dhtNodes: 42,
    downloadSpeed: 1024,
    uploadSpeed: 512,
    totalDownload: 10,
    totalUpload: 5,
    listening: true,
    externalAddress: '203.0.113.7',
    activeCount: 1,
    pausedCount: 0,
    completedCount: 0,
    torrentCount: 1,
  };
  const mockNative = {
    initializeEngine: jest.fn(async () => mockStatus),
    getTorrentList: jest.fn(async () => []),
    getSettings: jest.fn(async () => ({ ...(require('../src/types').DEFAULT_SETTINGS) })),
    setSettings: jest.fn(async (settings: unknown) => settings),
    getStorageInfo: jest.fn(async () => ({
      totalBytes: 1000,
      freeBytes: 600,
      downloadDirectory: '/data',
      downloadDirectoryWritable: true,
    })),
    getEngineStatus: jest.fn(async () => mockStatus),
    pauseTorrent: jest.fn(async () => true),
    resumeTorrent: jest.fn(async () => true),
    removeTorrent: jest.fn(async () => true),
    startAll: jest.fn(async () => 1),
    pauseAll: jest.fn(async () => 1),
    shutdownEngine: jest.fn(async () => true),
    setDownloadLimit: jest.fn(async () => true),
    setUploadLimit: jest.fn(async () => true),
  };
  return {
    __esModule: true,
    default: mockNative,
    __mockListeners: mockListeners,
    __mockStatus: mockStatus,
    addTorrentListener: (event: string, listener: (payload: unknown) => void) => {
      if (!mockListeners.has(event)) {
        mockListeners.set(event, new Set());
      }
      mockListeners.get(event)?.add(listener);
      return () => {
        mockListeners.get(event)?.delete(listener);
      };
    },
    NativeCallError: class NativeCallError extends Error {
      code: string;
      constructor(error: { code: string; message: string }) {
        super(error.message);
        this.code = error.code;
      }
    },
    isAndroid: true,
  };
});

import type { EngineStatus, TorrentSummary } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/types';
import { subscribeToNativeEvents, useTorrentStore } from '../src/store/torrentStore';

interface MockModule {
  default: Record<string, jest.Mock>;
  __mockListeners: Map<string, Set<(payload: unknown) => void>>;
  __mockStatus: EngineStatus;
}

const mockModule = jest.requireMock('../src/native/TorrentNative') as MockModule;
const mockNative = mockModule.default;
const mockListeners = mockModule.__mockListeners;
const mockStatus = mockModule.__mockStatus;

function emit(event: string, payload: unknown) {
  mockListeners.get(event)?.forEach((listener: (payload: unknown) => void) =>
    listener(payload),
  );
}

function summary(overrides: Partial<TorrentSummary> = {}): TorrentSummary {
  return {
    id: 'c9e15763f722f23e98a29decdfae341b98d53056',
    name: 'debian.iso',
    state: 'downloading',
    progress: 0.25,
    downloadSpeed: 1024,
    uploadSpeed: 64,
    totalSize: 1000,
    downloadedSize: 250,
    uploadedSize: 10,
    etaSeconds: 750,
    seeds: 4,
    peers: 12,
    savePath: '/downloads',
    savePathTreeUri: null,
    queuePosition: 1,
    addedAt: 111,
    completedAt: null,
    hasMetadata: true,
    finished: false,
    error: null,
    ...overrides,
  };
}

function reset() {
  mockListeners.clear();
  jest.clearAllMocks();
  useTorrentStore.setState({
    torrents: {},
    order: [],
    engineStatus: null,
    settings: { ...DEFAULT_SETTINGS },
    storage: null,
    loading: false,
    initialized: false,
    bootError: null,
    lastEventAt: 0,
  });
}

describe('engine bootstrap', () => {
  beforeEach(reset);

  it('initializes the native engine and adopts the authoritative torrent list', async () => {
    mockNative.getTorrentList.mockResolvedValueOnce([summary()]);

    await useTorrentStore.getState().bootstrap();

    expect(mockNative.initializeEngine).toHaveBeenCalledTimes(1);
    expect(useTorrentStore.getState().initialized).toBe(true);
    expect(useTorrentStore.getState().bootError).toBeNull();
    expect(useTorrentStore.getState().order).toHaveLength(1);
    expect(useTorrentStore.getState().torrents[summary().id].name).toBe('debian.iso');
    expect(useTorrentStore.getState().engineStatus?.dhtNodes).toBe(42);
    expect(useTorrentStore.getState().storage?.freeBytes).toBe(600);
  });

  it('surfaces initialization failures instead of silently hanging', async () => {
    mockNative.initializeEngine.mockRejectedValueOnce(
      Object.assign(new Error('native module missing'), { code: 'E_ENGINE_INIT' }),
    );

    await useTorrentStore.getState().bootstrap();

    const state = useTorrentStore.getState();
    expect(state.initialized).toBe(false);
    expect(state.bootError).toBe('native module missing');
  });

  it('does not start the engine twice concurrently', async () => {
    useTorrentStore.setState({ loading: true });
    await useTorrentStore.getState().bootstrap();
    expect(mockNative.initializeEngine).not.toHaveBeenCalled();
  });

  it('persists settings through the native module', async () => {
    const next = { ...DEFAULT_SETTINGS, maxActiveTorrents: 5 };
    await useTorrentStore.getState().saveSettings(next);
    expect(mockNative.setSettings).toHaveBeenCalledWith(next);
    expect(useTorrentStore.getState().settings.maxActiveTorrents).toBe(5);
  });
});

describe('native event handling', () => {
  let unsubscribe: () => void;

  beforeEach(() => {
    reset();
    unsubscribe = subscribeToNativeEvents();
  });

  afterEach(() => {
    unsubscribe();
  });

  it('adds torrents from onTorrentAdded', () => {
    const torrent = summary();
    emit('onTorrentAdded', { torrent });
    expect(useTorrentStore.getState().torrents[torrent.id]).toEqual(torrent);
    expect(useTorrentStore.getState().order).toEqual([torrent.id]);
  });

  it('applies metadata updates', () => {
    const before = summary({ state: 'metadata', name: 'hash-only', totalSize: 0 });
    emit('onTorrentAdded', { torrent: before });
    const after = summary({ name: 'debian.iso', totalSize: 4_000_000_000, progress: 0 });
    emit('onTorrentMetadataReceived', { torrent: after });
    expect(useTorrentStore.getState().torrents[after.id].name).toBe('debian.iso');
    expect(useTorrentStore.getState().torrents[after.id].totalSize).toBe(4_000_000_000);
  });

  it('batches progress updates and keeps queue order stable', () => {
    const a = summary({ id: 'a'.repeat(40), queuePosition: 2, name: 'second' });
    const b = summary({ id: 'b'.repeat(40), queuePosition: 1, name: 'first' });
    emit('onTorrentAdded', { torrent: a });
    emit('onTorrentAdded', { torrent: b });

    emit('onTorrentProgress', {
      torrents: [
        { ...a, progress: 0.5, downloadSpeed: 999 },
        b,
      ],
    });

    expect(useTorrentStore.getState().torrents[a.id].progress).toBe(0.5);
    expect(useTorrentStore.getState().torrents[a.id].downloadSpeed).toBe(999);
    expect(useTorrentStore.getState().order[0]).toBe(b.id);
    expect(useTorrentStore.getState().order[1]).toBe(a.id);
  });

  it('marks state changes and errors', () => {
    const torrent = summary();
    emit('onTorrentAdded', { torrent });
    emit('onTorrentStateChanged', { torrent: { ...torrent, state: 'paused' } });
    expect(useTorrentStore.getState().torrents[torrent.id].state).toBe('paused');

    emit('onTorrentError', { torrentId: torrent.id, error: 'tracker timeout' });
    expect(useTorrentStore.getState().torrents[torrent.id].error).toBe('tracker timeout');
    expect(useTorrentStore.getState().torrents[torrent.id].state).toBe('error');
  });

  it('removes torrents from the store', () => {
    const torrent = summary();
    emit('onTorrentAdded', { torrent });
    emit('onTorrentRemoved', { torrentId: torrent.id });
    expect(useTorrentStore.getState().torrents[torrent.id]).toBeUndefined();
    expect(useTorrentStore.getState().order).toEqual([]);
  });

  it('updates engine status', () => {
    emit('onEngineStatusChanged', { status: { ...mockStatus, dhtNodes: 123 } });
    expect(useTorrentStore.getState().engineStatus?.dhtNodes).toBe(123);
  });

  it('ignores malformed payloads without throwing', () => {
    expect(() => emit('onTorrentAdded', undefined)).not.toThrow();
    expect(() => emit('onTorrentProgress', { torrents: 'nope' })).not.toThrow();
    expect(() => emit('onEngineStatusChanged', {})).not.toThrow();
  });

  it('unsubscribes so no further events are delivered', () => {
    const torrent = summary();
    unsubscribe();
    emit('onTorrentAdded', { torrent });
    expect(useTorrentStore.getState().torrents[torrent.id]).toBeUndefined();
    unsubscribe = () => undefined;
  });

  it('keeps downloads authoritative in native storage on startup', async () => {
    const stored = summary({ state: 'queued', progress: 0.4 });
    mockNative.getTorrentList.mockResolvedValueOnce([stored]);
    await useTorrentStore.getState().bootstrap();
    expect(useTorrentStore.getState().torrents[stored.id].state).toBe('queued');
  });
});
