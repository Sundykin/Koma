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
}

export { ITVConfig, ITVOptions, VideoResult, ProgressInfo };
