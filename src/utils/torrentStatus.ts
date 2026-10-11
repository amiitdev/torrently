import type { TorrentState, TorrentSummary } from '../types';

export const STATE_ORDER: Record<TorrentState, number> = {
  error: 0,
  downloading: 1,
  metadata: 2,
  checking: 3,
  stalled: 4,
  queued: 5,
  paused: 6,
  seeding: 7,
  completed: 8,
};

export const STATE_LABEL: Record<TorrentState, string> = {
  error: 'Error',
  downloading: 'Downloading',
  metadata: 'Fetching metadata',
  checking: 'Checking',
  stalled: 'Stalled',
  queued: 'Queued',
  paused: 'Paused',
  seeding: 'Seeding',
  completed: 'Completed',
};

export function isActiveState(state: TorrentState): boolean {
  return state === 'downloading' || state === 'metadata' || state === 'checking' || state === 'stalled';
}

export function isTerminalState(state: TorrentState): boolean {
  return state === 'completed' || state === 'seeding';
}

export type SortKey = 'name' | 'progress' | 'size' | 'speed' | 'status';

export interface SortSpec {
  key: SortKey;
  direction: 'asc' | 'desc';
}

function compare(a: TorrentSummary, b: TorrentSummary, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    case 'progress':
      return a.progress - b.progress;
    case 'size':
      return a.totalSize - b.totalSize;
    case 'speed':
      return a.downloadSpeed - b.downloadSpeed;
    case 'status':
    default: {
      const diff = STATE_ORDER[a.state] - STATE_ORDER[b.state];
      if (diff !== 0) {
        return diff;
      }
      return a.queuePosition - b.queuePosition;
    }
  }
}

export function sortTorrents(list: TorrentSummary[], spec: SortSpec): TorrentSummary[] {
  const sorted = [...list].sort((a, b) => compare(a, b, spec.key));
  if (spec.direction === 'desc') {
    sorted.reverse();
  }
  return sorted;
}

export function filterTorrents(
  list: TorrentSummary[],
  filter: 'all' | 'active' | 'queued' | 'paused' | 'error',
): TorrentSummary[] {
  switch (filter) {
    case 'active':
      return list.filter(t => isActiveState(t.state));
    case 'queued':
      return list.filter(t => t.state === 'queued');
    case 'paused':
      return list.filter(t => t.state === 'paused');
    case 'error':
      return list.filter(t => t.state === 'error');
    case 'all':
    default:
      return list;
  }
}
