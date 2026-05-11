/**
 * 灵绘全局资产库（C-5B）：跨 workspace 共享的用户自定义角色 / 道具。
 *
 * 与内置预设的关系：
 *  - 内置（DIRECTOR3D_CHARACTER_PRESETS / DIRECTOR3D_PROP_LIBRARY）= 系统资产，不可改
 *  - 用户自定义（此模块）= 持久化到 sqlite linghui_global_assets 表，可改可删
 *
 * 前端 hook：useLinghuiGlobalAssets({ kind })
 *  - 自动 fetch + 缓存
 *  - 提供 reload / save / remove API
 */
import { useCallback, useEffect, useState } from 'react';
import { electronService } from '../services/electronService';
import type { LinghuiDirector3DActorPose } from '../types/linghui';

export type LinghuiGlobalAssetKind = 'character' | 'prop';
export type LinghuiGlobalAssetPropType = 'prop-box' | 'prop-cylinder' | 'prop-plane' | 'prop-camera' | 'prop-arrow';
export type LinghuiGlobalAssetCategory = 'basic' | 'furniture' | 'vehicle' | 'nature' | 'gear';

export interface LinghuiGlobalAsset {
  id: string;
  kind: LinghuiGlobalAssetKind;
  label: string;
  hint?: string;
  promptHint?: string;
  color?: string;
  scale?: number;
  posePreset?: LinghuiDirector3DActorPose;
  propType?: LinghuiGlobalAssetPropType;
  category?: LinghuiGlobalAssetCategory;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LinghuiGlobalAssetInput {
  id?: string;
  kind: LinghuiGlobalAssetKind;
  label: string;
  hint?: string;
  promptHint?: string;
  color?: string;
  scale?: number;
  posePreset?: LinghuiDirector3DActorPose;
  propType?: LinghuiGlobalAssetPropType;
  category?: LinghuiGlobalAssetCategory;
  favorite?: boolean;
}

function normalize(raw: unknown): LinghuiGlobalAsset | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  const kind = r.kind === 'character' || r.kind === 'prop' ? r.kind : null;
  const label = typeof r.label === 'string' ? r.label : '';
  if (!id || !kind || !label) return null;

  return {
    id,
    kind,
    label,
    hint: typeof r.hint === 'string' ? r.hint : undefined,
    promptHint: typeof r.promptHint === 'string' ? r.promptHint : undefined,
    color: typeof r.color === 'string' ? r.color : undefined,
    scale: typeof r.scale === 'number' ? r.scale : undefined,
    posePreset: typeof r.posePreset === 'string' ? r.posePreset as LinghuiDirector3DActorPose : undefined,
    propType: typeof r.propType === 'string' ? r.propType as LinghuiGlobalAssetPropType : undefined,
    category: typeof r.category === 'string' ? r.category as LinghuiGlobalAssetCategory : undefined,
    favorite: Boolean(r.favorite),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
  };
}

export async function fetchLinghuiGlobalAssets(kind?: LinghuiGlobalAssetKind): Promise<LinghuiGlobalAsset[]> {
  if (!electronService.isElectron()) return [];
  const rows = await electronService.linghui.listGlobalAssets(kind);
  return Array.isArray(rows)
    ? rows.map(normalize).filter((value): value is LinghuiGlobalAsset => value !== null)
    : [];
}

export async function saveLinghuiGlobalAsset(input: LinghuiGlobalAssetInput): Promise<LinghuiGlobalAsset> {
  if (!electronService.isElectron()) {
    throw new Error('全局资产库仅支持桌面端');
  }
  const result = await electronService.linghui.upsertGlobalAsset(input);
  if (result && typeof result === 'object' && 'success' in result && (result as { success?: boolean }).success === false) {
    const err = (result as { error?: string }).error ?? '保存失败';
    throw new Error(err);
  }
  const normalized = normalize(result);
  if (!normalized) throw new Error('保存全局资产返回数据异常');
  return normalized;
}

export async function deleteLinghuiGlobalAsset(id: string): Promise<boolean> {
  if (!electronService.isElectron()) return false;
  const result = await electronService.linghui.deleteGlobalAsset(id);
  return Boolean(result && typeof result === 'object' && 'deleted' in result && (result as { deleted?: boolean }).deleted);
}

/**
 * 自动 fetch + 提供 mutate API 的 hook，可在编辑器 / 库 UI 共享。
 */
export function useLinghuiGlobalAssets(options?: { kind?: LinghuiGlobalAssetKind; enabled?: boolean }) {
  const { kind, enabled = true } = options ?? {};
  const [assets, setAssets] = useState<LinghuiGlobalAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAssets(await fetchLinghuiGlobalAssets(kind));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  const save = useCallback(async (input: LinghuiGlobalAssetInput) => {
    const next = await saveLinghuiGlobalAsset(input);
    setAssets(prev => {
      const without = prev.filter(a => a.id !== next.id);
      return [next, ...without].sort((a, b) => {
        if (a.favorite !== b.favorite) return b.favorite ? 1 : -1;
        return b.updatedAt - a.updatedAt;
      });
    });
    return next;
  }, []);

  const remove = useCallback(async (id: string) => {
    const ok = await deleteLinghuiGlobalAsset(id);
    if (ok) setAssets(prev => prev.filter(a => a.id !== id));
    return ok;
  }, []);

  return { assets, loading, error, reload, save, remove };
}
