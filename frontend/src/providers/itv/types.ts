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
  // 角色提取（Sora2 专有功能）
  extractCharacter?(taskId: string, timestamps?: string): Promise<string>;
}

export { ITVConfig, ITVOptions, VideoResult, ProgressInfo };
