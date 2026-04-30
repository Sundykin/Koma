/**
 * 分镜提示词生成服务
 * 独立于分镜拆解，支持单条和批量生成
 * v2: 支持 force 强制重新生成，分离 image/video 任务
 */
import type { Shot, Character, Scene, ShotVideoMode } from '../types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import type { PromptTemplateType } from '../store/promptTemplates';
import { loadScenes, loadProps, updateShot, loadEpisodeShots } from '../store/projectStore';
import { createLogger } from '../store/logger';
import { createMentionString } from '../editor/mentionTypes';
import { runWithConcurrency } from '../utils/concurrency';
import type { StyleSnapshotLike } from '../utils/promptNormalize';
import { runWithTask } from './taskRunner';
import type { TaskSubType } from './TaskManager';

const logger = createLogger('ShotPrompt');

// 运镜关键字
export const CAMERA_OPTIONS = [
  'static shot',
  'pan left',
  'pan right',
  'tilt up',
  'tilt down',
  'zoom in',
  'zoom out',
  'tracking shot',
  'dolly shot',
  'crane shot',
  'handheld',
  'push in',
  'pull out',
];

// 景别关键字
export const SHOT_TYPE_OPTIONS = [
  'extreme close-up',
  'close-up',
  'medium close-up',
  'medium shot',
  'medium wide shot',
  'wide shot',
  'extreme wide shot',
  'establishing shot',
  'full shot',
  'over-the-shoulder shot',
];

export interface PromptGenerationContext {
  shot: Shot;
  characters: Character[];
  scenes: Scene[];
  stylePrefix: string;
}

export interface PromptGenerationResult {
  shotId: string;
  imagePrompt: string;
  videoPrompt: string;
  success: boolean;
  error?: string;
}

export class ShotPromptService {
  private ctx: import('./CreationContext').CreationContext;

  constructor(ctx: import('./CreationContext').CreationContext) {
    this.ctx = ctx;
  }

  /**
   * 生成单条分镜提示词（返回单一提示词）
   */
  async generateShotPrompt(
    shot: Shot,
    characters: Character[],
    stylePrefix: string = '',
    styleSnapshot?: StyleSnapshotLike
  ): Promise<string> {
    const result = await this.generateDualShotPrompts(shot, characters, stylePrefix, undefined, undefined, styleSnapshot);
    return result.imagePrompt; // 兼容旧接口，返回图片提示词
  }

  /**
   * 生成双提示词（图片 + 视频），支持按需生成
   * @param generateFlags 指定生成哪些类型，默认生成缺失的
   * @param options.force 强制重新生成（用于"优化"功能）
   */
  async generateDualShotPrompts(
    shot: Shot,
    characters: Character[],
    stylePrefix: string = '',
    generateFlags?: { image?: boolean; video?: boolean },
    options?: { force?: boolean },
    styleSnapshot?: StyleSnapshotLike
  ): Promise<{ imagePrompt: string; videoPrompt: string }> {
    const force = options?.force ?? false;
    const resolvedStylePrefix = this.resolveTTIStylePrefix(stylePrefix, styleSnapshot);

    // 确定需要生成哪些类型
    // force 模式下，按 generateFlags 指定的类型强制生成
    const needImage = force
      ? (generateFlags?.image ?? true)
      : (generateFlags?.image ?? !shot.imagePrompt?.trim());
    const needVideo = force
      ? (generateFlags?.video ?? true)
      : (generateFlags?.video ?? !shot.videoPrompt?.trim());

    // 如果都不需要生成，直接返回现有值
    if (!needImage && !needVideo) {
      return {
        imagePrompt: shot.imagePrompt || '',
        videoPrompt: shot.videoPrompt || '',
      };
    }

    // 过滤出该分镜关联的资产（角色/场景/道具）
    const shotCharacters = characters.filter(c => shot.characters?.includes(c.id));

    // 场景与道具由服务内部加载，避免在调用点扩散参数/兼容代码
    const [allScenes, allProps] = await Promise.all([
      loadScenes(this.ctx.projectId).catch(() => []),
      loadProps(this.ctx.projectId).catch(() => []),
    ]);
    const shotScenes = (allScenes || []).filter(s => (shot.scenes || []).includes(s.id));
    const shotProps = (allProps || []).filter(p => (shot.props || []).includes(p.id));

    // 构建角色引用列表
    const characterRefs = shotCharacters
      .map(c => `${c.name}: ${createMentionString('char', c.id)}`)
      .join('\n');

    // 场景引用列表（场景不需要 Sora2 绑定）
    const sceneRefs = shotScenes
      .map(s => `${s.name}: ${createMentionString('scene', s.id)}`)
      .join('\n');

    // 道具引用列表（道具可用 sora2PropId 或内部 ID）
    const propRefs = shotProps
      .map(p => `${p.name}: ${createMentionString('prop', p.id)}`)
      .join('\n');

    // 按需并行生成
    const promises: Promise<string>[] = [];
    if (needImage) {
      promises.push(this.generatePromptByType('image', shot, shotCharacters, shotScenes, shotProps as any, characterRefs, sceneRefs, propRefs, resolvedStylePrefix));
    }
    if (needVideo) {
      promises.push(this.generatePromptByType('video', shot, shotCharacters, shotScenes, shotProps as any, characterRefs, sceneRefs, propRefs, resolvedStylePrefix));
    }

    const results = await Promise.all(promises);

    let resultIndex = 0;
    const imagePrompt = needImage ? results[resultIndex++] : (shot.imagePrompt || '');
    const videoPrompt = needVideo ? results[resultIndex++] : (shot.videoPrompt || '');

    return { imagePrompt, videoPrompt };
  }

