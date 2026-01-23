/**
 * ITV Provider 类型定义
 */
import type {
  ITVConfig,
  ITVOptions,
  VideoResult,
  ProgressInfo,
  ITVProviderType,
} from '../../types';

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

export interface ITVProvider {
  type: ITVProviderType;
  config: ITVConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;
  generate(
    imagePath: string,
    prompt: string,
    options?: ITVOptions
  ): Promise<VideoResult | string>; // 返回结果或 taskId
  checkProgress?(taskId: string): Promise<ProgressInfo>;
  cancelTask?(taskId: string): Promise<void>;
  // 角色提取（Sora2 专有功能）- 支持新旧两种签名
  extractCharacter?(params: CharacterExtractionParams | string, timestamps?: string): Promise<string>;
  // 角色提取状态查询
  checkCharacterProgress?(taskId: string): Promise<CharacterProgressInfo>;
  // 道具提取（Sora2 专有功能）
  extractProp?(taskId: string, timestamps?: string): Promise<string>;
  // 视频混音（Sora2 专有功能）
  remixVideo?(videoId: string, options: RemixOptions): Promise<string>;
}

export { ITVConfig, ITVOptions, VideoResult, ProgressInfo };
