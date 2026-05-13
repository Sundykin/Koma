/**
 * 二创工作台 store
 *
 * 二创独立于 project：以"导入的视频"为主键（RecreationVideo）。
 * 各 Tab 通过 useEffect 拉取真实数据；store 仅管 UI 状态 + 修改单。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ModificationItem, ModificationPlan } from './types';

export interface RecreationVideo {
  id: string;
  filename: string;
  filePath: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  sizeBytes: number | null;
  codec: string | null;
  sha256: string | null;
  diagnosisStatus: 'none' | 'running' | 'completed' | 'failed';
  /** 派生：本行是修改单产物时指向源视频 id；nullable */
  parentId: string | null;
  derivedFromPlanId: string | null;
  derivedKind: string | null;
  sourceTaskId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type WorkbenchTab = 'overview' | 'report' | 'cart' | 'queue' | 'vault';

interface RecreationState {
  activeTab: WorkbenchTab;
  /** 当前选中的视频 id（点报告 / 浏览报告时设置）*/
  activeVideoId: string | null;
  /** 当前修改单 */
  activePlan: ModificationPlan;

  setTab(tab: WorkbenchTab): void;
  selectVideo(videoId: string | null): void;
  openReport(videoId: string): void;
  addModificationItem(item: ModificationItem): void;
  removeModificationItem(itemId: string): void;
  clearPlan(): void;
  submitPlan(): void;
}

const emptyPlan: ModificationPlan = {
  planId: 'plan-new',
  reportId: '',
  sourceMediaId: '',
  items: [],
  createdAt: Date.now(),
  dagLayers: [],
};

export const useRecreationStore = create<RecreationState>()(
  persist(
    (set, get) => ({
      activeTab: 'overview',
      activeVideoId: null,
      activePlan: emptyPlan,

      setTab(tab) { set({ activeTab: tab }); },
      selectVideo(videoId) { set({ activeVideoId: videoId }); },
      openReport(videoId) { set({ activeVideoId: videoId, activeTab: 'report' }); },

      addModificationItem(item) {
        const plan = get().activePlan;
        const items = [...plan.items, item];
        set({ activePlan: { ...plan, items, dagLayers: rebuildDagLayers(items) } });
      },
      removeModificationItem(itemId) {
        const plan = get().activePlan;
        const items = plan.items.filter((i) => i.itemId !== itemId);
        set({ activePlan: { ...plan, items, dagLayers: rebuildDagLayers(items) } });
      },
      clearPlan() {
        set({ activePlan: { ...emptyPlan, planId: `plan-${Date.now()}`, createdAt: Date.now() } });
      },

      submitPlan() {
        set({ activeTab: 'queue' });
      },
    }),
    {
      name: 'koma-recreation',
      partialize: (s) => ({ activePlan: s.activePlan, activeVideoId: s.activeVideoId }),
    },
  ),
);

function rebuildDagLayers(items: ModificationItem[]): string[][] {
  const first: string[] = [];
  const second: string[] = [];
  for (const it of items) {
    if (it.kind === 'wardrobe' || it.kind === 'body_reshape' || it.kind === 'stylization') {
      second.push(it.itemId);
    } else {
      first.push(it.itemId);
    }
  }
  return [first, second].filter((l) => l.length > 0);
}
