import { safeFetch } from '../utils/safeFetch';
import { electronService } from './electronService';
import * as channelConfigService from './channelConfigService';
import type { ModelCapability } from '../providers/channel/types';
import {
  KOMAAPI_ACTIVATION_CHANNEL_IDS,
  isKomaActivationManagedChannel,
  withKomaActivationChannelMarker,
} from '../utils/activationManagedChannels';

export interface ActivationInfo {
  activatedAt: number;
  lastValidatedAt: number;
  maskedKey: string;
  defaultChannelIds: {
    llm: string;
    tti: string;
    itv: string;
  };
}

const STORAGE_KEY = 'koma-activation';

async function deleteActivationManagedChannels(): Promise<void> {
  if (!electronService.isElectron()) return;

  for (const id of Object.values(KOMAAPI_ACTIVATION_CHANNEL_IDS)) {
    try {
      const channel = await channelConfigService.getChannel(id);
      if (!isKomaActivationManagedChannel(channel)) continue;
      await channelConfigService.deleteChannel(id);
    } catch {
      console.error('Failed to delete activation managed channel');
    }
  }
}

export interface TokenUsageInfo {
  name?: string;
  totalGranted?: number;
  totalUsed?: number;
  totalAvailable?: number;
  unlimitedQuota?: boolean;
  expiresAt?: number;
  quotaPerUnit?: number;
}

export const DEFAULT_QUOTA_PER_UNIT = 500000;
export const KOMAAPI_ACTIVATION_CHANNEL_ID = KOMAAPI_ACTIVATION_CHANNEL_IDS.llm;

