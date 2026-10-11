import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type {
  AppSettings,
  EngineInitOptions,
  EngineStatus,
  FilePriority,
  NativeError,
  StorageInfo,
  TorrentAddOptions,
  TorrentDetails,
  TorrentSummary,
} from '../types';

const LINKING_ERROR =
  `The native module 'TorrentModule' is not linked. Make sure you have completed the ` +
  `Android build (and are running a dev client / debug build), then reload the app.`;

interface TorrentModuleShape {
  initializeEngine(options: string): Promise<EngineStatus>;
  addMagnet(magnetUri: string, options: string): Promise<TorrentSummary>;
  addTorrentFile(fileUri: string, options: string): Promise<TorrentSummary>;
  pauseTorrent(torrentId: string): Promise<boolean>;
  resumeTorrent(torrentId: string): Promise<boolean>;
  removeTorrent(torrentId: string, deleteFiles: boolean): Promise<boolean>;
  getTorrentList(): Promise<TorrentSummary[]>;
  getTorrentDetails(torrentId: string): Promise<TorrentDetails>;
  setDownloadLimit(bytesPerSecond: number): Promise<boolean>;
  setUploadLimit(bytesPerSecond: number): Promise<boolean>;
  setTorrentPriority(torrentId: string, fileId: number, priority: number): Promise<boolean>;
  setFileSelection(torrentId: string, fileId: number, selected: boolean): Promise<boolean>;
  startAll(): Promise<number>;
  pauseAll(): Promise<number>;
  getEngineStatus(): Promise<EngineStatus>;
  shutdownEngine(): Promise<boolean>;
  getSettings(): Promise<AppSettings>;
  setSettings(json: string): Promise<AppSettings>;
  getStorageInfo(): Promise<StorageInfo>;
  pickTorrentFile(): Promise<string | null>;
  pickDownloadDirectory(): Promise<{ uri: string; path: string } | null>;
  getFileUri(torrentId: string, fileId: number): Promise<string | null>;
  getFilesForTorrent(torrentId: string): Promise<string[]>;
  moveToTop(torrentId: string): Promise<boolean>;
  moveToBottom(torrentId: string): Promise<boolean>;
  clearCompletedHistory(deleteFiles: boolean): Promise<number>;
  getCompletedHistory(): Promise<unknown[]>;
  getDirectoryUri(torrentId: string): Promise<string | null>;
  openExternal(uri: string): Promise<boolean>;
  getOpenSourceLicenses(): Promise<string>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const NativeTorrent: TorrentModuleShape = NativeModules.TorrentModule
  ? NativeModules.TorrentModule
  : new Proxy({} as TorrentModuleShape, {
      get() {
        throw new Error(LINKING_ERROR);
      },
    });

let emitter: NativeEventEmitter | null = null;

function getEmitter(): NativeEventEmitter {
  if (!emitter) {
    emitter = new NativeEventEmitter(NativeModules.TorrentModule);
  }
  return emitter;
}

export class NativeCallError extends Error {
  code: string;
  details?: string;

  constructor(error: NativeError) {
    super(error.message);
    this.name = 'NativeCallError';
    this.code = error.code;
    this.details = error.details;
  }
}

function normalizeError(error: unknown): NativeCallError {
  if (error instanceof NativeCallError) {
    return error;
  }
  const anyErr = error as { code?: string; message?: string; userInfo?: { details?: string } };
  if (anyErr && typeof anyErr.message === 'string') {
    return new NativeCallError({
      code: anyErr.code ?? 'E_UNKNOWN',
      message: anyErr.message,
      details: anyErr.userInfo?.details,
    });
  }
  return new NativeCallError({ code: 'E_UNKNOWN', message: String(error) });
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw normalizeError(e);
  }
}

