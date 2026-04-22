/**
 * LLM 渠道配置事务服务（SQLite 版本）
 *
 * 原版本读写 `{storageRoot}/settings.json` + `{userData}/llm-profiles.json`。
 * 本版本全部走 `ConfigService.channel`：
 *   - apiKey 作为 channel_configs.api_key 字段级加密存储（替代 llmProfileStore）
 *   - `shouldUpdateDefault` 通过 `setDefault('llm', channelId)` + kv_configs 指针完成
 *   - IPC 签名保持兼容（`rootPath` 参数仍接收，但忽略——入口已由 BaseDB 决定）
 */
import { ensureServicesReady, services } from '../index';
import {
  type ChannelConfig,
  channelConfigToRow,
  rowToChannelConfig,
} from './channelConfigMapper';

export interface SaveLLMChannelConfigRequest {
  rootPath?: string;
  editingChannelId?: string;
  payload: Omit<ChannelConfig, 'id' | 'createdAt' | 'updatedAt'>;
  profileApiKey?: string;
  shouldUpdateDefault: boolean;
}

export interface DeleteLLMChannelConfigRequest {
  rootPath?: string;
  channelId: string;
}

export class LLMChannelConfigTransactionService {
  async saveChannelConfig(
    request: SaveLLMChannelConfigRequest,
  ): Promise<{ success: boolean; channel?: ChannelConfig; error?: { message: string } }> {
    try {
      await ensureServicesReady();
      const now = Date.now();
      const id = request.editingChannelId || `channel_${now}_${Math.random().toString(36).slice(2, 9)}`;

      // 合并 apiKey：优先使用 profileApiKey（旧路径），回落到 payload.providerConfig.apiKey
      const providerConfig = { ...(request.payload.providerConfig || {}) } as Record<string, unknown>;
      if (request.profileApiKey && request.profileApiKey.trim()) {
        providerConfig.apiKey = request.profileApiKey.trim();
      }

      const existing = request.editingChannelId
        ? services.config.channel.getById(request.editingChannelId)
        : undefined;

      if (request.editingChannelId && !existing) {
        return { success: false, error: { message: '待更新渠道不存在' } };
      }

      // 若未提供新 apiKey，保留旧的
      if (!providerConfig.apiKey && existing?.api_key) {
        providerConfig.apiKey = existing.api_key;
      }

      const channel: ChannelConfig = {
        ...request.payload,
        id,
        providerConfig,
        createdAt: existing?.created_at ?? now,
        updatedAt: now,
      };

      const row = channelConfigToRow(channel);

      services.config.writeTx(
        { domain: 'channel', action: 'upsert', id, meta: { kind: channel.category } },
        () => {
          services.config.channel.upsert(row);
          if (request.shouldUpdateDefault) {
            services.config.channel.setDefault(channel.category, id);
            // 冗余指针：某些前端路径通过 kv_configs 读默认渠道
            services.config.kv.set('channel', `default.${channel.category}`, {
              channelId: id,
              modelId: request.payload.defaultModelId || channel.models[0]?.id || '',
            });
          }
        },
      );

      const saved = services.config.channel.getById(id);
      return { success: true, channel: saved ? rowToChannelConfig(saved) : channel };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: { message } };
    }
  }

  async deleteChannelConfig(
    request: DeleteLLMChannelConfigRequest,
  ): Promise<{ success: boolean; error?: { message: string } }> {
    try {
      await ensureServicesReady();
      const existing = services.config.channel.getById(request.channelId);
      if (!existing) return { success: true };

      services.config.writeTx(
        { domain: 'channel', action: 'delete', id: request.channelId },
        () => {
          services.config.channel.delete(request.channelId);
          const pointer = services.config.kv.get<{ channelId: string }>('channel', `default.${existing.kind}`);
          if (pointer && pointer.channelId === request.channelId) {
            services.config.kv.delete('channel', `default.${existing.kind}`);
          }
        },
      );

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: { message } };
    }
  }
}

export const llmChannelConfigTransactionService = new LLMChannelConfigTransactionService();