export const activationService = {
  /**
   * 格式化 USD 额度
   */
  formatUsdQuota(rawQuota?: number, quotaPerUnit: number = DEFAULT_QUOTA_PER_UNIT): string {
    if (rawQuota === undefined || rawQuota === null) return '$0.00';
    const usd = rawQuota / quotaPerUnit;
    return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  /**
   * 获取本地保存的激活信息
   */
  async getActivationInfo(): Promise<ActivationInfo | null> {
    try {
      let data: any = null;
      if (electronService.isElectron()) {
        const res = await electronService.ipc.invoke('app-kv:get', { key: STORAGE_KEY });
        if (res && res.ok && res.data) {
          data = res.data.value;
        }
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          data = JSON.parse(stored);
        }
      }

      if (!data) return null;

      // 1. 如果已经是新格式 (包含 maskedKey 和 defaultChannelIds.llm)，直接返回
      if (data.maskedKey && data.defaultChannelIds?.llm) {
        return data as ActivationInfo;
      }

      // 2. 如果是包含 apiKey 的旧格式，先补齐默认渠道，再进行脱敏迁移
      if (typeof data.apiKey === 'string') {
        const trimmedKey = data.apiKey.trim();
        if (!trimmedKey) {
          return null;
        }

        let defaultChannelIds: ActivationInfo['defaultChannelIds'] = {
          llm: KOMAAPI_ACTIVATION_CHANNEL_ID,
          tti: KOMAAPI_ACTIVATION_CHANNEL_IDS.tti,
          itv: KOMAAPI_ACTIVATION_CHANNEL_IDS.itv
        };

        if (electronService.isElectron()) {
          const channelResult = await activationService.ensureDefaultModelChannels(trimmedKey);
          if (!channelResult.success) {
            // 保持旧记录不覆盖，避免写入缺少加密渠道 key 的脱敏激活态
            return null;
          }
          defaultChannelIds = channelResult.channelIds ?? defaultChannelIds;
        }

        const now = Date.now();
        const activatedAt = data.activatedAt || now;
        const sanitized: ActivationInfo = {
          activatedAt,
          lastValidatedAt: data.lastValidatedAt || activatedAt,
          maskedKey: activationService.maskApiKey(trimmedKey),
          defaultChannelIds
        };
        // 将脱敏后的信息存回，从而移除存储中的 full apiKey
        await activationService.saveActivationInfo(sanitized);
        return sanitized;
      }

      // 格式不匹配
      return null;
    } catch (err) {
      // 不记录 err 对象或 apiKey
      console.error('Failed to get activation info');
      return null;
    }
  },

  /**
   * 保存激活信息
   */
  async saveActivationInfo(info: ActivationInfo): Promise<void> {
    try {
      if (electronService.isElectron()) {
        const res = await electronService.ipc.invoke('app-kv:set', { key: STORAGE_KEY, value: info });
        if (res && !res.ok) {
          throw new Error(res.error || 'Unknown error');
        }
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
      }
    } catch (err) {
      console.error('Failed to save activation info');
    }
  },

  /**
   * 清除激活信息
   */
  async clearActivationInfo(): Promise<void> {
    if (electronService.isElectron()) {
      try {
        await deleteActivationManagedChannels();
      } catch {
        console.error('Failed to delete activation managed channels');
      }

      try {
        const res = await electronService.ipc.invoke('app-kv:delete', { key: STORAGE_KEY });
        if (res && !res.ok) {
          throw new Error(res.error || 'Unknown error');
        }
      } catch {
        console.error('Failed to clear activation info');
      }
      return;
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      console.error('Failed to clear activation info');
    }
  },

  /**
   * 验证 API Key (用于新输入 Key 激活时)
   */
  async verifyApiKey(apiKey: string): Promise<{ success: boolean; status?: number; error?: string }> {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      return { success: false, error: 'empty_key' };
    }

    try {
      const response = await safeFetch('https://komaapi.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${trimmedKey}`,
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        return { success: true, status: response.status };
      }

      // 401/403 表示无效 key
      if (response.status === 401 || response.status === 403) {
        return { success: false, status: response.status, error: 'invalid_key' };
      }

      // 其它错误不视为无效，但验证不通过
      return { success: false, status: response.status, error: 'verify_failed' };
    } catch (err) {
      console.error('Network error during API key verification');
      return { success: false, error: 'network_error' };
    }
  },

  /**
   * 验证已保存的激活信息 (使用加密渠道 Key)
   */
  async verifyStoredActivation(channelId: string): Promise<{ success: boolean; status?: number; error?: string }> {
    if (channelId !== KOMAAPI_ACTIVATION_CHANNEL_ID) {
      return { success: false, error: 'invalid_channel' };
    }

    try {
      const response = await safeFetch('https://komaapi.com/v1/models', {
        method: 'GET',
        headers: {
          'x-koma-channel-id': channelId,
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        return { success: true, status: response.status };
      }

      if (response.status === 401 || response.status === 403) {
        return { success: false, status: response.status, error: 'invalid_key' };
      }

      return { success: false, status: response.status, error: 'verify_failed' };
    } catch (err) {
      console.error('Network error during stored activation verification');
      return { success: false, error: 'network_error' };
    }
  },

  /**
   * 获取 API Key 额度信息 (用于新输入 Key 激活时)
   */
  async getTokenUsage(apiKey: string): Promise<{ success: boolean; data?: TokenUsageInfo; status?: number; error?: 'invalid_key' | 'network_error' | 'usage_failed' | 'empty_key' }> {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      return { success: false, error: 'empty_key' };
    }

    try {
      const response = await safeFetch('https://komaapi.com/api/usage/token', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${trimmedKey}`,
          'Accept': 'application/json',
        },
      });

      if (response.status === 401 || response.status === 403) {
        return { success: false, status: response.status, error: 'invalid_key' };
      }

      if (!response.ok) {
        return { success: false, status: response.status, error: 'usage_failed' };
      }

      const resData = await response.json();
      const isSuccess = resData.code === true || resData.success === true;

      if (isSuccess && resData.data) {
        const d = resData.data;
        return {
          success: true,
          data: {
            name: d.name,
            totalGranted: d.total_granted,
            totalUsed: d.total_used,
            totalAvailable: d.total_available,
            unlimitedQuota: d.unlimited_quota,
            expiresAt: d.expires_at,
            quotaPerUnit: DEFAULT_QUOTA_PER_UNIT,
          }
        };
      }

      return { success: false, error: 'usage_failed' };
    } catch (err) {
      console.error('Network error during token usage check');
      return { success: false, error: 'network_error' };
    }
  },

  /**
   * 获取已保存的 API Key 额度信息 (使用加密渠道 Key)
   */
  async getStoredTokenUsage(channelId: string): Promise<{ success: boolean; data?: TokenUsageInfo; status?: number; error?: string }> {
    if (channelId !== KOMAAPI_ACTIVATION_CHANNEL_ID) {
      return { success: false, error: 'invalid_channel' };
    }

    try {
      const response = await safeFetch('https://komaapi.com/api/usage/token', {
        method: 'GET',
        headers: {
          'x-koma-channel-id': channelId,
          'Accept': 'application/json',
        },
      });

      if (response.status === 401 || response.status === 403) {
        return { success: false, status: response.status, error: 'invalid_key' };
      }

      if (!response.ok) {
        return { success: false, status: response.status, error: 'usage_failed' };
      }

      const resData = await response.json();
      const isSuccess = resData.code === true || resData.success === true;

      if (isSuccess && resData.data) {
        const d = resData.data;
        return {
          success: true,
          data: {
            name: d.name,
            totalGranted: d.total_granted,
            totalUsed: d.total_used,
            totalAvailable: d.total_available,
            unlimitedQuota: d.unlimited_quota,
            expiresAt: d.expires_at,
            quotaPerUnit: DEFAULT_QUOTA_PER_UNIT,
          }
        };
      }
      return { success: false, error: 'usage_failed' };
    } catch (err) {
      console.error('Network error during stored token usage check');
      return { success: false, error: 'network_error' };
    }
  },

  /**
   * 脱敏 API Key
   */
  maskApiKey(key: string): string {
    if (key.length <= 10) return '***';
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  },

  /**
   * 确保默认模型渠道存在（激活成功后调用）
   */
  async ensureDefaultModelChannels(apiKey: string): Promise<{ success: boolean; channelIds?: { llm: string; tti: string; itv: string }; error?: string }> {
    if (!electronService.isElectron()) {
      return {
        success: true,
        channelIds: {
          llm: KOMAAPI_ACTIVATION_CHANNEL_ID,
          tti: KOMAAPI_ACTIVATION_CHANNEL_IDS.tti,
          itv: KOMAAPI_ACTIVATION_CHANNEL_IDS.itv
        }
      };
    }

    const configs = [
      {
        id: KOMAAPI_ACTIVATION_CHANNEL_ID,
        category: 'llm' as const,
        providerType: 'openai',
        name: 'Koma官方',
        providerConfig: withKomaActivationChannelMarker({ baseUrl: 'https://komaapi.com/v1', apiKey }),
        defaultModelId: 'glm-5',
        models: [
          {
            id: 'glm-5',
            label: 'glm-5',
            providerModelName: 'glm-5',
            capabilities: ['llm.chat' as ModelCapability],
          },
        ],
        enabled: true,
        source: 'builtin' as const,
      },
      {
        id: KOMAAPI_ACTIVATION_CHANNEL_IDS.tti,
        category: 'tti' as const,
        providerType: 'grok2api-imagine-tti',
        name: 'Koma官方',
        providerConfig: withKomaActivationChannelMarker({
          baseUrl: 'https://komaapi.com',
          apiKey,
          promptProtocol: 'grok-image-index',
          defaultSize: '720x1280',
          defaultSteps: 20,
        }),
        defaultModelId: 'grok-image-all',
        models: [
          {
            id: 'grok-image-all',
            label: 'grok-image-all',
            providerModelName: 'grok-image-all',
            capabilities: [
              'image.text-to-image' as ModelCapability,
              'image.image-to-image' as ModelCapability,
            ],
          },
        ],
        enabled: true,
        source: 'builtin' as const,
      },
      {
        id: KOMAAPI_ACTIVATION_CHANNEL_IDS.itv,
        category: 'itv' as const,
        providerType: 'grok2api-imagine-itv',
        name: 'Koma官方',
        providerConfig: withKomaActivationChannelMarker({
          baseUrl: 'https://komaapi.com',
          apiKey,
          promptProtocol: 'grok-image-index',
          defaultDuration: 10,
          defaultResolution: '720p',
        }),
        defaultModelId: 'grok-imagine-video',
        models: [
          {
            id: 'grok-imagine-video',
            label: 'grok-imagine-video',
            providerModelName: 'grok-imagine-video',
            capabilities: [
              'video.text-to-video' as ModelCapability,
              'video.image-to-video' as ModelCapability,
              'video.reference-to-video' as ModelCapability,
            ],
          },
        ],
        enabled: true,
        source: 'builtin' as const,
      },
    ];

    try {
      for (const cfg of configs) {
        const existing = await channelConfigService.getChannel(cfg.id);
        if (existing) {
          await channelConfigService.updateChannel(cfg.id, {
            ...cfg,
            // providerConfig 包含 apiKey，updateChannel 会处理加密
          });
        } else {
          await channelConfigService.createChannel(cfg);
        }

        // 设置为该类型的默认
        await channelConfigService.setMediaDefault(cfg.category, {
          channelId: cfg.id,
          modelId: cfg.defaultModelId,
        });
      }
      return {
        success: true,
        channelIds: {
          llm: KOMAAPI_ACTIVATION_CHANNEL_IDS.llm,
          tti: KOMAAPI_ACTIVATION_CHANNEL_IDS.tti,
          itv: KOMAAPI_ACTIVATION_CHANNEL_IDS.itv
        }
      };
    } catch (err) {
      console.error('Failed to ensure default model channels');
      return { success: false, error: 'default_channels_failed' };
    }
  },
};
