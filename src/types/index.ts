export type TorrentState =
  | 'metadata'
  | 'queued'
  | 'downloading'
  | 'checking'
  | 'stalled'
  | 'paused'
  | 'seeding'
  | 'completed'
  | 'error';

export type FilePriority = 0 | 1 | 4 | 7;

export interface TorrentFile {
  index: number;
  path: string;
  name: string;
  size: number;
  progress: number;
  priority: FilePriority;
  selected: boolean;
}

export interface TrackerInfo {
  url: string;
  status: string;
  peers: number;
  nextAnnounceIn: number;
  error: string | null;
}

export interface TorrentSummary {
  id: string;
  name: string;
  state: TorrentState;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  totalSize: number;
  downloadedSize: number;
  uploadedSize: number;
  etaSeconds: number | null;
  seeds: number;
  peers: number;
  savePath: string;
  savePathTreeUri: string | null;
  queuePosition: number;
  addedAt: number;
  completedAt: number | null;
  hasMetadata: boolean;
  finished: boolean;
  error: string | null;
}

export interface TorrentDetails extends TorrentSummary {
  files: TorrentFile[];
  trackers: TrackerInfo[];
  totalPeersListed: number;
  totalSeedsListed: number;
  allTimeDownload: number;
  allTimeUpload: number;
  distributedCopies: number;
  pieceCount: number;
  pieceLength: number;
  currentTracker: string | null;
  addedTime: number;
  activeDurationSec: number;
  seedingDurationSec: number;
}

export interface EngineStatus {
  initialized: boolean;
  running: boolean;
  dhtEnabled: boolean;
  dhtNodes: number;
  downloadSpeed: number;
  uploadSpeed: number;
  totalDownload: number;
  totalUpload: number;
  listening: boolean;
  externalAddress: string | null;
  activeCount: number;
  pausedCount: number;
  completedCount: number;
  torrentCount: number;
}

export interface TorrentAddOptions {
  savePath?: string;
  savePathTreeUri?: string | null;
  paused?: boolean;
  filePriorities?: FilePriority[];
  sequential?: boolean;
}

export interface EngineInitOptions {
  downloadRateLimit?: number;
  uploadRateLimit?: number;
  maxActiveTorrents?: number;
  maxConnections?: number;
  maxPeers?: number;
  enableDht?: boolean;
  enableLsd?: boolean;
  enablePex?: boolean;
  anonymousMode?: boolean;
}

export interface AppSettings {
  downloadDirectory: string;
  downloadDirectoryTreeUri: string | null;
  maxActiveTorrents: number;
  downloadLimitBps: number;
  uploadLimitBps: number;
  maxConnections: number;
  maxPeersPerTorrent: number;
  wifiOnly: boolean;
  chargingOnly: boolean;
  notificationsEnabled: boolean;
  notificationProgress: boolean;
  autoResumeOnStart: boolean;
  seedAfterCompletion: boolean;
  sequentialDownload: boolean;
  totalDownloaded: number;
  totalUploaded: number;
}

export interface StorageInfo {
  totalBytes: number;
  freeBytes: number;
  downloadDirectory: string;
  downloadDirectoryWritable: boolean;
}

export interface NativeError {
  code: string;
  message: string;
  details?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  downloadDirectory: '',
  downloadDirectoryTreeUri: null,
  maxActiveTorrents: 3,
  downloadLimitBps: 0,
  uploadLimitBps: 0,
  maxConnections: 200,
  maxPeersPerTorrent: 60,
  wifiOnly: false,
  chargingOnly: false,
  notificationsEnabled: true,
  notificationProgress: true,
  autoResumeOnStart: true,
  seedAfterCompletion: true,
  sequentialDownload: false,
  totalDownloaded: 0,
  totalUploaded: 0,
};
