/**
 * MediaGenerationService —— 媒体生成统一入口（门面）。
 *
 * 实现已按域拆到 ./mediaGeneration/：
 *   - helpers.ts  共享纯工具（provider 解析 / 资产输入 / 元数据 / 路径）
 *   - images.ts   generateImages / generateImage（批量出图 + 扇出合并）
 *   - video.ts    generateVideo
 *   - audio.ts    generateAudio / generateShotAudioWithSegments（多音色分段合成）
 *   - tasks.ts    recoverTask / pollAndFinalizeViaMain（主进程任务恢复与收敛）
 *
 * 本类只保持原有公开 API 形态（单例 + 方法委托），无实例状态。
 * generateShotAudioWithSegments 特意经 this.generateAudio 调用 —— 保留实例级
 * mock 接缝（与原类内 this 调用等价，spyOn(service, 'generateAudio') 仍可拦截）。
 */
import { generateImages, generateImage } from './mediaGeneration/images';
import { generateVideo } from './mediaGeneration/video';
import { generateAudio, generateShotAudioWithSegmentsWith } from './mediaGeneration/audio';
import { recoverTask } from './mediaGeneration/tasks';

type ShotAudioSegmentsParams = Parameters<typeof generateShotAudioWithSegmentsWith>[0];

export class MediaGenerationService {
  /** 解析当前项目选中的 ITV provider 实例（给渲染工作流做 H3-Context-IR 等渠道特有预处理）。 */
  async resolveITVProvider(
    itvSelection?: string,
    capability: Parameters<typeof generateVideo>[0]['request']['capability'] = 'video.reference-to-video',
  ) {
    const { resolveProviderAndContext } = await import('./mediaGeneration/helpers');
    const { getProjectITVProvider } = await import('../providers');
    const { provider } = await resolveProviderAndContext({
      category: 'itv',
      selectionKey: itvSelection,
      capability,
      getProvider: getProjectITVProvider,
      missingError: '未配置 ITV 服务',
      allowCapabilityFallback: false,
    });
    return provider;
  }

  generateImages = generateImages;
  generateImage = generateImage;
  generateVideo = generateVideo;
  generateAudio = generateAudio;
  recoverTask = recoverTask;

  generateShotAudioWithSegments(params: ShotAudioSegmentsParams) {
    return generateShotAudioWithSegmentsWith(params, this.generateAudio);
  }
}

export const mediaGenerationService = new MediaGenerationService();
