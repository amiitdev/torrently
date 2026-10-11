import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { SortOption } from './torrentStore';

const KEY = 'torrently.ui.prefs';

export type ActiveFilter = 'all' | 'active' | 'queued' | 'paused' | 'error';

interface UiPrefs {
  activeSort: SortOption;
  activeFilter: ActiveFilter;
  hydrated: boolean;
  setSort: (sort: SortOption) => void;
  setFilter: (filter: ActiveFilter) => void;
  hydrate: () => Promise<void>;
}

const DEFAULT_SORT: SortOption = { key: 'status', direction: 'asc' };

async function persist(prefs: { activeSort: SortOption; activeFilter: ActiveFilter }) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // non-critical UI preference
  }
}

export const useUiPrefs = create<UiPrefs>((set, get) => ({
  activeSort: DEFAULT_SORT,
  activeFilter: 'all',
  hydrated: false,

  setSort: sort => {
    set({ activeSort: sort });
    persist({ activeSort: sort, activeFilter: get().activeFilter });
  },

  setFilter: filter => {
    set({ activeFilter: filter });
    persist({ activeSort: get().activeSort, activeFilter: filter });
  },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          activeSort: parsed.activeSort ?? DEFAULT_SORT,
          activeFilter: parsed.activeFilter ?? 'all',
          hydrated: true,
        });
        return;
      }
    } catch {
      // fall through to defaults
    }
    set({ hydrated: true });
  },
}));
