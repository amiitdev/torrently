import { create } from 'zustand';
import TorrentNative, { addTorrentListener } from '../native/TorrentNative';
import type {
  AppSettings,
  EngineInitOptions,
  EngineStatus,
  StorageInfo,
  TorrentSummary,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';

export interface SortOption {
  key: 'name' | 'progress' | 'size' | 'speed' | 'status';
  direction: 'asc' | 'desc';
}

interface TorrentStore {
  torrents: Record<string, TorrentSummary>;
  order: string[];
  engineStatus: EngineStatus | null;
  settings: AppSettings;
  storage: StorageInfo | null;
  loading: boolean;
  initialized: boolean;
  bootError: string | null;
  lastEventAt: number;

  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshEngineStatus: () => Promise<void>;
  loadSettings: () => Promise<AppSettings>;
  saveSettings: (next: AppSettings) => Promise<AppSettings>;
  loadStorage: () => Promise<void>;
  applySummaries: (list: TorrentSummary[]) => void;
  addOne: (summary: TorrentSummary) => void;
  removeOne: (id: string) => void;
  setError: (message: string | null) => void;
  shutdown: () => Promise<void>;
}

const emptyStatus: EngineStatus = {
  initialized: false,
  running: false,
  dhtEnabled: false,
  dhtNodes: 0,
  downloadSpeed: 0,
  uploadSpeed: 0,
  totalDownload: 0,
  totalUpload: 0,
  listening: false,
  externalAddress: null,
  activeCount: 0,
  pausedCount: 0,
  completedCount: 0,
  torrentCount: 0,
};

function sortIds(map: Record<string, TorrentSummary>): string[] {
  return Object.values(map)
    .sort((a, b) => {
      if (a.queuePosition !== b.queuePosition) {
        return a.queuePosition - b.queuePosition;
      }
      return a.addedAt - b.addedAt;
    })
    .map(t => t.id);
}

export const useTorrentStore = create<TorrentStore>((set, get) => ({
  torrents: {},
  order: [],
  engineStatus: null,
  settings: DEFAULT_SETTINGS,
  storage: null,
  loading: false,
  initialized: false,
  bootError: null,
  lastEventAt: 0,

  bootstrap: async () => {
    if (get().loading) {
      return;
    }
    set({ loading: true, bootError: null });
    try {
      const settings = await TorrentNative.getSettings();
      const initOptions: EngineInitOptions = {
        downloadRateLimit: settings.downloadLimitBps,
        uploadRateLimit: settings.uploadLimitBps,
        maxActiveTorrents: settings.maxActiveTorrents,
        maxConnections: settings.maxConnections,
        maxPeers: settings.maxPeersPerTorrent,
      };
      const status = await TorrentNative.initializeEngine(initOptions);
      const list = await TorrentNative.getTorrentList();
      const torrents: Record<string, TorrentSummary> = {};
      for (const t of list) {
        torrents[t.id] = t;
      }
      let storage: StorageInfo | null = null;
      try {
        storage = await TorrentNative.getStorageInfo();
      } catch {
        storage = null;
      }
      set({
        settings,
        engineStatus: status,
        torrents,
        order: sortIds(torrents),
        storage,
        initialized: true,
        loading: false,
        bootError: null,
      });
    } catch (e: any) {
      set({
        loading: false,
        initialized: false,
        bootError: e?.message ?? 'Failed to start the torrent engine',
      });
    }
  },

  refresh: async () => {
    try {
      const list = await TorrentNative.getTorrentList();
      get().applySummaries(list);
    } catch {
      // keep last known state; native events are authoritative
    }
  },

  refreshEngineStatus: async () => {
    try {
      const status = await TorrentNative.getEngineStatus();
      set({ engineStatus: status });
    } catch {
      // ignore
    }
  },

  loadSettings: async () => {
    const settings = await TorrentNative.getSettings();
    set({ settings });
    return settings;
  },

  saveSettings: async (next: AppSettings) => {
    const settings = await TorrentNative.setSettings(next);
    set({ settings });
    return settings;
  },

  loadStorage: async () => {
    try {
      const storage = await TorrentNative.getStorageInfo();
      set({ storage });
    } catch {
      // ignore
    }
  },

  applySummaries: list => {
    const torrents: Record<string, TorrentSummary> = {};
    for (const t of list) {
      torrents[t.id] = t;
    }
    set({ torrents, order: sortIds(torrents), lastEventAt: Date.now() });
  },

  addOne: summary => {
    const torrents = { ...get().torrents, [summary.id]: summary };
    set({ torrents, order: sortIds(torrents), lastEventAt: Date.now() });
  },

  removeOne: id => {
    const torrents = { ...get().torrents };
    if (!(id in torrents)) {
      return;
    }
    delete torrents[id];
    set({ torrents, order: sortIds(torrents), lastEventAt: Date.now() });
  },

  setError: message => set({ bootError: message }),

  shutdown: async () => {
    try {
      await TorrentNative.shutdownEngine();
    } catch {
      // ignore
    }
    set({ initialized: false, engineStatus: { ...emptyStatus } });
  },
}));

let unsubscribeFns: Array<() => void> = [];

export function subscribeToNativeEvents(): () => void {
  if (unsubscribeFns.length > 0) {
    return () => {
      for (const fn of unsubscribeFns) {
        fn();
      }
      unsubscribeFns = [];
    };
  }

  const store = useTorrentStore;

  unsubscribeFns = [
    addTorrentListener('onTorrentAdded', payload => {
      if (payload?.torrent) {
        store.getState().addOne(payload.torrent);
      }
    }),
    addTorrentListener('onTorrentMetadataReceived', payload => {
      if (payload?.torrent) {
        store.getState().addOne(payload.torrent);
      }
    }),
    addTorrentListener('onTorrentStateChanged', payload => {
      if (payload?.torrent) {
        store.getState().addOne(payload.torrent);
      }
    }),
    addTorrentListener('onTorrentProgress', payload => {
      const list = payload?.torrents;
      if (Array.isArray(list)) {
        store.getState().applySummaries(list);
      }
    }),
    addTorrentListener('onTorrentRemoved', payload => {
      if (payload?.torrentId) {
        store.getState().removeOne(payload.torrentId);
      }
    }),
    addTorrentListener('onTorrentError', payload => {
      if (payload?.torrent) {
        store.getState().addOne(payload.torrent);
      } else if (payload?.torrentId) {
        const existing = store.getState().torrents[payload.torrentId];
        if (existing) {
          store.getState().addOne({ ...existing, state: 'error', error: payload.error });
        }
      }
    }),
    addTorrentListener('onEngineStatusChanged', payload => {
      if (payload?.status) {
        store.setState({ engineStatus: payload.status });
      }
    }),
  ];

  return () => {
    for (const fn of unsubscribeFns) {
      fn();
    }
    unsubscribeFns = [];
  };
}
