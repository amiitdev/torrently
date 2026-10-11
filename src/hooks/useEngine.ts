import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import TorrentNative from '../native/TorrentNative';
import { subscribeToNativeEvents, useTorrentStore } from '../store/torrentStore';
import { useUiPrefs } from '../store/uiPrefsStore';
import type { RootStackParamList } from '../navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export function useEngineBootstrap(
  navigation?: NativeStackNavigationProp<RootStackParamList>,
): { ready: boolean; error: string | null; retry: () => void } {
  const bootstrap = useTorrentStore(s => s.bootstrap);
  const initialized = useTorrentStore(s => s.initialized);
  const bootError = useTorrentStore(s => s.bootError);
  const hydratePrefs = useUiPrefs(s => s.hydrate);
  const started = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeToNativeEvents();
    hydratePrefs();
    if (!started.current) {
      started.current = true;
      bootstrap();
    }
    return unsubscribe;
  }, [bootstrap, hydratePrefs]);

  useEffect(() => {
    const onUrl = ({ url }: { url: string }) => {
      if (!navigation) {
        return;
      }
      if (/^magnet:/i.test(url)) {
        navigation.navigate('AddTorrent', { magnet: url });
      } else if (/\.torrent($|\?)/i.test(url)) {
        navigation.navigate('AddTorrent', { fileUri: url });
      }
    };
    const initial = Linking.getInitialURL().then(url => {
      if (url) {
        onUrl({ url });
      }
    });
    const sub = Linking.addEventListener('url', onUrl);
    Promise.resolve(initial).catch(() => undefined);
    return () => sub.remove();
  }, [navigation]);

  return {
    ready: initialized,
    error: bootError,
    retry: () => {
      useTorrentStore.setState({ initialized: false, loading: false });
      bootstrap();
    },
  };
}

export function useTorrentLifecycle() {
  const refresh = useTorrentStore(s => s.refresh);
  const refreshEngineStatus = useTorrentStore(s => s.refreshEngineStatus);

  useEffect(() => {
    const id = setInterval(() => {
      refreshEngineStatus();
    }, 4000);
    return () => clearInterval(id);
  }, [refreshEngineStatus]);

  return { refresh };
}

export async function ensureEngineReady(): Promise<void> {
  const state = useTorrentStore.getState();
  if (state.initialized) {
    return;
  }
  await state.bootstrap();
}

export { TorrentNative };
