/**
 * Sora2 ITV Provider
 * 官方图生视频服务
 */
import type {
  ITVConfig,
  ITVOptions,
  VideoResult,
  ProgressInfo,
} from '../../types';
import type { ITVProvider } from './types';

// API 响应类型
interface Sora2CreateResponse {
  id: string;
  order_id: number;
  price: number;
}

interface Sora2TaskResponse {
  id: string;
  state: 'running' | 'succeeded' | 'failed';
  data: any;
  progress: number;
  create_time: number;
  update_time: number;
  message: string;
  action: string;
}

interface BalanceResponse {
  code: number;
  msg: string;
  data?: {
    balance: number;
  };
}

export class Sora2Provider implements ITVProvider {
  type = 'sora2' as const;
  config: ITVConfig;

  constructor(config: ITVConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'http://ai.hsxbk.top';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': this.config.apiKey || '',
      'Content-Type': 'application/json',
    };
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const response = await fetch(`${this.getBaseUrl()}/api/user/balance`, {
        method: 'GET',
        headers: { 'Authorization': this.config.apiKey || '' },
      });
      const data: BalanceResponse = await response.json();
      return data.code === 200;
    } catch {
      return false;
    }
  }

  /**
   * 创建视频生成任务
   * @returns taskId 用于轮询结果
   */
  async generate(
    imagePath: string,
    prompt: string,
    options?: ITVOptions
  ): Promise<string> {
    if (!this.validate()) {
      throw new Error('API Key 未配置');
    }

    const body = {
      model: 'sora-2',
      prompt,
      aspect_ratio: options?.aspectRatio || '16:9',
      duration: options?.duration || 5,
      image_urls: [imagePath],
    };

    const response = await fetch(`${this.getBaseUrl()}/v1/videos/generations`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`创建任务失败: ${errorText}`);
    }

    const data: Sora2CreateResponse = await response.json();
    return data.id;
  }

  /**
   * 轮询任务状态
   */
  async checkProgress(taskId: string): Promise<ProgressInfo> {
    const response = await fetch(`${this.getBaseUrl()}/v1/videos/tasks/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': this.config.apiKey || '' },
    });

    if (!response.ok) {
      return {
        taskId,
        status: 'failed',
        progress: 0,
        error: '查询失败',
      };
    }

    const data: Sora2TaskResponse = await response.json();

    const stateMap: Record<string, ProgressInfo['status']> = {
      'running': 'processing',
      'succeeded': 'completed',
      'failed': 'failed',
    };

    const result: ProgressInfo = {
      taskId,
      status: stateMap[data.state] || 'processing',
      progress: data.progress || 0,
    };

    if (data.state === 'succeeded' && data.data) {
      // 视频 URL 可能在 data.url 或 data.video_url 中
      result.resultUrl = data.data.url || data.data.video_url || data.data;
    }

    if (data.state === 'failed') {
      result.error = data.message || '任务失败';
    }

    return result;
  }

  async cancelTask(taskId: string): Promise<void> {
    // 暂不支持取消任务
  }

  /**
   * 角色提取 API
   * 从视频中提取角色，返回角色ID用于后续视频生成时引用
   * @param videoPath 视频 URL 或本地路径
   * @returns 角色 ID（用于在 prompt 中通过 @角色ID 引用）
   */
  async extractCharacter(videoPath: string): Promise<string> {
    if (!this.validate()) {
      throw new Error('API Key 未配置');
    }

    const body = {
      video_url: videoPath,
    };

    const response = await fetch(`${this.getBaseUrl()}/v1/characters`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`角色提取失败: ${errorText}`);
    }

    const data = await response.json();
    // 返回角色ID
    return data.id || data.character_id || data.data?.id;
  }
}
