import type { TorrentSummary } from '../src/types';
import {
  STATE_LABEL,
  filterTorrents,
  isActiveState,
  isTerminalState,
  sortTorrents,
} from '../src/utils/torrentStatus';

function torrent(overrides: Partial<TorrentSummary>): TorrentSummary {
  return {
    id: 'a'.repeat(40),
    name: 'sample',
    state: 'downloading',
    progress: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    totalSize: 0,
    downloadedSize: 0,
    uploadedSize: 0,
    etaSeconds: null,
    seeds: 0,
    peers: 0,
    savePath: '/tmp',
    savePathTreeUri: null,
    queuePosition: 1,
    addedAt: 1,
    completedAt: null,
    hasMetadata: true,
    finished: false,
    error: null,
    ...overrides,
  };
}

describe('torrent state helpers', () => {
  it('labels every known state', () => {
    (Object.keys(STATE_LABEL) as Array<keyof typeof STATE_LABEL>).forEach(key => {
      expect(typeof STATE_LABEL[key]).toBe('string');
      expect(STATE_LABEL[key].length).toBeGreaterThan(0);
    });
  });

  it('classifies active and terminal states', () => {
    expect(isActiveState('downloading')).toBe(true);
    expect(isActiveState('metadata')).toBe(true);
    expect(isActiveState('checking')).toBe(true);
    expect(isActiveState('stalled')).toBe(true);
    expect(isActiveState('paused')).toBe(false);
    expect(isActiveState('completed')).toBe(false);

    expect(isTerminalState('completed')).toBe(true);
    expect(isTerminalState('seeding')).toBe(true);
    expect(isTerminalState('error')).toBe(false);
    expect(isTerminalState('downloading')).toBe(false);
  });
});

describe('sorting', () => {
  const list = [
    torrent({ id: '1', name: 'beta', progress: 0.5, totalSize: 300, downloadSpeed: 10, state: 'paused' }),
    torrent({ id: '2', name: 'alpha', progress: 0.9, totalSize: 100, downloadSpeed: 90, state: 'downloading' }),
    torrent({ id: '3', name: 'Gamma', progress: 0.1, totalSize: 200, downloadSpeed: 50, state: 'error' }),
  ];

  it('sorts by name case-insensitively with numeric awareness', () => {
    const sorted = sortTorrents(list, { key: 'name', direction: 'asc' }).map(t => t.name);
    expect(sorted).toEqual(['alpha', 'beta', 'Gamma']);
  });

  it('sorts by progress and size', () => {
    expect(sortTorrents(list, { key: 'progress', direction: 'asc' }).map(t => t.id)).toEqual(['3', '1', '2']);
    expect(sortTorrents(list, { key: 'size', direction: 'desc' }).map(t => t.id)).toEqual(['1', '3', '2']);
  });

  it('sorts by speed', () => {
    expect(sortTorrents(list, { key: 'speed', direction: 'desc' }).map(t => t.id)).toEqual(['2', '3', '1']);
  });

  it('sorts by status with error first and queue order as tie-breaker', () => {
    const sorted = sortTorrents(list, { key: 'status', direction: 'asc' }).map(t => t.state);
    expect(sorted).toEqual(['error', 'downloading', 'paused']);
  });

  it('does not mutate the input list', () => {
    const copy = [...list];
    sortTorrents(list, { key: 'name', direction: 'desc' });
    expect(list).toEqual(copy);
  });
});

describe('filtering', () => {
  const list = [
    torrent({ id: 'a', state: 'downloading' }),
    torrent({ id: 'b', state: 'queued' }),
    torrent({ id: 'c', state: 'paused' }),
    torrent({ id: 'd', state: 'error' }),
    torrent({ id: 'e', state: 'completed' }),
  ];

  it('filters by state groups', () => {
    expect(filterTorrents(list, 'all')).toHaveLength(5);
    expect(filterTorrents(list, 'active').map(t => t.id)).toEqual(['a']);
    expect(filterTorrents(list, 'queued').map(t => t.id)).toEqual(['b']);
    expect(filterTorrents(list, 'paused').map(t => t.id)).toEqual(['c']);
    expect(filterTorrents(list, 'error').map(t => t.id)).toEqual(['d']);
  });
});
