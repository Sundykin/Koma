/**
 * Runway Gen-3 Provider
 */
import type { ITVConfig, ITVOptions, VideoResult, ProgressInfo } from '../../types';
import type { ITVProvider } from './types';

export class RunwayProvider implements ITVProvider {
  type: 'runway' = 'runway';
  config: ITVConfig;

  constructor(config: ITVConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  async testConnection(): Promise<boolean> {
    // TODO: 实现 Runway API 连接测试
    return this.validate();
  }

  async generate(
    imagePath: string,
    prompt: string,
    options?: ITVOptions
  ): Promise<string> {
    // Runway API 是异步的，返回 taskId
    // TODO: 实现 Runway Gen-3 API 调用
    // 参考: https://docs.runwayml.com/

    throw new Error('Runway provider not implemented yet');
  }

  async checkProgress(taskId: string): Promise<ProgressInfo> {
    // TODO: 实现进度查询
    throw new Error('Runway progress check not implemented yet');
  }

  async cancelTask(taskId: string): Promise<void> {
    // TODO: 实现任务取消
    throw new Error('Runway task cancellation not implemented yet');
  }
}

export default RunwayProvider;
