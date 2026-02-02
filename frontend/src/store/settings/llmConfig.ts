/**
 * LLM 配置 CRUD
 */
import { loadSettings, saveSettings, generateId } from './core';
import type { LLMModelConfig } from '../../types';

export async function addLLMConfig(
  config: Omit<LLMModelConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<LLMModelConfig> {
  const settings = await loadSettings();
  const now = Date.now();

  const newConfig: LLMModelConfig = {
    ...config,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  if (newConfig.isDefault) {
    settings.llmConfigs = settings.llmConfigs.map(c => ({ ...c, isDefault: false }));
  }
  if (settings.llmConfigs.length === 0) {
    newConfig.isDefault = true;
  }

  settings.llmConfigs.push(newConfig);
  await saveSettings(settings);
  return newConfig;
}

export async function updateLLMConfig(
  id: string,
  updates: Partial<Omit<LLMModelConfig, 'id' | 'createdAt'>>
): Promise<LLMModelConfig | null> {
  const settings = await loadSettings();
  const index = settings.llmConfigs.findIndex(c => c.id === id);
  if (index === -1) return null;

  if (updates.isDefault) {
    settings.llmConfigs = settings.llmConfigs.map(c => ({ ...c, isDefault: false }));
  }

  settings.llmConfigs[index] = {
    ...settings.llmConfigs[index],
    ...updates,
    updatedAt: Date.now(),
  };

  await saveSettings(settings);
  return settings.llmConfigs[index];
}

export async function deleteLLMConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  const index = settings.llmConfigs.findIndex(c => c.id === id);
  if (index === -1) return false;

  const wasDefault = settings.llmConfigs[index].isDefault;
  settings.llmConfigs.splice(index, 1);

  if (wasDefault && settings.llmConfigs.length > 0) {
    settings.llmConfigs[0].isDefault = true;
  }

  await saveSettings(settings);
  return true;
}

export async function setDefaultLLMConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  const config = settings.llmConfigs.find(c => c.id === id);
  if (!config) return false;

  settings.llmConfigs = settings.llmConfigs.map(c => ({
    ...c,
    isDefault: c.id === id,
    updatedAt: c.id === id ? Date.now() : c.updatedAt,
  }));

  await saveSettings(settings);
  return true;
}

export async function getDefaultLLMConfig(): Promise<LLMModelConfig | null> {
  const settings = await loadSettings();
  return settings.llmConfigs.find(c => c.isDefault) || settings.llmConfigs[0] || null;
}

export async function getLLMConfigById(id: string): Promise<LLMModelConfig | null> {
  const settings = await loadSettings();
  return settings.llmConfigs.find(c => c.id === id) || null;
}

export async function getActiveLLMConfig(projectLLMConfigId?: string): Promise<LLMModelConfig | null> {
  if (projectLLMConfigId) {
    const projectConfig = await getLLMConfigById(projectLLMConfigId);
    if (projectConfig) return projectConfig;
  }
  return getDefaultLLMConfig();
}
