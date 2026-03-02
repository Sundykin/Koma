/**
 * 设置状态管理 (Zustand)
 * 封装 settings 读写，初始化一次后通过 store 订阅变更
 */
import { create } from 'zustand';
import type { AppSettings } from '../types';
import { loadSettings, saveSettings } from './settings/core';

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  loading: boolean;

  /** Load settings from backend (call once at app start) */
  init: () => Promise<void>;
  /** Update settings and persist to backend */
  update: (patch: Partial<AppSettings>) => Promise<void>;
  /** Replace settings entirely */
  replace: (settings: AppSettings) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    llmConfigs: [],
    ttiConfigs: [],
    itvConfigs: [],
    ttsConfigs: [],
  },
  loaded: false,
  loading: false,

  init: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const settings = await loadSettings();
      set({ settings, loaded: true });
    } catch (err) {
      console.error('[SettingsStore] init failed:', err);
    } finally {
      set({ loading: false });
    }
  },

  update: async (patch) => {
    const merged = { ...get().settings, ...patch };
    set({ settings: merged });
    await saveSettings(merged);
  },

  replace: async (settings) => {
    set({ settings });
    await saveSettings(settings);
  },
}));
