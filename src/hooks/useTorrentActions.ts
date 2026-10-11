import { useCallback, useState } from 'react';
import TorrentNative from '../native/TorrentNative';
import { useTorrentStore } from '../store/torrentStore';

export function useTorrentActions() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? 'Operation failed');
    } finally {
      setBusy(null);
    }
  }, []);

  const pause = useCallback(
    (id: string) => run(`pause:${id}`, () => TorrentNative.pauseTorrent(id)),
    [run],
  );

  const resume = useCallback(
    (id: string) => run(`resume:${id}`, () => TorrentNative.resumeTorrent(id)),
    [run],
  );

  const remove = useCallback(
    (id: string, deleteFiles: boolean) =>
      run(`remove:${id}`, async () => {
        await TorrentNative.removeTorrent(id, deleteFiles);
        useTorrentStore.getState().removeOne(id);
      }),
    [run],
  );

  const pauseAll = useCallback(() => run('pauseAll', () => TorrentNative.pauseAll()), [run]);
  const startAll = useCallback(() => run('startAll', () => TorrentNative.startAll()), [run]);

  const retry = useCallback(
    (id: string) =>
      run(`retry:${id}`, async () => {
        await TorrentNative.resumeTorrent(id);
      }),
    [run],
  );

  return { busy, error, pause, resume, remove, pauseAll, startAll, retry, clearError: () => setError(null) };
}
