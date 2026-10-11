import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  AddTorrent: { magnet?: string; fileUri?: string } | undefined;
  TorrentDetails: { torrentId: string };
};

export type TabParamList = {
  Dashboard: undefined;
  Downloads: undefined;
  Completed: undefined;
  Settings: undefined;
};
