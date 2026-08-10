/**
 * 各 ITV 渠道能承载哪几类参考素材（图片 / 视频 / 音频）。
 *
 * 提示词编译层（imageIndexProtocol）三类占位符一视同仁，但**能不能真的把素材传上去**
 * 取决于上游接口有没有对应字段。渠道不支持某一类时必须提前知道，否则会出现
 * "提示词里写着 @video_file_1 延长，请求里却没有那段视频"——模型会照着不存在的参考
 * 硬编，比不承接还糟。
 *
 * 各渠道字段来源：
 *   - koma-suihe-itv  metadata.image_urls / video_urls / audio_urls（网关分发到 *_file_N）
 *   - suihe-itv       multipart image_file* / video_file* / audio_file*（穗禾全能参考族）
 *   - comfyui-itv     工作流 ref_images / ref_videos / ref_audios（MiniMax H3 节点）
 *   - grok2api-imagine-itv  只有 image_reference 一个数组，上游没有视频 / 音频参考位
 *   - openai-video    只有 input_reference / images 扩展字段，同样没有视频 / 音频参考位
 */
import type { PromptCompilationReferenceKind } from '../../services/promptCompilation/types';

const IMAGE_ONLY: PromptCompilationReferenceKind[] = ['image'];
const ALL_KINDS: PromptCompilationReferenceKind[] = ['image', 'video', 'audio'];

const REFERENCE_KINDS_BY_PROVIDER: Record<string, PromptCompilationReferenceKind[]> = {
  'koma-suihe-itv': ALL_KINDS,
  'suihe-itv': ALL_KINDS,
  'comfyui-itv': ALL_KINDS,
  'minimax-h3-itv': ALL_KINDS,
  'grok2api-imagine-itv': IMAGE_ONLY,
  'openai-video': IMAGE_ONLY,
};

/**
 * 未登记的 providerType（第三方插件渠道等）按"三类都支持"处理。
 * 理由：插件渠道多半走 OpenAI 兼容或 multipart 直传，字段被忽略最多是白传一份素材；
 * 反过来默认不支持会让插件渠道永远用不上视频承接，代价更大。
 */
export function getSupportedReferenceKinds(
  providerType: string | undefined,
): PromptCompilationReferenceKind[] {
  if (!providerType) return ALL_KINDS;
  return REFERENCE_KINDS_BY_PROVIDER[providerType] ?? ALL_KINDS;
}

export function supportsReferenceKind(
  providerType: string | undefined,
  kind: PromptCompilationReferenceKind,
): boolean {
  return getSupportedReferenceKinds(providerType).includes(kind);
}