  private resolveTTIStylePrefix(legacyStylePrefix?: string, styleSnapshot?: StyleSnapshotLike): string {
    return styleSnapshot?.ttiStylePrefix || this.ctx.styleSnapshot?.ttiStylePrefix || legacyStylePrefix || '';
  }

  /**
   * 按类型生成提示词
   */
  private async generatePromptByType(
    type: 'image' | 'video',
    shot: Shot,
    shotCharacters: Character[],
    shotScenes: Scene[],
    shotProps: Array<{ id: string; name: string; prompt: string; sora2PropId?: string }>,
    characterRefs: string,
    sceneRefs: string,
    propRefs: string,
    stylePrefix: string
  ): Promise<string> {
    // 视频路径：按 (duration, videoMode) 选择 5 个新模板之一，附带上下文衔接
    if (type === 'video') {
      return this.generateVideoPrompt(shot, shotCharacters, shotScenes, shotProps, characterRefs, sceneRefs, propRefs, stylePrefix);
    }

    // 图片路径：仍使用旧通用模板
    const templateKey: PromptTemplateType = 'shot_image_prompt_generation';
    const templateVariables: Record<string, string> = {
      scriptContent: shot.scriptContent,
      characters: shotCharacters.map(c => c.name).join(', ') || '无',
      scenes: shotScenes.map(s => s.name).join(', ') || '无',
      props: shotProps.map(p => p.name).join(', ') || '无',
      emotion: shot.emotion || '中性',
      stylePrefix: stylePrefix || '',
      shotTypeHint: shot.shotType || 'medium',
      shotTypeOptions: SHOT_TYPE_OPTIONS.join(', '),
      characterRefs: characterRefs || '无角色引用',
      sceneRefs: sceneRefs || '无场景引用',
      propRefs: propRefs || '无道具引用',
      cameraMovementHint: shot.cameraMovement || 'static',
    };
    const resolvedPrompt = await resolvePromptTemplate(templateKey, templateVariables);
    const prompt = resolvedPrompt.prompt;

    const resolvedSystemPrompt = await resolvePromptTemplate('shot_prompt_system', {});
    const systemPrompt = resolvedSystemPrompt.prompt;

    const result = await this.ctx.llmProvider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ]);

    // 清理结果
    let cleanedResult = result.trim();
    if (cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) {
      cleanedResult = cleanedResult.slice(1, -1);
    }

    return cleanedResult;
  }

  /**
   * 生成视频提示词：按 (duration, videoMode) 选 5 个新模板之一，
   * 同时抓取邻接分镜上下文，让推理结果的剧情衔接、动作惯性、画面状态在分镜之间连贯。
   */
  private async generateVideoPrompt(
    shot: Shot,
    shotCharacters: Character[],
    shotScenes: Scene[],
    shotProps: Array<{ id: string; name: string; prompt: string; sora2PropId?: string }>,
    characterRefs: string,
    sceneRefs: string,
    propRefs: string,
    stylePrefix: string,
  ): Promise<string> {
    const videoMode: ShotVideoMode = shot.videoMode || 'multi-ref';
    const templateKey = selectVideoTemplateKey(shot.duration, videoMode);

    // 邻接分镜上下文：按需 load 同剧集的所有分镜，定位 prev2 / prev1 / next
    const adjacency = await this.loadAdjacentShots(shot);

    const templateVariables: Record<string, string> = {
      scriptContent: shot.scriptContent || '',
      characters: formatCharacterMappingBaseline(shotCharacters, videoMode),
      scenes: formatSceneMappingBaseline(shotScenes, videoMode),
      props: formatPropMappingBaseline(shotProps, videoMode),
      stylePrefix: stylePrefix || '',
    };

    if (videoMode === 'multi-ref') {
      // 多参模式：3 段衔接（prev2 / prev1 / next）
      templateVariables.prevShot2Info = formatShotContextInfo(adjacency.prev2, { withPrompt: true });
      templateVariables.prevShot1Info = formatShotContextInfo(adjacency.prev1, { withPrompt: true });
      templateVariables.nextShotInfo = formatShotContextInfo(adjacency.next, { withPrompt: false });
    } else {
      // 首帧延展模式：紧跨度 2 段衔接（prev / next）；prev 来自 prev1
      templateVariables.prevShotInfo = formatShotContextInfo(adjacency.prev1, { withPrompt: true });
      templateVariables.nextShotInfo = formatShotContextInfo(adjacency.next, { withPrompt: false });
    }

    const resolvedPrompt = await resolvePromptTemplate(templateKey, templateVariables);
    const userPrompt = resolvedPrompt.prompt;

    const resolvedSystemPrompt = await resolvePromptTemplate('shot_prompt_system', {});
    const systemPrompt = resolvedSystemPrompt.prompt;

    // 视频模板里举例用的 "@图片X" 系符号是占位约定；项目实际使用的 mention 协议是
    // @char_<id> / @scene_<id> / @prop_<id>。在 user 区追加一段映射约定，让 LLM 输出
    // 时直接使用项目协议形式，下游 mention 解析才能正确识别。
    const mappingSchemaNote = buildMappingSchemaNote(characterRefs, sceneRefs, propRefs);

    const result = await this.ctx.llmProvider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${userPrompt}\n\n${mappingSchemaNote}` },
    ]);

    let cleanedResult = result.trim();
    if (cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) {
      cleanedResult = cleanedResult.slice(1, -1);
    }

    return cleanedResult;
  }

  /**
   * 加载邻接分镜上下文（前 2、前 1、后 1）。仅在剧集模式下生效；
   * 没有 episodeId 或读取失败时返回全空，模板会按"无"占位处理。
   */
  private async loadAdjacentShots(shot: Shot): Promise<{
    prev2?: Shot;
    prev1?: Shot;
    next?: Shot;
  }> {
    const episodeId = this.ctx.episodeId;
    if (!episodeId) return {};
    let allShots: Shot[] = [];
    try {
      allShots = await loadEpisodeShots(this.ctx.projectId, episodeId);
    } catch (err) {
      logger.warn('加载邻接分镜失败，按无相邻分镜处理', err);
      return {};
    }
    const idx = allShots.findIndex(s => s.id === shot.id);
    if (idx < 0) return {};
    return {
      prev2: idx >= 2 ? allShots[idx - 2] : undefined,
      prev1: idx >= 1 ? allShots[idx - 1] : undefined,
      next: idx + 1 < allShots.length ? allShots[idx + 1] : undefined,
    };
  }

  /**
   * 九宫格模式：将单个分镜扩展为 9 个连续画面的 imagePrompt
   * 使用 grid_shot_prompt_generation 模板
   */
  async generateGridShotPrompt(
    shot: Shot,
    characters: Character[],
    stylePrefix: string = '',
    styleSnapshot?: StyleSnapshotLike
  ): Promise<string> {
    const resolvedStylePrefix = this.resolveTTIStylePrefix(stylePrefix, styleSnapshot);

    // 过滤出该分镜关联的资产
    const shotCharacters = characters.filter(c => shot.characters?.includes(c.id));
    const [allScenes, allProps] = await Promise.all([
      loadScenes(this.ctx.projectId).catch(() => []),
      loadProps(this.ctx.projectId).catch(() => []),
    ]);
    const shotScenes = (allScenes || []).filter(s => (shot.scenes || []).includes(s.id));
    const shotProps = (allProps || []).filter(p => (shot.props || []).includes(p.id));

    // 构建引用列表
    const characterRefs = shotCharacters
      .map(c => `${c.name}: ${createMentionString('char', c.id)}`)
      .join('\n');
    const sceneRefs = shotScenes
      .map(s => `${s.name}: ${createMentionString('scene', s.id)}`)
      .join('\n');
    const propRefs = shotProps
      .map(p => `${p.name}: ${createMentionString('prop', p.id)}`)
      .join('\n');

    const templateVariables: Record<string, string> = {
      scriptContent: shot.scriptContent,
      characters: shotCharacters.map(c => `${c.name}（${c.appearance || c.description || ''}）`).join('; ') || '无',
      scenes: shotScenes.map(s => s.name).join(', ') || '无',
      props: shotProps.map(p => p.name).join(', ') || '无',
      emotion: shot.emotion || '中性',
      stylePrefix: resolvedStylePrefix || '',
      characterRefs: characterRefs || '无角色引用',
      sceneRefs: sceneRefs || '无场景引用',
      propRefs: propRefs || '无道具引用',
    };

    const resolvedPrompt = await resolvePromptTemplate('grid_shot_prompt_generation', templateVariables);

    const resolvedSystemPrompt = await resolvePromptTemplate('shot_prompt_system', {});

    const result = await this.ctx.llmProvider.chat([
      { role: 'system', content: resolvedSystemPrompt.prompt },
      { role: 'user', content: resolvedPrompt.prompt },
    ]);

    let cleanedResult = result.trim();
    if (cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) {
      cleanedResult = cleanedResult.slice(1, -1);
    }

    return cleanedResult;
  }

  /**
   * 批量生成分镜提示词（双提示词版本）
   * 支持按需生成：只生成缺失的提示词类型
   */
  async batchGenerateShotPrompts(
    shots: Shot[],
    stylePrefix: string = '',
    onProgress?: (current: number, total: number, result: PromptGenerationResult) => void,
    styleSnapshot?: StyleSnapshotLike,
    generateFlags?: { image?: boolean; video?: boolean },
    options?: { force?: boolean },
  ): Promise<PromptGenerationResult[]> {
    const wantsImage = generateFlags?.image ?? true;
    const wantsVideo = generateFlags?.video ?? true;
    const force = options?.force ?? false;

    const shotsToGenerate = shots.filter((shot) => {
      const needImage = wantsImage && (force || !shot.imagePrompt?.trim());
      const needVideo = wantsVideo && (force || !shot.videoPrompt?.trim());
      return needImage || needVideo;
    });

    if (shotsToGenerate.length === 0) return [];

    // 使用 ctx 中已加载的 characters
    const preloadedCharacters = this.ctx.characters;

    let completedCount = 0;
    const tasks = shotsToGenerate.map((shot) => async () => {
      const result = await this.generateAndSaveShotPrompt(
        shot,
        stylePrefix,
        generateFlags,
        options,
        styleSnapshot,
        preloadedCharacters,
      );
      completedCount++;
      onProgress?.(completedCount, shotsToGenerate.length, result);
      return result;
    });

    const settled = await runWithConcurrency(tasks, 3);

    return settled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            shotId: shotsToGenerate[i].id,
            imagePrompt: '',
            videoPrompt: '',
            success: false,
            error: (r.reason as Error)?.message || String(r.reason),
          }
    );
  }

  /**
   * 生成单条分镜提示词并保存（双提示词版本）
   * @param generateFlags 指定生成哪些类型
   * @param options.force 强制重新生成
   */
  async generateAndSaveShotPrompt(
    shot: Shot,
    stylePrefix: string = '',
    generateFlags?: { image?: boolean; video?: boolean },
    options?: { force?: boolean },
    styleSnapshot?: StyleSnapshotLike,
    preloadedCharacters?: Character[],
  ): Promise<PromptGenerationResult> {
    try {
      const characters = preloadedCharacters || this.ctx.characters;
      let workingShot = shot;
      let prerequisiteGridImagePrompt: string | undefined;
      let imagePrompt: string;
      let videoPrompt: string;

      const needsGridVideoPrompt = generateFlags?.video ?? !shot.videoPrompt?.trim();
      if (shot.imageMode === 'grid' && needsGridVideoPrompt && !shot.imagePrompt?.trim()) {
        prerequisiteGridImagePrompt = await this.generateGridShotPrompt(shot, characters, stylePrefix, styleSnapshot);
        workingShot = {
          ...shot,
          imagePrompt: prerequisiteGridImagePrompt,
        };
      }

      if (shot.imageMode === 'grid' && (generateFlags?.image !== false)) {
        // 九宫格模式：imagePrompt 使用专用模板
        const needImage = options?.force || !shot.imagePrompt?.trim();
        imagePrompt = needImage
          ? (prerequisiteGridImagePrompt || await this.generateGridShotPrompt(shot, characters, stylePrefix, styleSnapshot))
          : (workingShot.imagePrompt || '');
        const shotWithGridPrompt = { ...workingShot, imagePrompt };
        // videoPrompt 仍走原流程
        const dualResult = await this.generateDualShotPrompts(
          shotWithGridPrompt, characters, stylePrefix,
          { image: false, video: generateFlags?.video ?? true },
          options, styleSnapshot
        );
        videoPrompt = dualResult.videoPrompt;
      } else {
        const dualResult = await this.generateDualShotPrompts(
          workingShot, characters, stylePrefix,
          generateFlags, options, styleSnapshot
        );
        imagePrompt = dualResult.imagePrompt;
        videoPrompt = dualResult.videoPrompt;
      }

      // 只更新实际生成的字段
      const updates: Partial<Shot> = {};
      if (prerequisiteGridImagePrompt && !shot.imagePrompt?.trim()) {
        updates.imagePrompt = prerequisiteGridImagePrompt;
      }
      if (generateFlags?.image !== false && (options?.force || !shot.imagePrompt?.trim())) {
        updates.imagePrompt = imagePrompt;
      }
      if (generateFlags?.video !== false && (options?.force || !shot.videoPrompt?.trim())) {
        updates.videoPrompt = videoPrompt;
      }

      if (Object.keys(updates).length > 0) {
        await updateShot(this.ctx.projectId, this.ctx.episodeId, shot.id, updates);
      }

      return {
        shotId: shot.id,
        imagePrompt,
        videoPrompt,
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        shotId: shot.id,
        imagePrompt: '',
        videoPrompt: '',
        success: false,
        error: errorMessage,
      };
    }
  }
}

// ========== 视频推理辅助函数 ==========

/**
 * 按 (duration, videoMode) 选择视频推理模板。
 *
 * 时长映射规则：
 * - 6s → 6 秒模板
 * - 7-10s → 10 秒模板
 * - 11s 及以上：multi 走 15 秒模板，first-frame 因无 15s 版本回退到 10 秒模板
 *
 * 没有匹配项时回退到旧通用模板 shot_video_prompt_generation。
 */
function selectVideoTemplateKey(duration: number, mode: ShotVideoMode): PromptTemplateType {
  const d = typeof duration === 'number' && duration > 0 ? duration : 6;
  if (mode === 'first-frame') {
    if (d <= 6) return 'shot_video_6s_firstframe';
    return 'shot_video_10s_firstframe'; // 首帧模式没有 15s 版本，>10s 时兜底到 10s
  }
  // multi-ref
  if (d <= 6) return 'shot_video_6s_multi';
  if (d <= 10) return 'shot_video_10s_multi';
  return 'shot_video_15s_multi';
}

/**
 * 把当前分镜的角色清单格式化为"映射基准库"内容。
 *
 * - multi-ref：每个角色一行 `<name>（映射符 @char_<id>）：<appearance>`，
 *   既给 LLM 完整外观，又给出项目实际使用的 mention 字符串
 * - first-frame：仅按角色名简短列表（首帧模板里没有 @ 映射段，无需输出占位）
 */
function formatCharacterMappingBaseline(
  shotCharacters: Character[],
  mode: ShotVideoMode,
): string {
  if (!shotCharacters.length) return '无';
  if (mode === 'first-frame') {
    return shotCharacters.map(c => c.name).join('、');
  }
  return shotCharacters
    .map(c => {
      const mention = createMentionString('char', c.id);
      const appearance = (c.appearance || c.description || '').trim();
      return `- ${c.name}（映射符 ${mention}）：${appearance || '（无外观描述）'}`;
    })
    .join('\n');
}

function formatSceneMappingBaseline(
  shotScenes: Scene[],
  mode: ShotVideoMode,
): string {
  if (!shotScenes.length) return '无';
  if (mode === 'first-frame') {
    return shotScenes.map(s => s.name).join('、');
  }
  return shotScenes
    .map(s => {
      const mention = createMentionString('scene', s.id);
      const desc = (s.description || s.prompt || '').trim();
      return `- ${s.name}（映射符 ${mention}）：${desc || '（无空间描述）'}`;
    })
    .join('\n');
}

function formatPropMappingBaseline(
  shotProps: Array<{ id: string; name: string; prompt: string }>,
  mode: ShotVideoMode,
): string {
  if (!shotProps.length) return '无';
  if (mode === 'first-frame') {
    return shotProps.map(p => p.name).join('、');
  }
  return shotProps
    .map(p => {
      const mention = createMentionString('prop', p.id);
      const desc = (p.prompt || '').trim();
      return `- ${p.name}（映射符 ${mention}）：${desc || '（无外观描述）'}`;
    })
    .join('\n');
}

/**
 * 把邻接分镜的剧情和已生成提示词格式化为上下文段落。
 * - withPrompt=true：包含已生成的 videoPrompt（如果有）
 * - withPrompt=false：仅剧情（用于尚未推理的下一镜）
 * 不存在时返回 "无"，模板里的占位会按"无相邻分镜"处理。
 */
function formatShotContextInfo(
  shot: Shot | undefined,
  options: { withPrompt: boolean },
): string {
  if (!shot) return '无';
  const lines: string[] = [];
  const script = (shot.scriptContent || '').trim();
  lines.push(`剧情：${script || '（空）'}`);
  if (options.withPrompt) {
    const prompt = (shot.videoPrompt || '').trim();
    lines.push(`已生成提示词：${prompt || '（尚未生成）'}`);
  }
  return lines.join('\n');
}

/**
 * 视频推理模板示例使用 "@图片1 / @图片2" 等占位约定；项目实际使用 mention 协议
 * (@char_<id> / @scene_<id> / @prop_<id>)。本注释告诉 LLM 把模板里所有 "@图片N" 替换成
 * 实际给出的 mention 字符串，确保下游 mention 解析能识别。
 */
function buildMappingSchemaNote(
  characterRefs: string,
  sceneRefs: string,
  propRefs: string,
): string {
  return [
    '【映射符约定（覆盖模板示例中的 @图片X 写法）】',
    '本任务的映射符使用项目 mention 协议：角色为 @char_<id>、场景为 @scene_<id>、道具为 @prop_<id>。',
    '上文模板正文里所有形如 "@图片1 / @图片2 / @图片X" 的写法仅是文档示例占位；最终输出请直接使用下方实际给出的映射符全字符串，不要保留 "@图片N" 形式。',
    '',
    '本分镜的实际映射符：',
    `角色：\n${characterRefs || '（无）'}`,
    `场景：\n${sceneRefs || '（无）'}`,
    `道具：\n${propRefs || '（无）'}`,
  ].join('\n');
}

/**
 * 便捷函数：为单个分镜生成提示词
 * @param generateFlags 指定生成哪些类型 { image?: boolean; video?: boolean }
 * @param options.force 强制重新生成（用于"优化"功能）
 */
export async function generateShotPrompt(
  projectId: string,
  episodeId: string,
  shot: Shot,
  stylePrefix?: string,
  llmSelection?: string,
  generateFlags?: { image?: boolean; video?: boolean },
  options?: { force?: boolean },
  styleSnapshot?: StyleSnapshotLike,
): Promise<PromptGenerationResult> {
  const { createCreationContext } = await import('./CreationContext');
  const ctx = await createCreationContext(projectId, episodeId, {
    llmConfigId: llmSelection,
    styleSnapshot,
  });
  const service = new ShotPromptService(ctx);

  // 任务面板可见性：单分镜的"图/视"提示词推理（生成或优化）
  const wantsImage = generateFlags?.image ?? true;
  const wantsVideo = generateFlags?.video ?? true;
  const force = options?.force ?? false;
  const action = force ? '优化' : '生成';
  const kindLabel = wantsImage && wantsVideo ? '图片+视频' : (wantsImage ? '图片' : '视频');
  const subType: 'image' | 'video' | 'prompt-generation' | 'prompt-optimization' = force
    ? 'prompt-optimization'
    : (wantsImage && wantsVideo ? 'prompt-generation' : (wantsImage ? 'image' : 'video'));
  const taskType: 'prompt-generation:image' | 'prompt-generation:video' | 'prompt-optimization:image' | 'prompt-optimization:video' = force
    ? (wantsImage ? 'prompt-optimization:image' : 'prompt-optimization:video')
    : (wantsImage ? 'prompt-generation:image' : 'prompt-generation:video');

  const { result } = await runWithTask({
    projectId,
    category: 'prompt',
    subType: subType as TaskSubType,
    targetType: 'shot',
    targetId: shot.id,
    targetName: `${action}${kindLabel}提示词`,
    type: taskType,
    metadata: { shotId: shot.id, force, generateFlags },
    execute: async (taskCtx) => {
      taskCtx.progress(15, '准备...');
      const r = await service.generateAndSaveShotPrompt(shot, stylePrefix, generateFlags, options, styleSnapshot);
      taskCtx.progress(100, '完成');
      return r;
    },
  });
  return result;
}

/**
 * 便捷函数：批量生成分镜提示词
 *
 * 由 runWithTask 包装为可见任务（subType 根据 generateFlags 选择 image/video/混合）。
 * 进度回调同时透给业务调用方与任务面板。
 */
export async function batchGenerateShotPrompts(
  projectId: string,
  episodeId: string,
  shots: Shot[],
  stylePrefix?: string,
  onProgress?: (current: number, total: number, result: PromptGenerationResult) => void,
  llmSelection?: string,
  styleSnapshot?: StyleSnapshotLike,
  generateFlags?: { image?: boolean; video?: boolean },
  options?: { force?: boolean },
): Promise<PromptGenerationResult[]> {
  const { createCreationContext } = await import('./CreationContext');
  const ctx = await createCreationContext(projectId, episodeId, {
    llmConfigId: llmSelection,
    styleSnapshot,
  });
  const service = new ShotPromptService(ctx);

  const wantsImage = generateFlags?.image ?? true;
  const wantsVideo = generateFlags?.video ?? true;
  const subType: 'image' | 'video' | 'prompt-generation' = wantsImage && wantsVideo
    ? 'prompt-generation'
    : (wantsImage ? 'image' : 'video');
  const { result } = await runWithTask({
    projectId,
    category: 'prompt',
    subType: subType as TaskSubType,
    targetType: 'episode',
    targetId: episodeId,
    targetName: `批量${wantsImage ? '图片' : ''}${wantsImage && wantsVideo ? '/' : ''}${wantsVideo ? '视频' : ''}提示词（${shots.length} 个分镜）`,
    type: wantsImage ? 'prompt-generation:image' : 'prompt-generation:video',
    metadata: { shotCount: shots.length, force: options?.force ?? false },
    execute: async (taskCtx) => {
      const total = Math.max(shots.length, 1);
      return service.batchGenerateShotPrompts(
        shots,
        stylePrefix,
        (current, totalCount, oneResult) => {
          // 业务进度回调
          onProgress?.(current, totalCount, oneResult);
          // 同步到任务面板
          const percent = Math.round((current / total) * 100);
          taskCtx.progress(percent, `${current}/${totalCount} 完成`);
        },
        styleSnapshot,
        generateFlags,
        options,
      );
    },
  });
  return result;
}
