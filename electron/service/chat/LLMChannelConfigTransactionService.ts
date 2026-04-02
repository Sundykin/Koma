import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { llmProfileStore } from './LLMProfileStore';

type ChannelModelDefinition = {
  id: string;
  label: string;
  providerModelName?: string;
  capabilities: string[];
  defaults?: Record<string, unknown>;
};

type ChannelConfig = {
  id: string;
  name: string;
  description?: string;
  category: 'llm';
  providerType: string;
  providerConfig: Record<string, unknown>;
  defaultModelId?: string;
  models: ChannelModelDefinition[];
  capabilities?: string[];
  polling?: Record<string, unknown>;
  enabled: boolean;
  isDefault?: boolean;
  source: 'builtin' | 'plugin';
  pluginId?: string;
  createdAt: number;
  updatedAt: number;
};

type AppSettings = {
  channelConfigs: ChannelConfig[];
  mediaDefaults?: Record<string, { channelId: string; modelId: string }>;
  promptTemplates?: Record<string, { template: string; updatedAt: number }>;
};

export interface SaveLLMChannelConfigRequest {
  rootPath: string;
  editingChannelId?: string;
  payload: Omit<ChannelConfig, 'id' | 'createdAt' | 'updatedAt'>;
  profileApiKey?: string;
  shouldUpdateDefault: boolean;
}

export interface DeleteLLMChannelConfigRequest {
  rootPath: string;
  channelId: string;
}

export interface MigrateLLMSecretsRequest {
  rootPath: string;
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  channelConfigs: [],
  mediaDefaults: {},
  promptTemplates: {},
};

const ENCRYPTED_PREFIX = '$ENC$';
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

function getMachineId(): string {
  return Buffer.from(app.getPath('userData')).toString('base64').slice(0, 32);
}

async function deriveKey(machineId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    encoder.encode(machineId.padEnd(32, '0').slice(0, 32)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return webcrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('koma-settings-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptValue(value: string, key: CryptoKey): Promise<string> {
  if (!value) return value;
  if (value.startsWith(ENCRYPTED_PREFIX)) return value;
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();
  const encrypted = await webcrypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoder.encode(value));
  const combined = new Uint8Array(IV_LENGTH + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), IV_LENGTH);
  return ENCRYPTED_PREFIX + Buffer.from(combined).toString('base64');
}

async function decryptValue(value: string, key: CryptoKey): Promise<string> {
  if (!value || !value.startsWith(ENCRYPTED_PREFIX)) return value;
  const raw = value.slice(ENCRYPTED_PREFIX.length);
  const combined = Uint8Array.from(Buffer.from(raw, 'base64'));
  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);
  const decrypted = await webcrypto.subtle.decrypt({ name: ALGORITHM, iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

async function processObject<T>(obj: T, processor: (value: string) => Promise<string>): Promise<T> {
  if (Array.isArray(obj)) {
    const result = [];
    for (const item of obj) result.push(await processObject(item, processor));
    return result as T;
  }
  if (obj && typeof obj === 'object') {
    const result = { ...(obj as Record<string, unknown>) } as Record<string, unknown>;
    for (const key of Object.keys(result)) {
      const value = result[key];
      if (['apiKey', 'apiSecret', 'token', 'password', 'credential', 'secret'].includes(key) && typeof value === 'string') {
        result[key] = await processor(value);
      } else if (value && typeof value === 'object') {
        result[key] = await processObject(value, processor);
      }
    }
    return result as T;
  }
  return obj;
}

function migrateEncryptedData<T>(data: T): T {
  if (Array.isArray(data)) return data.map(item => migrateEncryptedData(item)) as T;
  if (data && typeof data === 'object') {
    const result = { ...(data as Record<string, unknown>) } as Record<string, unknown>;
    for (const key of Object.keys(result)) {
      const value = result[key];
      if (value && typeof value === 'object' && (value as any).encrypted === true) {
        result[key] = '';
      } else if (value && typeof value === 'object') {
        result[key] = migrateEncryptedData(value);
      }
    }
    return result as T;
  }
  return data;
}

async function loadSettingsAt(rootPath: string): Promise<AppSettings> {
  const filePath = path.join(rootPath, 'settings.json');
  if (!fs.existsSync(filePath)) return { ...DEFAULT_SETTINGS };
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = migrateEncryptedData(JSON.parse(raw));
  const key = await deriveKey(getMachineId());
  const decrypted = await processObject(parsed, (value) => decryptValue(value, key));
  return { ...DEFAULT_SETTINGS, ...(decrypted as AppSettings) };
}

async function saveSettingsAt(rootPath: string, settings: AppSettings): Promise<void> {
  const key = await deriveKey(getMachineId());
  const encrypted = await processObject(settings, (value) => encryptValue(value, key));
  const filePath = path.join(rootPath, 'settings.json');
  fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2), 'utf-8');
}

function cloneSettings(settings: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(settings)) as AppSettings;
}

