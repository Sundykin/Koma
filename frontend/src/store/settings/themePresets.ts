/**
 * 自定义视觉风格预设 CRUD（SQLite 版本）
 */
import type { ThemePreset } from '../../types';
import { ensureConfigReady, useConfigStore } from '../useConfigStore';
import { getConfigAPI, type VisualStylePresetRow } from '../../services/configBridge';

function rowToPreset(row: VisualStylePresetRow): ThemePreset {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    ttiStylePrefix: row.tti_prefix ?? '',
    llmPromptSuffix: row.llm_suffix ?? '',
    previewImage: row.thumbnail_path ?? undefined,
  };
}

function presetToRow(preset: ThemePreset, existing?: VisualStylePresetRow): VisualStylePresetRow {
  const now = Date.now();
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    tti_prefix: preset.ttiStylePrefix,
    llm_suffix: preset.llmPromptSuffix,
    thumbnail_path: preset.previewImage,
    is_builtin: existing?.is_builtin ?? 0,
    sort_order: existing?.sort_order ?? 0,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

export async function getCustomThemePresets(): Promise<ThemePreset[]> {
  await ensureConfigReady();
  return useConfigStore.getState().styles
    .filter((row) => row.is_builtin !== 1)
    .map(rowToPreset);
}

export async function addCustomThemePreset(
  preset: Omit<ThemePreset, 'id'>,
): Promise<ThemePreset> {
  const newPreset: ThemePreset = {
    ...preset,
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  };
  const api = getConfigAPI();
  await api.style.upsert(presetToRow(newPreset));
  await useConfigStore.getState().refreshDomain('style');
  return newPreset;
}

export async function updateCustomThemePreset(
  id: string,
  updates: Partial<Omit<ThemePreset, 'id'>>,
): Promise<ThemePreset | null> {
  await ensureConfigReady();
  const existing = useConfigStore.getState().styles.find((r) => r.id === id);
  if (!existing) return null;

  const next: ThemePreset = {
    ...rowToPreset(existing),
    ...updates,
    id,
  };
  const api = getConfigAPI();
  await api.style.upsert(presetToRow(next, existing));
  await useConfigStore.getState().refreshDomain('style');
  return next;
}

export async function deleteCustomThemePreset(id: string): Promise<boolean> {
  const api = getConfigAPI();
  const res = await api.style.delete(id);
  await useConfigStore.getState().refreshDomain('style');
  return res.success;
}
