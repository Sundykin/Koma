/**
 * ComfyUI TTI Provider
 */
import type { TTIModelConfig } from '../../types';
import type { TTIProvider, ImageResult, TTIOptions } from './types';

export class ComfyUIProvider implements TTIProvider {
  type = 'comfyui';
  config: TTIModelConfig;

  constructor(config: TTIModelConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.baseUrl;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/system_stats`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateImage(
    prompt: string,
    options?: TTIOptions
  ): Promise<ImageResult> {
    // TODO: 实现完整对接
    // 需要：工作流 JSON 解析、节点映射、WebSocket 进度监控
    throw new Error('ComfyUI integration not fully implemented yet');
  }
}

export default ComfyUIProvider;
