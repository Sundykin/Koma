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

// 视频生成输入参数（统一接口）
export interface ITVGenerateInput {
  imageUrl?: string;
  prompt: string;
  options?: ITVOptions;
}

/**
 * ITV Provider 接口
 *
 * 统一接口规范：
 * - generateVideo(): 必需，统一返回 Promise<VideoResult>，内部处理轮询
 * - checkProgress(): 异步 Provider 必需，用于查询任务进度
 */
export interface ITVProvider {
  type: ITVProviderType;
  config: ITVConfig;

  // 验证配置
  validate(): boolean;
  testConnection(): Promise<boolean>;

  // ========== 核心方法（必需） ==========

  /**
   * 生成视频（统一接口）
   * 无论底层是同步还是异步，都返回最终结果
   * 异步 Provider 内部需自行处理轮询
   */
  generateVideo(input: ITVGenerateInput): Promise<VideoResult>;

  // ========== 进度查询（异步 Provider 必需） ==========

  /**
   * 查询进度
   */
  checkProgress?(taskId: string): Promise<ProgressInfo>;

  /**
   * 取消任务
   */
  cancelTask?(taskId: string): Promise<void>;

  /**
   * 生成视频（带进度回调，可选）
   */
  generateVideoWithProgress?(
    input: ITVGenerateInput,
    onProgress?: (progress: ProgressInfo) => void
  ): Promise<VideoResult>;

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
export type { ITVConfig, ITVOptions, VideoResult, ProgressInfo };
