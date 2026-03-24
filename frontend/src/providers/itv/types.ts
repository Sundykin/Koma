/**
 * ITV Provider 类型定义（OpenSpec: request-based + start/snapshot lifecycle）
 */
import type {
  ITVConfig,
  ITVOptions,
  ProgressInfo,
  ITVProviderType,
} from '../../types';
import type {
  ProviderAssetInput,
  ProviderStartResult,
  ProviderTaskSnapshot,
  ITVRequest as BaseITVRequest,
} from '../../types';

export type ProviderAssetTransport = ProviderAssetInput['transport'];

// 角色提取参数
export interface CharacterExtractionParams {
  url?: string;
  fromTask?: string;
  timestamps: string;
  model?: string;
}

// 角色提取进度信息
export interface CharacterProgressInfo extends ProgressInfo {
  characters?: Array<{
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  }>;
}

// 混音选项
export interface RemixOptions {
  model?: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
}

export interface ITVResult {
  /**
   * 生成结果来源（URL 或本地路径）。
   *
   * 注意：持久化统一由 mediaPersistenceService 完成，Provider 不负责项目路径落盘。
   */
  source: string;
  taskId?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  fps?: number;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export type ITVRequest = BaseITVRequest<ProviderAssetInput, ITVOptions>;

/**
 * ITV Provider 接口
 */
export interface ITVProvider {
  type: ITVProviderType;
  config: ITVConfig;

  /**
   * Declares which asset transports are supported by this ITV provider.
   *
   * Why this exists:
   * - Some remote ITV servers only accept URL-accessible images (`remote-url`).
   * - Some accept inline base64 via `data-url` (large payloads, but can be useful as a fallback).
   *
   * The host (MediaGenerationService) uses this signal to decide whether "ensure remoteUrl"
   * should be `required` (URL-only) or `best-effort` (data-url is allowed as fallback).
   */
  assetTransports?: {
    primaryImage?: ReadonlyArray<ProviderAssetTransport>;
    additionalReferences?: ReadonlyArray<ProviderAssetTransport>;
  };

  // 验证配置
  validate(): boolean;
  testConnection(): Promise<boolean>;

  start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>>;
  getTaskSnapshot?(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>>;

  /**
   * 取消任务
   */
  cancelTask?(taskId: string): Promise<void>;

  // ========== 扩展功能（Sora2 等特定 Provider） ==========

  /**
   * 角色提取
   * 返回任务 ID（string）或进度信息（CharacterProgressInfo）
   */
  extractCharacter?(params: CharacterExtractionParams): Promise<string | CharacterProgressInfo>;

  /**
   * 角色提取状态查询
   */
  checkCharacterProgress?(taskId: string): Promise<CharacterProgressInfo>;

  /**
   * 道具提取
   */
  extractProp?(taskId: string, timestamps?: string): Promise<string>;

  /**
   * 视频混音
   * 返回任务 ID（string）或进度信息（ProgressInfo）
   */
  remixVideo?(videoId: string, options: RemixOptions): Promise<string | ProgressInfo>;
}

// Re-export：供 providers/index.ts 通过本文件统一导出
export type { ITVConfig, ITVOptions, ProgressInfo };
