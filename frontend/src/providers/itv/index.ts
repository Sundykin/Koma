/**
 * ITV Provider 模块导出
 */
export * from './types';
export { RunwayProvider } from './RunwayProvider';
export { KlingProvider } from './KlingProvider';
export { PikaProvider } from './PikaProvider';
export { Sora2Provider } from './Sora2Provider';
export { ComfyUIAnimateDiffProvider } from './ComfyUIAnimateDiffProvider';

import type { ITVConfig } from '../../types';
import type { ITVProvider } from './types';
import { RunwayProvider } from './RunwayProvider';
import { KlingProvider } from './KlingProvider';
import { PikaProvider } from './PikaProvider';
import { Sora2Provider } from './Sora2Provider';
import { ComfyUIAnimateDiffProvider } from './ComfyUIAnimateDiffProvider';

export function createITVProvider(config: ITVConfig): ITVProvider {
  switch (config.provider) {
    case 'runway':
      return new RunwayProvider(config);
    case 'kling':
      return new KlingProvider(config);
    case 'pika':
      return new PikaProvider(config);
    case 'sora2':
      return new Sora2Provider(config);
    case 'comfyui-animatediff':
      return new ComfyUIAnimateDiffProvider(config);
    default:
      throw new Error(`Unknown ITV provider: ${config.provider}`);
  }
}
