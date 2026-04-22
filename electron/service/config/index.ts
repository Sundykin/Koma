/**
 * 应用配置服务
 *
 * 聚合 8 个配置域 Repository，提供：
 *   - `bootstrap()` —— 一次性返回全部配置快照（前端启动时调用）
 *   - `onChange` 广播 —— 写路径完成后经由 BrowserWindow 广播到所有渲染进程
 *
 * ConfigService 假设 `baseDB.init()` 已由 ProjectService 完成；在 `initServices`
 * 的调用顺序上必须位于 project 之后（见 service/index.ts）。
 */
import { BrowserWindow } from 'electron';
import { logger } from 'ee-core/log';
import {
  baseDB,
  SqliteChannelConfigRepository,
  SqlitePromptTemplateRepository,
  SqliteVisualStylePresetRepository,
  SqlitePluginRegistryRepository,
  SqliteMCPServerRepository,
  SqliteAgentProfileRepository,
  SqliteRecentProjectRepository,
  SqliteKvConfigRepository,
} from '../storage';
import type {
  IChannelConfigRepository,
  IPromptTemplateRepository,
  IVisualStylePresetRepository,
  IPluginRegistryRepository,
  IMCPServerRepository,
  IAgentProfileRepository,
  IRecentProjectRepository,
  IKvConfigRepository,
  ChannelConfigRow,
  PromptTemplateRow,
  VisualStylePresetRow,
  PluginRegistryRow,
  MCPServerRow,
  AgentProfileRow,
  RecentProjectRow,
  ChannelKind,
} from '../storage';

export const CONFIG_CHANGED_CHANNEL = 'config:changed';

export type ConfigDomain =
  | 'channel'
  | 'prompt'
  | 'style'
  | 'plugin'
  | 'mcp'
  | 'agent'
  | 'recent'
  | 'kv';

export type ConfigChangeAction = 'upsert' | 'delete' | 'setDefault' | 'setEnabled' | 'touch' | 'reset' | 'pin';

export interface ConfigChangePayload {
  domain: ConfigDomain;
  action: ConfigChangeAction;
  id?: string;
  meta?: Record<string, unknown>;
}

export interface ConfigBootstrap {
  channels: {
    llm: ChannelConfigRow[];
    tti: ChannelConfigRow[];
    itv: ChannelConfigRow[];
    tts: ChannelConfigRow[];
  };
  prompts: PromptTemplateRow[];
  styles: VisualStylePresetRow[];
  plugins: PluginRegistryRow[];
  mcp: MCPServerRow[];
  agents: AgentProfileRow[];
  recent: RecentProjectRow[];
  kv: Record<string, Array<{ key: string; value: unknown }>>;
}

export class ConfigService {
  private initialized = false;

  channel!: IChannelConfigRepository;
  prompt!: IPromptTemplateRepository;
  style!: IVisualStylePresetRepository;
  plugin!: IPluginRegistryRepository;
  mcp!: IMCPServerRepository;
  agent!: IAgentProfileRepository;
  recent!: IRecentProjectRepository;
  kv!: IKvConfigRepository;

  init(storageRoot?: string): void {
    if (this.initialized) return;
    const db = baseDB.getDb();
    this.channel = new SqliteChannelConfigRepository(db, (err, id) =>
      logger.warn('[config] decrypt failed for channel', { id, err: String(err) }),
    );
    this.prompt = new SqlitePromptTemplateRepository(db);
    this.style = new SqliteVisualStylePresetRepository(db);
    this.plugin = new SqlitePluginRegistryRepository(db);
    this.mcp = new SqliteMCPServerRepository(db, (err, id) =>
      logger.warn('[config] decrypt failed for mcp', { id, err: String(err) }),
    );
    this.agent = new SqliteAgentProfileRepository(db);
    this.recent = new SqliteRecentProjectRepository(db);
    this.kv = new SqliteKvConfigRepository(db);
    this.initialized = true;

    // 把后端决定的存储根目录写入 kv_configs，供前端 SettingsPage / storageConfig.ts 读回展示。
    // 仅当 namespace='storage' / key='rootPath' 不存在时写入（避免覆盖用户自定义）。
    if (storageRoot && !this.kv.get<string>('storage', 'rootPath')) {
      this.kv.set('storage', 'rootPath', storageRoot);
    }
  }

  /** 保留的 kv 命名空间（启动时 bootstrap 会包含这些 namespace 下全部 key/value） */
  private bootstrapKvNamespaces: string[] = ['storage', 'media.defaults', 'channel', 'feature'];

  bootstrap(): ConfigBootstrap {
    this.ensureInit();

    const kv: Record<string, Array<{ key: string; value: unknown }>> = {};
    for (const ns of this.bootstrapKvNamespaces) {
      kv[ns] = this.kv.listNamespace(ns);
    }

    return {
      channels: {
        llm: this.channel.list('llm'),
        tti: this.channel.list('tti'),
        itv: this.channel.list('itv'),
        tts: this.channel.list('tts'),
      },
      prompts: this.prompt.list(),
      styles: this.style.list(),
      plugins: this.plugin.list(),
      mcp: this.mcp.list(),
      agents: this.agent.list(),
      recent: this.recent.list(),
      kv,
    };
  }

  /**
   * 包装写操作：在 baseDB 事务中执行 fn，成功后广播 config:changed
   */
  writeTx<T>(payload: ConfigChangePayload, fn: () => T): T {
    this.ensureInit();
    const result = baseDB.transaction(fn);
    this.broadcastChange(payload);
    return result;
  }

  broadcastChange(payload: ConfigChangePayload): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send(CONFIG_CHANGED_CHANNEL, payload);
      } catch (err) {
        logger.warn('[config] broadcast failed', { err: String(err) });
      }
    }
  }

  /** 用于 ChannelKind 校验；非法值抛错 */
  static assertChannelKind(kind: unknown): ChannelKind {
    if (kind === 'llm' || kind === 'tti' || kind === 'itv' || kind === 'tts') return kind;
    throw new Error(`Invalid channel kind: ${String(kind)}`);
  }

  private ensureInit(): void {
    if (!this.initialized) {
      throw new Error('ConfigService not initialized. Call init() after baseDB.init() first.');
    }
  }
}

export const configService = new ConfigService();
