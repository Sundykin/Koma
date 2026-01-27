/**
 * ITV Provider 类型定义
 */

// 进度信息
export interface ProgressInfo {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  resultUrl?: string;
  error?: string;
}

// 视频结果
export interface VideoResult {
  url: string;
  taskId?: string;
  duration?: number;
  width?: number;
  height?: number;
}

// ITV 选项
export interface ITVOptions {
  duration?: number;
  aspectRatio?: string;
  model?: string;
  seed?: number;
}

// 视频生成输入参数
export interface ITVGenerateInput {
  imageUrl?: string;
  prompt: string;
  options?: ITVOptions;
}

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

/**
 * ITV Provider 接口
 */
export interface ITVProvider {
  type: string;
  config: Record<string, any>;

  validate(): boolean;
  testConnection(): Promise<boolean>;

  /**
   * 生成视频（统一接口）
   */
  generateVideo(input: ITVGenerateInput): Promise<VideoResult>;

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

  // ========== 扩展功能 ==========

  /**
   * 角色提取
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
   */
  remixVideo?(videoId: string, options: RemixOptions): Promise<string | ProgressInfo>;
}