function upsertChannel(settings: AppSettings, request: SaveLLMChannelConfigRequest): ChannelConfig {
  const now = Date.now();
  if (request.editingChannelId) {
    const index = settings.channelConfigs.findIndex((c) => c.id === request.editingChannelId);
    if (index === -1) throw new Error('待更新渠道不存在');
    const current = settings.channelConfigs[index];
    const updated: ChannelConfig = {
      ...current,
      ...request.payload,
      id: current.id,
      updatedAt: now,
    };
    settings.channelConfigs[index] = updated;
    return updated;
  }

  const created: ChannelConfig = {
    ...request.payload,
    id: `channel_${now}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: now,
    updatedAt: now,
  };
  settings.channelConfigs.push(created);
  return created;
}

function removeChannel(settings: AppSettings, channelId: string): void {
  settings.channelConfigs = settings.channelConfigs.filter((c) => c.id !== channelId);
  if (settings.mediaDefaults?.llm?.channelId === channelId) {
    delete settings.mediaDefaults.llm;
  }
}

function applyDefault(settings: AppSettings, channelId: string, modelId: string): void {
  settings.mediaDefaults = {
    ...(settings.mediaDefaults || {}),
    llm: { channelId, modelId },
  };
}

function extractMigratedSettings(settings: AppSettings): { settings: AppSettings; profiles: Array<{ profileId: string; apiKey: string }> } {
  const next = cloneSettings(settings);
  const profiles: Array<{ profileId: string; apiKey: string }> = [];
  next.channelConfigs = next.channelConfigs.map((channel) => {
    if (channel.category !== 'llm') return channel;
    const providerConfig = { ...(channel.providerConfig || {}) } as Record<string, unknown>;
    const apiKey = typeof providerConfig.apiKey === 'string' ? providerConfig.apiKey.trim() : '';
    if (!apiKey) return channel;
    delete providerConfig.apiKey;
    providerConfig.hasApiKey = true;
    profiles.push({ profileId: channel.id, apiKey });
    return { ...channel, providerConfig };
  });
  return { settings: next, profiles };
}

export class LLMChannelConfigTransactionService {
  async saveChannelConfig(request: SaveLLMChannelConfigRequest): Promise<{ success: boolean; channel?: ChannelConfig; error?: { message: string } }> {
    try {
      const settings = await loadSettingsAt(request.rootPath);
      const previousProfile = request.editingChannelId ? llmProfileStore.getProfile(request.editingChannelId) : null;
      const nextSettings = cloneSettings(settings);
      const saved = upsertChannel(nextSettings, request);
      if (request.shouldUpdateDefault) {
        applyDefault(nextSettings, saved.id, request.payload.defaultModelId || saved.defaultModelId || saved.models[0]?.id || '');
      }

      try {
        if (request.profileApiKey) {
          llmProfileStore.saveProfile({ profileId: saved.id, apiKey: request.profileApiKey });
        }
        await saveSettingsAt(request.rootPath, nextSettings);
      } catch (error) {
        if (previousProfile) {
          llmProfileStore.saveProfile(previousProfile);
        } else {
          llmProfileStore.deleteProfile(saved.id);
        }
        throw error;
      }

      return { success: true, channel: saved };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: { message } };
    }
  }

  async deleteChannelConfig(request: DeleteLLMChannelConfigRequest): Promise<{ success: boolean; error?: { message: string } }> {
    try {
      const settings = await loadSettingsAt(request.rootPath);
      const previousProfile = llmProfileStore.getProfile(request.channelId);
      const nextSettings = cloneSettings(settings);
      removeChannel(nextSettings, request.channelId);

      try {
        if (previousProfile) {
          llmProfileStore.deleteProfile(request.channelId);
        }
        await saveSettingsAt(request.rootPath, nextSettings);
      } catch (error) {
        if (previousProfile) {
          llmProfileStore.saveProfile(previousProfile);
        }
        throw error;
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: { message } };
    }
  }

  async migrateSettingsSecrets(request: MigrateLLMSecretsRequest): Promise<{ settings: AppSettings; migrated: boolean }> {
    const { settings, profiles } = extractMigratedSettings(request.settings);
    if (!profiles.length) {
      return { settings: request.settings, migrated: false };
    }

    const previousProfiles = new Map<string, { profileId: string; apiKey: string; updatedAt: number } | null>();
    for (const profile of profiles) {
      previousProfiles.set(profile.profileId, llmProfileStore.getProfile(profile.profileId));
    }

    try {
      for (const profile of profiles) {
        llmProfileStore.saveProfile(profile);
      }
      await saveSettingsAt(request.rootPath, settings);
      return { settings, migrated: true };
    } catch (error) {
      for (const profile of profiles) {
        const previous = previousProfiles.get(profile.profileId);
        if (previous) {
          llmProfileStore.saveProfile(previous);
        } else {
          llmProfileStore.deleteProfile(profile.profileId);
        }
      }
      throw error;
    }
  }
}

export const llmChannelConfigTransactionService = new LLMChannelConfigTransactionService();
