/**
 * Kling (可灵) Provider
 */
import type { ITVConfig, ITVOptions, VideoResult, ProgressInfo } from '../../types';
import type { ITVProvider, ITVGenerateInput } from './types';

export class KlingProvider implements ITVProvider {
  type: 'kling' = 'kling';
  config: ITVConfig;

  constructor(config: ITVConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  async testConnection(): Promise<boolean> {
    return this.validate();
  }

  async generateVideo(input: ITVGenerateInput): Promise<VideoResult> {
    // TODO: 实现可灵 API 调用
    // 可灵特性：首尾帧控制、运动控制
    throw new Error('Kling provider not implemented yet');
  }

  async checkProgress(taskId: string): Promise<ProgressInfo> {
    throw new Error('Kling progress check not implemented yet');
  }

  async cancelTask(taskId: string): Promise<void> {
    throw new Error('Kling task cancellation not implemented yet');
  }
}

export default KlingProvider;
