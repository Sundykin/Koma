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
import type { PollingConfig } from '../registry';

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

// 视频生成输入参数（统一接口）
export interface ITVGenerateInput {
  imageUrl?: string;
  prompt: string;
  options?: ITVOptions;
}

/**
 * ITV Provider 接口
 *
 * 统一同步/异步模式：
 * - generateVideo(): 统一返回 Promise<VideoResult>，内部处理轮询
 * - 如需进度回调，使用 generateVideoWithProgress()
 * - 旧的 generate() 方法保持兼容
 */
export interface ITVProvider {
  type: ITVProviderType;
  config: ITVConfig;

  // 验证配置
  validate(): boolean;
  testConnection(): Promise<boolean>;

  // ========== 核心方法（统一 Promise 返回） ==========

  /**
   * 生成视频（统一接口，可选实现）
   * 无论底层是同步还是异步，都返回最终结果
   * 如果未实现，调用方应使用 generate() + checkProgress() + pollTask()
   */
  generateVideo?(input: ITVGenerateInput): Promise<VideoResult>;

  /**
   * 生成视频（带进度回调）
   */
  generateVideoWithProgress?(
    input: ITVGenerateInput,
    onProgress?: (progress: ProgressInfo) => void
  ): Promise<VideoResult>;

  // ========== 底层方法（兼容现有实现） ==========

  /**
   * 提交任务（现有 Provider 实现）
   * 返回 VideoResult 或 taskId（string）
   */
  generate?(
    imagePath: string,
    prompt: string,
    options?: ITVOptions
  ): Promise<VideoResult | string>;

  /**
   * 查询进度（异步 Provider 实现）
   */
  checkProgress?(taskId: string): Promise<ProgressInfo>;

  /**
   * 取消任务
   */
  cancelTask?(taskId: string): Promise<void>;

  /**
   * 轮询配置
   */
  polling?: PollingConfig;

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

export { ITVConfig, ITVOptions, VideoResult, ProgressInfo };
