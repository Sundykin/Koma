/**
 * R4 二创：修改单单项执行 IPC controller
 *
 * 6 个 ModificationKind 的执行路径不同：
 *   - aspect_ratio: 完全在 main 跑（runAspectRatio 一刀流）
 *   - language_dub: renderer 先调 TTS 出音频文件，再调 runLanguageDubMux 替音轨
 *   - stylization / wardrobe: renderer 先 prepareFrameByFrame 拿帧 + 音轨 →
 *     逐帧调 TTI 覆盖写回 → 调 runFrameByFrameCompose 拼回视频
 *   - face_swap / body_reshape: UI 已禁用，不会进来
 */
import { BaseController } from './base';
import { services, ensureServicesReady } from '../service';
import type { ModifyExecutorInput, ModifyExecutorResult } from '../service/recreationModify';

class RecreationModifyController extends BaseController {
  async runAspectRatio(args: ModifyExecutorInput): Promise<ModifyExecutorResult> {
    await ensureServicesReady();
    return services.recreationModify.runAspectRatio(args);
  }

  async runLanguageDubMux(args: ModifyExecutorInput & { audioPath: string }): Promise<ModifyExecutorResult> {
    await ensureServicesReady();
    return services.recreationModify.runLanguageDubMux(args);
  }

  async prepareFrameByFrame(args: { videoId: string; fps: number }) {
    await ensureServicesReady();
    return services.recreationModify.prepareFrameByFrame(args);
  }

  async runFrameByFrameCompose(
    args: ModifyExecutorInput & { frameDir: string; audioPath: string | null; fps: number },
  ): Promise<ModifyExecutorResult> {
    await ensureServicesReady();
    return services.recreationModify.runFrameByFrameCompose(args);
  }
}

export = RecreationModifyController;