export const TorrentNative = {
  initializeEngine(options: EngineInitOptions): Promise<EngineStatus> {
    return call(() => NativeTorrent.initializeEngine(JSON.stringify(options ?? {})));
  },

  addMagnet(magnetUri: string, options: TorrentAddOptions): Promise<TorrentSummary> {
    return call(() => NativeTorrent.addMagnet(magnetUri, JSON.stringify(options ?? {})));
  },

  addTorrentFile(fileUri: string, options: TorrentAddOptions): Promise<TorrentSummary> {
    return call(() => NativeTorrent.addTorrentFile(fileUri, JSON.stringify(options ?? {})));
  },

  pauseTorrent(torrentId: string): Promise<boolean> {
    return call(() => NativeTorrent.pauseTorrent(torrentId));
  },

  resumeTorrent(torrentId: string): Promise<boolean> {
    return call(() => NativeTorrent.resumeTorrent(torrentId));
  },

  removeTorrent(torrentId: string, deleteFiles: boolean): Promise<boolean> {
    return call(() => NativeTorrent.removeTorrent(torrentId, deleteFiles));
  },

  getTorrentList(): Promise<TorrentSummary[]> {
    return call(() => NativeTorrent.getTorrentList());
  },

  getTorrentDetails(torrentId: string): Promise<TorrentDetails> {
    return call(() => NativeTorrent.getTorrentDetails(torrentId));
  },

  setDownloadLimit(bytesPerSecond: number): Promise<boolean> {
    return call(() => NativeTorrent.setDownloadLimit(bytesPerSecond));
  },

  setUploadLimit(bytesPerSecond: number): Promise<boolean> {
    return call(() => NativeTorrent.setUploadLimit(bytesPerSecond));
  },

  setTorrentPriority(
    torrentId: string,
    fileId: number,
    priority: FilePriority,
  ): Promise<boolean> {
    return call(() => NativeTorrent.setTorrentPriority(torrentId, fileId, priority));
  },

  setFileSelection(torrentId: string, fileId: number, selected: boolean): Promise<boolean> {
    return call(() => NativeTorrent.setFileSelection(torrentId, fileId, selected));
  },

  startAll(): Promise<number> {
    return call(() => NativeTorrent.startAll());
  },

  pauseAll(): Promise<number> {
    return call(() => NativeTorrent.pauseAll());
  },

  getEngineStatus(): Promise<EngineStatus> {
    return call(() => NativeTorrent.getEngineStatus());
  },

  shutdownEngine(): Promise<boolean> {
    return call(() => NativeTorrent.shutdownEngine());
  },

  getSettings(): Promise<AppSettings> {
    return call(() => NativeTorrent.getSettings());
  },

  setSettings(settings: AppSettings): Promise<AppSettings> {
    return call(() => NativeTorrent.setSettings(JSON.stringify(settings)));
  },

  getStorageInfo(): Promise<StorageInfo> {
    return call(() => NativeTorrent.getStorageInfo());
  },

  pickTorrentFile(): Promise<string | null> {
    return call(() => NativeTorrent.pickTorrentFile());
  },

  pickDownloadDirectory(): Promise<{ uri: string; path: string } | null> {
    return call(() => NativeTorrent.pickDownloadDirectory());
  },

  getFileUri(torrentId: string, fileId: number): Promise<string | null> {
    return call(() => NativeTorrent.getFileUri(torrentId, fileId));
  },

  getFilesForTorrent(torrentId: string): Promise<string[]> {
    return call(() => NativeTorrent.getFilesForTorrent(torrentId));
  },

  moveToTop(torrentId: string): Promise<boolean> {
    return call(() => NativeTorrent.moveToTop(torrentId));
  },

  moveToBottom(torrentId: string): Promise<boolean> {
    return call(() => NativeTorrent.moveToBottom(torrentId));
  },

  clearCompletedHistory(deleteFiles: boolean): Promise<number> {
    return call(() => NativeTorrent.clearCompletedHistory(deleteFiles));
  },

  getCompletedHistory(): Promise<unknown[]> {
    return call(() => NativeTorrent.getCompletedHistory());
  },

  getDirectoryUri(torrentId: string): Promise<string | null> {
    return call(() => NativeTorrent.getDirectoryUri(torrentId));
  },

  openExternal(uri: string): Promise<boolean> {
    return call(() => NativeTorrent.openExternal(uri));
  },

  getOpenSourceLicenses(): Promise<string> {
    return call(() => NativeTorrent.getOpenSourceLicenses());
  },
};

export type TorrentEventName =
  | 'onTorrentAdded'
  | 'onTorrentMetadataReceived'
  | 'onTorrentStateChanged'
  | 'onTorrentProgress'
  | 'onTorrentRemoved'
  | 'onTorrentError'
  | 'onEngineStatusChanged';

export function addTorrentListener(
  event: TorrentEventName,
  listener: (payload: any) => void,
): () => void {
  const subscription = getEmitter().addListener(event, listener);
  return () => subscription.remove();
}

export const isAndroid = Platform.OS === 'android';

export default TorrentNative;
