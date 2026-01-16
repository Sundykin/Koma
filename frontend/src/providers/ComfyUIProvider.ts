/**
 * ComfyUI Provider (占位实现)
 * Phase 2 将实现完整对接
 */
import type { ModelConfig, ScriptAnalysisResult } from '../types';
import type { LLMProvider, TTIProvider, ImageResult, TTIOptions } from './types';

// ComfyUI TTI Provider
export class ComfyUITTIProvider implements TTIProvider {
  type = 'comfyui';
  config: ModelConfig;

  constructor(config: ModelConfig) {
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
    // TODO: Phase 2 实现
    // 需要：工作流 JSON 解析、节点映射、WebSocket 进度监控
    throw new Error('ComfyUI integration not implemented yet (Phase 2)');
  }
}

export default ComfyUITTIProvider;
