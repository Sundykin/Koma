/**
 * 分镜的「上一镜视频延长」承接：把上一分镜的**整段成片**作为全能参考交给视频模型，
 * 提示词里声明"基于该视频延长生成"。
 *
 * 与尾帧模式（shotRenderWorkflow.resolveShotTailFrameReference）的分工：
 *   - 尾帧模式：ffmpeg 抽一帧 → 当图片参考（@previous_tail_frame → @Image N）。
 *     锁死起始画面，但运镜惯性、动作节奏、光影漂移都得靠文字重新描述。
 *   - 延长模式：整段视频直传 → 视频参考（@previous_video_clip → @video_file_N / @Video N）。
 *     模型自己从视频里读运镜和动作末态，连贯度更高；代价是消耗更多额度，
 *     且上一镜视频本身的瑕疵会被继承。
 *
 * 产物与 shotVoiceReferences 对称：
 *   - request.metadata.komaVideoReferences：视频素材（ProviderAssetInput）
 *   - prompt 里的 @previous_video_clip 编译成协议占位符
 */
import {
  getMediaAssetDisplaySource,
  type ProviderAssetInput,
  type Shot,
  type StoredMediaAsset,
} from '../types';
import { resolveProviderAssetInput } from '../services/mediaAssetResolver';
import { formatReferencePlaceholder } from '../services/promptCompilation/imageIndexProtocol';
import { usesPreviousVideoExtend } from '../services/shotContinuity';
import { createLogger } from '../store/logger';

const logger = createLogger('ShotVideoExtend');

/** 上一镜整段视频的语义 mention（推理阶段写这个，渲染期编译成协议占位符）。 */
export const PREVIOUS_VIDEO_MENTION = '@previous_video_clip';
export const PREVIOUS_VIDEO_LABEL = '上一分镜视频';

export interface ShotVideoExtendPlan {
  /** 上一镜整段视频素材；为空表示本镜不走延长模式或素材不可用 */
  reference?: ProviderAssetInput;
  sourceShotId?: string;
  /** 提示词首部要拼的延长声明（reference 为空时是空串） */
  promptPrefix: string;
}

const EMPTY_PLAN: ShotVideoExtendPlan = { promptPrefix: '' };

/** 取一个分镜当前选中的成片视频（没有已完成视频时返回 undefined）。 */
function pickShotVideo(shot: Shot | undefined): StoredMediaAsset | undefined {
  const videos = shot?.media?.videos || [];
  if (!videos.length) return undefined;
  const index = shot?.media?.currentVideoIndex ?? 0;
  const selected = videos[index] ?? videos[videos.length - 1];
  if (!selected || selected.kind !== 'video') return undefined;
  if (!selected.localPath && !selected.remoteUrl) return undefined;
  return selected;
}

/**
 * 构建延长计划：定位上一镜 → 取其成片 → 解析成 provider 可直传的素材。
 *
 * 找不到上一镜 / 上一镜没出片 / 素材解析失败都返回空计划并留日志——延长承接是增强项，
 * 不能因为它让整条出片链路直接失败（降级成普通生成，用户能从日志和提示词里看出来）。
 */
export async function buildShotVideoExtendPlan(params: {
  shot: Shot;
  allShots?: Shot[];
  /** 本镜时长，用于写"延长 N 秒" */
  durationSeconds: number;
  /** 当前 ITV provider 的提示词协议（决定占位符形态） */
  promptProtocol?: string;
}): Promise<ShotVideoExtendPlan> {
  const { shot, allShots, durationSeconds, promptProtocol } = params;
  if (!usesPreviousVideoExtend(shot)) {
    // 这里曾经是静默 return：推理时开了延长（提示词里带 @previous_video_clip）、渲染时
    // 开关又没了的情况完全查不出原因。把判定依据打出来，一眼能看出是哪个字段掉了。
    logger.info('本镜未启用延长承接，跳过视频参考', {
      shotId: shot.id,
      mode: shot.videoReference?.mode,
      usePreviousTailFrame: shot.videoReference?.usePreviousTailFrame,
      continuity: shot.videoReference?.continuity,
    });
    return EMPTY_PLAN;
  }

  const sequence = allShots ?? [];
  const index = sequence.findIndex(candidate => candidate.id === shot.id);
  const predecessor = index > 0
    ? sequence[index - 1]
    : sequence.find(candidate => candidate.id === shot.videoReference?.sourceShotId);
  if (!predecessor) {
    logger.warn('延长模式缺少上一镜，降级为普通生成', { shotId: shot.id });
    return EMPTY_PLAN;
  }

  const video = pickShotVideo(predecessor);
  if (!video) {
    logger.warn('延长模式的上一镜还没有成片视频，降级为普通生成', {
      shotId: shot.id,
      predecessorId: predecessor.id,
    });
    return EMPTY_PLAN;
  }

  try {
    const source = getMediaAssetDisplaySource(video) || video.localPath || video.remoteUrl;
    const asset = source ? await resolveProviderAssetInput(source, { preferLocalFile: true }) : undefined;
    if (!asset) {
      logger.warn('延长模式的上一镜视频解析失败，降级为普通生成', {
        shotId: shot.id,
        predecessorId: predecessor.id,
      });
      return EMPTY_PLAN;
    }
    const placeholder = formatReferencePlaceholder(promptProtocol, 'video', 1);
    return {
      reference: asset,
      sourceShotId: predecessor.id,
      promptPrefix: `将 ${placeholder} 延长 ${durationSeconds} 秒：严格承接该视频最后一帧的人物站位、朝向、动作末态、运镜方向与光影，`
        + '不要重新开场、不要重置机位、不要重复已经演过的动作，只把剧情继续往前推进。',
    };
  } catch (error) {
    logger.warn('延长模式素材准备失败，降级为普通生成', {
      shotId: shot.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return EMPTY_PLAN;
  }
}

// 推理阶段写进提示词的语义 mention。可能被 LLM 写成带中文名的完整形式。
const PREVIOUS_VIDEO_MENTION_RE = /@previous_video_clip(?:\s*上一分镜视频)?/g;

/**
 * 把提示词里的 `@previous_video_clip` 编译成协议占位符（`@video_file_1` / `@Video 1`）。
 *
 * 必须在 compileShotPromptToBundle 之前跑：图像编译器不认这个 token，会当成未匹配 mention
 * 直接剥掉，导致 prompt 里没有任何东西指向那段视频参考。
 * 没有可用延长素材时同样剥离，避免留下模型看不懂的裸 token。
 */
export function compileShotVideoExtendMentions(params: {
  prompt: string;
  plan: ShotVideoExtendPlan;
  promptProtocol?: string;
}): { prompt: string; stripped: boolean } {
  const { plan, promptProtocol } = params;
  let stripped = false;
  const replacement = plan.reference
    ? formatReferencePlaceholder(promptProtocol, 'video', 1)
    : '';
  const prompt = params.prompt.replace(PREVIOUS_VIDEO_MENTION_RE, () => {
    if (!plan.reference) {
      stripped = true;
      return '上一镜画面';
    }
    return replacement;
  });
  return { prompt, stripped };
}
