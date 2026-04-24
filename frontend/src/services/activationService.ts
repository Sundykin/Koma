import { safeFetch } from '../utils/safeFetch';
import { electronService } from './electronService';

export interface ActivationInfo {
  apiKey: string;
  activatedAt: number;
  lastValidatedAt: number;
}

const STORAGE_KEY = 'koma-activation';

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
      if (electronService.isElectron()) {
        const res = await electronService.ipc.invoke('app-kv:get', { key: STORAGE_KEY });
        if (res && res.ok && res.data) {
          return res.data.value || null;
        }
        return null;
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
      }
    } catch (err) {
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
    try {
      if (electronService.isElectron()) {
        const res = await electronService.ipc.invoke('app-kv:delete', { key: STORAGE_KEY });
        if (res && !res.ok) {
          throw new Error(res.error || 'Unknown error');
        }
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.error('Failed to clear activation info');
    }
  },

  /**
   * 验证 API Key
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
   * 获取 API Key 额度信息
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
      // 不打印 err 对象，保护隐私
      console.error('Network error during token usage check');
      return { success: false, error: 'network_error' };
    }
  },

  /**
   * 脱敏 API Key
   */
  maskApiKey(key: string): string {
    if (key.length <= 10) return '***';
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  }
};
