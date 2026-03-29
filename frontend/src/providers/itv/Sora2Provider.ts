/**
 * Sora2 ITV Provider
 * toapis.com 官方图生视频服务
 * 支持：视频生成、角色提取、角色提取状态查询、视频混音
 */
import type {
  ITVConfig,
  ITVOptions,
  ProgressInfo,
} from '../../types';
import type { ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import {
  assertSupportedVideoCapabilities,
  requirePrimaryImage,
  type ITVProvider,
  type ITVRequest,
  type ITVResult,
} from './types';
import { safeFetch } from '../../utils/safeFetch';

// API 响应类型
interface Sora2CreateResponse {
  id: string;
  object: string;
  model: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  created_at: number;
  metadata?: Record<string, any>;
}

interface Sora2TaskResponse {
  id: string;
  object: string;
  model: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  created_at: number;
  completed_at?: number;
  expires_at?: number;
  result?: {
    type: string;
    data: Array<{
      url: string;
      thumbnail_url?: string;
    }>;
  };
  error?: {
    code: string;
    message: string;
  };
}

// 角色提取任务响应
interface CharacterTaskResponse {
  id: string;
  object: string;
  model: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  created_at: number;
  completed_at?: number;
  expires_at?: number;
  result?: {
    type: 'character';
    data: {
      characters: Array<{
        id: string;
        username: string;
        display_name?: string;
        avatar_url?: string;
      }>;
    };
  };
  error?: {
    code: string;
    message: string;
  };
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

// Sora2 视频生成扩展选项
export interface Sora2Options extends ITVOptions {
  model?: string;
  // 角色引用
  characterUrl?: string;
  characterTimestamps?: string;
  characterCreate?: boolean;
  characterFromTask?: string;
  // 风格控制
  style?: 'thanksgiving' | 'comic' | 'news' | 'selfie' | 'nostalgic' | 'anime';
  // 故事板
  storyboard?: boolean;
  // 高清模式
  hd?: boolean;
  // 水印
  watermark?: boolean;
  // 隐私模式
  private?: boolean;
  // 生成数量
  n?: number;
  // 缩略图
  thumbnail?: boolean;
}

// 混音选项
export interface RemixOptions {
  model?: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
}

export class Sora2Provider implements ITVProvider {
  type = 'sora2' as const;
  config: ITVConfig;

  constructor(config: ITVConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://toapis.com';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
    };
  }

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) {
      throw new Error('模型名称未配置');
    }
    return value;
  }

  validate(): boolean {
    return Boolean(this.config.apiKey && String(this.config.modelName || '').trim());
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const modelName = this.getModelName();
      // 使用简单的请求测试连接
      const response = await safeFetch(`${this.getBaseUrl()}/v1/videos/generations`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: modelName,
          prompt: 'test',
          duration: 5,
        }),
      });
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.config.apiKey) {
      throw new Error('API Key 未配置');
    }
    assertSupportedVideoCapabilities(request, 'Sora2', ['video.image-to-video']);

    const { prompt } = request;
    const options = request.options as Sora2Options | undefined;
    const resolvedModel = this.getModelName();

    const body: Record<string, any> = {
      model: resolvedModel,
      prompt,
      aspect_ratio: options?.aspectRatio || '16:9',
      duration: options?.duration || 10,
    };

    // 图生视频
    const primaryImage = requirePrimaryImage(request, 'Sora2');
    const imageUrls = [
      primaryImage.value,
      ...((request.additionalReferences || []).map(r => r.value).filter(Boolean)),
    ];
    if (imageUrls.length > 0) {
      body.image_urls = imageUrls;
    }

    // 元数据
    const metadata: Record<string, any> = {};

    // 角色引用
    if (options?.characterUrl) {
      metadata.character_url = options.characterUrl;
    }
    if (options?.characterTimestamps) {
      metadata.character_timestamps = options.characterTimestamps;
    }
    if (options?.characterCreate) {
      metadata.character_create = true;
    }
    if (options?.characterFromTask) {
      metadata.character_from_task = options.characterFromTask;
    }

    // 风格控制
    if (options?.style) {
      metadata.style = options.style;
    }

    // 故事板
    if (options?.storyboard) {
      metadata.storyboard = true;
    }

    // 高清模式（仅 sora-2-pro 且时长非 25s）
    if (options?.hd && resolvedModel === 'sora-2-pro') {
      metadata.hd = true;
    }

    // 水印
    if (options?.watermark !== undefined) {
      metadata.watermark = options.watermark;
    }

    // 隐私模式
    if (options?.private !== undefined) {
      metadata.private = options.private;
    }

    // 生成数量
    if (options?.n) {
      metadata.n = options.n;
    }

    // 缩略图
    if (options?.thumbnail) {
      body.thumbnail = true;
    }

    if (Object.keys(metadata).length > 0) {
      body.metadata = metadata;
    }

    const response = await safeFetch(`${this.getBaseUrl()}/v1/videos/generations`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`创建任务失败: ${errorText}`);
    }

    const data: Sora2CreateResponse = await response.json();
    const taskId = data.id;

    return { mode: 'async', taskId };
  }

  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    const response = await safeFetch(`${this.getBaseUrl()}/v1/videos/generations/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey || ''}`,
      },
    });

    if (!response.ok) {
      return {
        state: 'failed',
        progress: 0,
        error: '查询失败',
      };
    }

    const data: Sora2TaskResponse = await response.json();

    const stateMap: Record<string, ProviderTaskSnapshot<ITVResult>['state']> = {
      queued: 'queued',
      in_progress: 'running',
      completed: 'succeeded',
      failed: 'failed',
    };

    const snapshot: ProviderTaskSnapshot<ITVResult> = {
      state: stateMap[data.status] || 'running',
      progress: data.progress || 0,
    };

    if (data.status === 'completed' && data.result?.data?.[0]?.url) {
      snapshot.output = { source: data.result.data[0].url, taskId };
    }

    if (data.status === 'failed' && data.error) {
      snapshot.error = data.error.message || '任务失败';
    }

    return snapshot;
  }

  async cancelTask(_taskId: string): Promise<void> {
    // 暂不支持取消任务
  }

  /**
   * 角色提取 API
   * 从视频中提取角色，返回任务 ID 用于轮询
   * @param params.url 视频 URL（与 fromTask 二选一）
   * @param params.fromTask 视频生成任务 ID（与 url 二选一）
   * @param params.timestamps 时间戳范围，格式 "开始秒,结束秒"（如 "1,3"）
   * @param params.model 模型版本
   * @returns 角色提取任务 ID
   */
  async extractCharacter(params: {
    url?: string;
    fromTask?: string;
    timestamps: string;
    model?: string;
  }): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('API Key 未配置');
    }

    if (!params.url && !params.fromTask) {
      throw new Error('必须提供 url 或 fromTask 参数');
    }

    const modelName = this.getModelName();
    const body: Record<string, any> = {
      model: params.model || modelName,
      timestamps: params.timestamps,
    };

    if (params.url) {
      body.url = params.url;
    } else if (params.fromTask) {
      body.from_task = params.fromTask;
    }

    const response = await safeFetch(`${this.getBaseUrl()}/v1/videos/generations`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`角色提取失败: ${errorText}`);
    }

    const data = await response.json();
    return data.id;
  }

  /**
   * 查询角色提取任务状态
   * @param taskId 角色提取任务 ID
   * @returns 角色提取进度信息，完成时包含角色列表
   */
  async checkCharacterProgress(taskId: string): Promise<CharacterProgressInfo> {
    const response = await safeFetch(`${this.getBaseUrl()}/v1/characters_tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey || ''}`,
      },
    });

    if (!response.ok) {
      return {
        taskId,
        status: 'failed',
        progress: 0,
        error: '查询失败',
      };
    }

    const data: CharacterTaskResponse = await response.json();

    const stateMap: Record<string, ProgressInfo['status']> = {
      'queued': 'queued',
      'in_progress': 'processing',
      'completed': 'completed',
      'failed': 'failed',
    };

    const result: CharacterProgressInfo = {
      taskId,
      status: stateMap[data.status] || 'processing',
      progress: data.progress || 0,
    };

    if (data.status === 'completed' && data.result?.data?.characters) {
      result.characters = data.result.data.characters.map(c => ({
        id: c.id,
        username: c.username,
        displayName: c.display_name,
        avatarUrl: c.avatar_url,
      }));
    }

    if (data.status === 'failed' && data.error) {
      result.error = data.error.message || '角色提取失败';
    }

    return result;
  }

  /**
   * 视频混音 API
   * 对已生成的视频进行二次编辑
   * @param videoId 原始视频任务 ID
   * @param options 混音选项
   * @returns 混音任务 ID
   */
  async remixVideo(videoId: string, options: RemixOptions): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('API Key 未配置');
    }

    const modelName = this.getModelName();
    const body: Record<string, any> = {
      model: options.model || modelName,
      prompt: options.prompt,
    };

    if (options.duration) {
      body.duration = options.duration;
    }

    if (options.aspectRatio) {
      body.aspect_ratio = options.aspectRatio;
    }

    const response = await safeFetch(`${this.getBaseUrl()}/v1/videos/${videoId}/remix`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`视频混音失败: ${errorText}`);
    }

    const data: Sora2CreateResponse = await response.json();
    return data.id;
  }

  /**
   * 道具提取 API
   * 从视频生成任务中提取道具
   * @param taskId 视频生成任务的 ID
   * @param timestamps 可选，指定提取时间段
   * @returns 道具 ID
   */
  async extractProp(taskId: string, timestamps?: string): Promise<string> {
    if (!this.validate()) {
      throw new Error('API Key 未配置');
    }

    const body: Record<string, string> = {
      from_task: taskId,
    };
    if (timestamps) {
      body.timestamps = timestamps;
    }

    const response = await safeFetch(`${this.getBaseUrl()}/v1/props`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`道具提取失败: ${errorText}`);
    }

    const data = await response.json();
    return data.id || data.prop_id || data.data?.id;
  }
}
