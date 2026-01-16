/**
 * Sora 2 ITV Provider (占位)
 * 等待 OpenAI API 开放
 */
import type {
  ITVConfig,
  ITVOptions,
  VideoResult,
  ProgressInfo,
} from '../../types';
import type { ITVProvider } from './types';

export class Sora2Provider implements ITVProvider {
  type = 'sora2' as const;
  config: ITVConfig;

  constructor(config: ITVConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://api.openai.com/v1';
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      // 测试 OpenAI API 可用性
      const response = await fetch(`${this.getBaseUrl()}/models`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(
    imagePath: string,
    prompt: string,
    options?: ITVOptions
  ): Promise<string> {
    if (!this.validate()) {
      throw new Error('OpenAI API Key 未配置');
    }

    // Sora 2 API 暂未开放，抛出提示
    throw new Error(
      'Sora 2 API 尚未开放公开访问。请关注 OpenAI 官方公告。\n' +
      '目前可使用 Runway Gen-3 或可灵作为替代方案。'
    );

    // 预留 API 调用结构（待 API 开放后实现）
    // const response = await fetch(`${this.getBaseUrl()}/video/generations`, {
    //   method: 'POST',
    //   headers: {
    //     Authorization: `Bearer ${this.config.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     model: 'sora-2',
    //     prompt,
    //     image: imagePath,
    //     duration: options?.duration || 5,
    //   }),
    // });
    //
    // const data = await response.json();
    // return data.id;
  }

  async checkProgress(taskId: string): Promise<ProgressInfo> {
    // 预留实现
    return {
      status: 'failed',
      progress: 0,
      error: 'Sora 2 API 尚未开放',
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    // 预留实现
  }
}
