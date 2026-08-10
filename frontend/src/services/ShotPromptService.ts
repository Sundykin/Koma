/**
 * 分镜提示词生成服务
 * 独立于分镜拆解，支持单条和批量生成
 * v2: 支持 force 强制重新生成，分离 image/video 任务
 */
import type { Prop, Shot, Character, Scene, ShotVideoMode } from '../types';
import { getShotScriptText } from '../types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import type { PromptTemplateType } from '../store/promptTemplates';
import { loadProject, loadScenes, loadProps, updateShot, loadEpisodeShots } from '../store/projectStore';
import { createLogger } from '../store/logger';
import { createMentionString } from '../editor/mentionTypes';
import { runWithConcurrency } from '../utils/concurrency';
import {
  clampDurationToSpec,
  FALLBACK_DURATION_RANGE,
  type VideoDurationSpec,
} from '../providers/itv/durationSpec';
import type { StyleSnapshotLike } from '../utils/promptNormalize';
import { runWithTask } from './taskRunner';
import type { TaskSubType } from './TaskManager';
import { usesPreviousVideoExtend } from './shotContinuity';
import {
  PREVIOUS_VIDEO_LABEL,
  PREVIOUS_VIDEO_MENTION,
} from '../workflow/shotVideoExtendReference';
import { buildShotReferenceBundle } from './shotReference/builder';
import {
  renderGridSequenceNotice,
  renderShotMentionReferenceTable,
  renderShotReferenceTable,
  summarizeBundle,
} from './shotReference/render';
import { decideShotsMode, renderShotsSection } from './shotReference/shotsOutputFormat';
import type { ShotReferenceBundle, ShotReferenceItem } from './shotReference/types';
import {
  buildVideoDialogueModeDirective,
  type ProjectNarrativeMode,
} from './narrativeMode';
import {
  buildShotVideoScriptContent,
  firstNonEmptyLine,
  formatDialogueTextForPrompt,
  resolveShotDialogueText,
} from './shotDialogue/scriptFormat';
import {
  buildDialogueGuardNote,
  ensureExplicitDialogueInVideoPrompt,
  sanitizeVideoPromptResult,
} from './shotDialogue/guard';

// 对白域逻辑已拆到 services/shotDialogue/；对外保持原有 re-export 兼容
export {
  buildDialogueGuardNote,
  ensureExplicitDialogueInVideoPrompt,
  sanitizeVideoPromptResult,
} from './shotDialogue/guard';

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

export interface ShotPromptGenerationOptions {
  force?: boolean;
  shotsSnapshot?: Shot[];
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
    options?: ShotPromptGenerationOptions,
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
    const allEpisodeShots = options?.shotsSnapshot ?? await this.loadAllEpisodeShots();

    // 构建角色引用列表（统一 `@<id> <名称>` 顺序，与 mappingSchemaNote 输出约定一致）
    const characterRefs = shotCharacters
      .map(c => `${createMentionString('char', c.id)} ${c.name}`)
      .join('\n');

    // 场景引用列表（场景不需要 Sora2 绑定）
    const sceneRefs = shotScenes
      .map(s => `${createMentionString('scene', s.id)} ${s.name}`)
      .join('\n');

    // 道具引用列表（道具可用 sora2PropId 或内部 ID）
    const propRefs = shotProps
      .map(p => `${createMentionString('prop', p.id)} ${p.name}`)
      .join('\n');

    // 阶段 3：统一引用集合。生图和生视频共用同一份 bundle，模板里的
    // {{referenceTable}} / {{gridSequenceNotice}} / {{shotsSection}} 都从这里
    // 渲染——保证 LLM 推理出来的 @Image N 跟下游 provider 请求的 references 数组
    // 位置一一对应。
    const referenceBundle = buildShotReferenceBundle({
      shot,
      characters: shotCharacters,
      scenes: shotScenes,
      props: shotProps,
      allShots: allEpisodeShots,
      // 让 LLM 的参考表能看到上一镜尾帧（@previous_tail_frame），生成提示词时可引用
      options: { includePreviousVideoTail: true },
    });
    const referenceTable = renderShotReferenceTable(referenceBundle);
    const gridSequenceNotice = renderGridSequenceNotice(referenceBundle);

    // shots 段必须和真实 reference bundle 对齐：
    // - 有 grid-anchor 图片时，才渲染 4/9 宫格镜头骨架；
    // - 没有真实分镜图时，即使 imageMode 是 grid/storyboard，也走 normal / 多参考模式。
    // 这样不会把不存在的 @grid_anchor 内置进视频提示词。
    const explicitCellCount: 4 | 9 | undefined =
      shot.imageMode === 'grid-4' ? 4
      : (shot.imageMode === 'grid' || shot.imageMode === 'grid-9') ? 9
      : undefined;
    const shotsMode = decideShotsMode(referenceBundle, explicitCellCount);
    const shotsSection = renderShotsSection({ mode: shotsMode, duration: shot.duration });

    logger.info('分镜参考集合 bundle 已构建', {
      shotId: shot.id,
      summary: summarizeBundle(referenceBundle),
      hasGridAnchor: referenceBundle.hasGridAnchor,
      gridCellCount: referenceBundle.gridCellCount,
      explicitCellCount,
      shotImageMode: shot.imageMode,
      shotsMode,
    });

    // 串行生成：图片提示词先出，视频提示词以**新**图片提示词为空间锚定依据。
    // （并行时代码锚定的是旧 imagePrompt，图词与视频词的起始姿态可能互相矛盾）
    let imagePrompt = shot.imagePrompt || '';
    if (needImage) {
      imagePrompt = await this.generatePromptByType(
        'image', shot, shotCharacters, shotScenes, shotProps,
        characterRefs, sceneRefs, propRefs, resolvedStylePrefix,
        referenceTable, gridSequenceNotice, shotsSection, referenceBundle, allEpisodeShots,
      );
    }
    let videoPrompt = shot.videoPrompt || '';
    if (needVideo) {
      const shotForVideo = needImage ? { ...shot, imagePrompt } : shot;
      videoPrompt = await this.generatePromptByType(
        'video', shotForVideo, shotCharacters, shotScenes, shotProps,
        characterRefs, sceneRefs, propRefs, resolvedStylePrefix,
        referenceTable, gridSequenceNotice, shotsSection, referenceBundle, allEpisodeShots,
      );
    }

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
    shotProps: Prop[],
    characterRefs: string,
    sceneRefs: string,
    propRefs: string,
    stylePrefix: string,
    referenceTable: string,
    gridSequenceNotice: string,
    shotsSection: string,
    referenceBundle: ShotReferenceBundle,
    allEpisodeShots?: Shot[],
  ): Promise<string> {
    // 视频路径：按 (duration, videoMode) 选择 5 个新模板之一，附带上下文衔接
    if (type === 'video') {
      return this.generateVideoPrompt(
        shot, shotCharacters, shotScenes, shotProps,
        referenceTable, gridSequenceNotice, shotsSection, referenceBundle, allEpisodeShots,
      );
    }

    const characterNames = shotCharacters.map(character => character.name);
    const characterNameById = new Map(shotCharacters.map(c => [c.id, c.name]));
    const dialogueModeDirective = buildVideoDialogueModeDirective(this.ctx.projectMode);
    const visualScriptContent = buildShotVideoScriptContent(shot, characterNames, this.ctx.projectMode, characterNameById);
    const explicitDialogueText = resolveShotDialogueText(shot, characterNameById);

    // 图片路径：与视频提示词共享同一份剧情 + 台词事实，保证生图锚点和后续视频动作/对白对应。
    const templateKey: PromptTemplateType = 'shot_image_prompt_generation';

    // 前后镜上下文：图片推理之前完全没有邻镜信息（跨镜画面一致性只能靠运气）——
    // 注入上一镜剧情 + 已生成图片提示词（起始姿态/空间关系衔接依据）与下一镜剧情。
    const shotIndex = allEpisodeShots?.findIndex(s => s.id === shot.id) ?? -1;
    const prevShot = shotIndex > 0 ? allEpisodeShots![shotIndex - 1] : undefined;
    const nextShot = shotIndex >= 0 && allEpisodeShots && shotIndex < allEpisodeShots.length - 1
      ? allEpisodeShots[shotIndex + 1]
      : undefined;
    const prevImagePrompt = prevShot?.imagePrompt?.trim();
    const adjacentShotsInfo = (prevShot || nextShot)
      ? [
        `上一镜：${formatShotContextInfo(prevShot, { withPrompt: false, projectMode: this.ctx.projectMode })}${prevImagePrompt ? `\n上一镜图片提示词（起始姿态/空间衔接参考）：${prevImagePrompt.slice(0, 300)}` : ''}`,
        `下一镜：${formatShotContextInfo(nextShot, { withPrompt: false, projectMode: this.ctx.projectMode })}`,
      ].join('\n')
      : '无';

    const templateVariables: Record<string, string> = {
      scriptContent: visualScriptContent,
      dialogueText: formatDialogueTextForPrompt(explicitDialogueText, characterNames, this.ctx.projectMode) || '无',
      dialogueModeDirective,
      // 有定妆照的角色只给名字（外观以参考图为唯一真相）；无定妆照的内联外观设定，
      // 否则每镜外貌都靠 LLM 即兴发挥 → 跨镜变脸
      characters: shotCharacters.length
        ? shotCharacters.map(c => c.media?.costumePhoto
          ? c.name
          : `${c.name}（该角色无参考图，外观设定：${c.prompt?.trim() || '未设定'}）`).join('\n')
        : '无',
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
      adjacentShotsInfo,
      // 阶段 3：让图片提示词模板里也能引用 references 索引表（默认未使用，模板按需渲染）
      referenceTable,
      gridSequenceNotice,
      shotsSection,
    };

    // 排查"合并分镜后推理只剩末尾一句"类问题时的关键日志：把 LLM 实际拿到的 scriptContent
    // 完整打出来，对比 shot.scriptLines 看是否在传输过程中被截断。如果这里看到的剧情是完整的，
    // 但 LLM 输出只回了末尾一段，那是 LLM 模板的"单帧聚焦"行为（参考模板说明），不是数据丢失。
    logger.info('分镜图片提示词推理 - LLM 输入', {
      shotId: shot.id,
      scriptLineCount: shot.scriptLines?.length ?? 0,
      visualScriptContent,
      dialogueText: templateVariables.dialogueText,
      characters: templateVariables.characters,
      scenes: templateVariables.scenes,
      props: templateVariables.props,
    });

    const resolvedPrompt = await resolvePromptTemplate(templateKey, templateVariables);
    const prompt = resolvedPrompt.prompt;

    const resolvedSystemPrompt = await resolvePromptTemplate('shot_prompt_system', {});
    const systemPrompt = resolvedSystemPrompt.prompt;

    // 图片提示词同样追加映射约定，确保 LLM 输出 `@<id> <名称>` 格式（与视频提示词一致）。
    const mappingSchemaNote = await buildMappingSchemaNote(
      shotCharacters,
      shotScenes,
      shotProps,
      referenceBundle,
    );

    const result = await this.ctx.llmProvider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${prompt}\n\n${mappingSchemaNote}` },
    ]);

    // 清理结果
    let cleanedResult = result.trim();
    if (cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) {
      cleanedResult = cleanedResult.slice(1, -1);
    }

    logger.info('分镜图片提示词推理 - LLM 输出', {
      shotId: shot.id,
      outputLength: cleanedResult.length,
      output: cleanedResult,
    });

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
    shotProps: Prop[],
    referenceTable: string,
    gridSequenceNotice: string,
    shotsSection: string,
    referenceBundle: ShotReferenceBundle,
    allEpisodeShots?: Shot[],
  ): Promise<string> {
    const videoMode: ShotVideoMode = shot.videoMode || 'multi-ref';
    const templateKey = VIDEO_TEMPLATE_BY_MODE[videoMode];
    // 时长直接用分镜时长，按项目所选视频模型的 spec 吸附——不再往固定档位上靠
    const durationSeconds = resolvePromptDurationSeconds(shot.duration, this.ctx.itvDurationSpec);

    // 邻接分镜上下文：按需 load 同剧集的所有分镜，定位 prev2 / prev1 / next
    const adjacency = await this.loadAdjacentShots(shot, allEpisodeShots);

    // 视频推理模板（multi / firstframe）当前都不消费 {{stylePrefix}}——风格前缀仅由 TTI
    // 终稿模板使用。这里若仍传 stylePrefix 会触发 PromptTemplate 的"未声明变量"告警。
    const characterNames = shotCharacters.map(character => character.name);
    const characterNameById = new Map(shotCharacters.map(c => [c.id, c.name]));
    const dialogueModeDirective = buildVideoDialogueModeDirective(this.ctx.projectMode);
    const videoScriptContent = buildShotVideoScriptContent(shot, characterNames, this.ctx.projectMode, characterNameById);
    const explicitDialogueText = resolveShotDialogueText(shot, characterNameById);
    const templateVariables: Record<string, string> = {
      durationSeconds: String(durationSeconds),
      scriptContent: videoScriptContent,
      characters: formatCharacterMappingBaseline(shotCharacters, videoMode, referenceBundle),
      scenes: formatSceneMappingBaseline(shotScenes, videoMode),
      props: formatPropMappingBaseline(shotProps, videoMode),
      dialogueModeDirective,
      // 阶段 3：references 索引表 + 九宫格时序约定（grid 模式才有内容，其它模式空串）
      referenceTable,
      gridSequenceNotice,
      // 阶段 A：分镜镜头内容段（normal=2-3 镜头硬切，grid-9=9 帧时序，grid-4=4 帧时序）
      shotsSection,
    };

    if (videoMode === 'multi-ref') {
      // 多参模式：3 段衔接（prev2 / prev1 / next）
      templateVariables.prevShot2Info = formatShotContextInfo(adjacency.prev2, { withPrompt: true, projectMode: this.ctx.projectMode });
      templateVariables.prevShot1Info = formatShotContextInfo(adjacency.prev1, { withPrompt: true, projectMode: this.ctx.projectMode });
      templateVariables.nextShotInfo = formatShotContextInfo(adjacency.next, { withPrompt: false, projectMode: this.ctx.projectMode });
    } else {
      // 首帧延展模式：紧跨度 2 段衔接（prev / next）；prev 来自 prev1
      templateVariables.prevShotInfo = formatShotContextInfo(adjacency.prev1, { withPrompt: true, projectMode: this.ctx.projectMode });
      templateVariables.nextShotInfo = formatShotContextInfo(adjacency.next, { withPrompt: false, projectMode: this.ctx.projectMode });
    }

    const resolvedPrompt = await resolvePromptTemplate(templateKey, templateVariables);
    const userPrompt = resolvedPrompt.prompt;

    const resolvedSystemPrompt = await resolvePromptTemplate('shot_prompt_system', {});
    const systemPrompt = resolvedSystemPrompt.prompt;

    // 视频模板里举例用的 "@Image N" 系符号是占位约定；项目实际使用的 mention 协议是
    // @char_<id> / @scene_<id> / @prop_<id>。在 user 区追加一段映射约定，让 LLM 输出
    // 时直接使用项目协议形式，下游 mention 解析才能正确识别。
    // 同时附带 referenceBundle，让映射约定能根据有图/无图模式注入 @图（锚点）的引用指引。
    const dialogueGuardNote = buildDialogueGuardNote(
      videoScriptContent,
      characterNames,
      explicitDialogueText,
      this.ctx.projectMode,
    );
    // 约束段全部走 inference-directive 模板（PromptStudio 可编辑）。代码只决定注不注入
    // 以及往里塞什么数据；并发解析，避免 5 次串行 IO 拖慢推理入口。
    //  · 空间锚定：有 imagePrompt（锚定图 / 宫格）→ 图就是空间真相；无 → 场景描述作基线
    //  · 尾帧承接：截过上一镜真实尾帧时要求从尾帧末态继续
    //  · 音色映射：绑定音色的角色要带 @char_<id>-音色
    const [
      mappingSchemaNote,
      spatialAnchorDirective,
      tailFrameContinuityDirective,
      videoExtendDirective,
      voiceMentionDirective,
      finalOutputBoundary,
    ] = await Promise.all([
      buildMappingSchemaNote(shotCharacters, shotScenes, shotProps, referenceBundle),
      buildSpatialAnchorDirective(shot, shotScenes, referenceBundle),
      buildTailFrameContinuityDirective(referenceBundle),
      buildVideoExtendDirective(shot, adjacency.prev1),
      buildVoiceMentionDirective(shotCharacters),
      resolveDirective('shot_directive_output_boundary', {
        narrativeModeRule: this.ctx.projectMode === 'drama'
          ? '剧情模式下，第一人称叙述 / 转述句需要改写成真实可拍剧情和少量正确人称对白，禁止把原叙述句逐字塞进对白或旁白。'
          : '解说模式下，不要主动把第一人称解说改成大量角色对白；无显式对白时对白提示词写“无”或只写极短反应。',
      }),
    ]);

    // 与图片路径对齐：把 LLM 实际拿到的 scriptContent 打出来，方便排查"合并分镜后
    // 视频推理只剩末尾一段"类问题。
    logger.info('分镜视频提示词推理 - LLM 输入', {
      shotId: shot.id,
      templateKey,
      scriptLineCount: shot.scriptLines?.length ?? 0,
      videoScriptContent,
      dialogueText: explicitDialogueText,
      videoMode,
      duration: shot.duration,
    });

    const result = await this.ctx.llmProvider.chat([
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          userPrompt,
          dialogueGuardNote,
          mappingSchemaNote,
          spatialAnchorDirective,
          tailFrameContinuityDirective,
          videoExtendDirective,
          voiceMentionDirective,
          finalOutputBoundary,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ]);

    logger.info('分镜视频提示词推理 - LLM 输出', {
      shotId: shot.id,
      outputLength: result.length,
      output: result,
      hasTailFrameDirective: Boolean(tailFrameContinuityDirective),
      tailFrameMentioned: result.includes(PREVIOUS_TAIL_FRAME_MENTION),
    });

    return ensureVoiceMentionsInVideoPrompt(
      ensureVideoExtendInVideoPrompt(
        ensureTailFrameContinuityInVideoPrompt(
          ensureExplicitDialogueInVideoPrompt(
            sanitizeVideoPromptResult(result),
            explicitDialogueText,
            characterNames,
            this.ctx.projectMode,
          ),
          referenceBundle,
        ),
        shot,
      ),
      shotCharacters,
    );
  }

  /**
   * 加载邻接分镜上下文（前 2、前 1、后 1）。仅在剧集模式下生效；
   * 没有 episodeId 或读取失败时返回全空，模板会按"无"占位处理。
   */
  private async loadAdjacentShots(shot: Shot, allShotsOverride?: Shot[]): Promise<{
    prev2?: Shot;
    prev1?: Shot;
    next?: Shot;
  }> {
    const episodeId = this.ctx.episodeId;
    if (!episodeId) return {};
    let allShots: Shot[] = [];
    if (allShotsOverride) {
      allShots = allShotsOverride;
    } else {
      try {
        allShots = await loadEpisodeShots(this.ctx.projectId, episodeId);
      } catch (err) {
        logger.warn('加载邻接分镜失败，按无相邻分镜处理', err);
        return {};
      }
    }
    const idx = allShots.findIndex(s => s.id === shot.id);
    if (idx < 0) return {};
    return {
      prev2: idx >= 2 ? allShots[idx - 2] : undefined,
      prev1: idx >= 1 ? allShots[idx - 1] : undefined,
      next: idx + 1 < allShots.length ? allShots[idx + 1] : undefined,
    };
  }

  private async loadAllEpisodeShots(): Promise<Shot[] | undefined> {
    const episodeId = this.ctx.episodeId;
    if (!episodeId) return undefined;
    try {
      return await loadEpisodeShots(this.ctx.projectId, episodeId);
    } catch (err) {
      logger.warn('加载剧集分镜失败，按无全局分镜上下文处理', err);
      return undefined;
    }
  }

  /**
   * 特殊图片模式：将单个分镜扩展为网格或电影故事板 imagePrompt。
   *  - shot.imageMode === 'grid-4' → 走 grid_4_shot_prompt_generation（4 帧）
   *  - shot.imageMode === 'grid' / 'grid-9' → 走 grid_shot_prompt_generation（9 帧）
   *  - shot.imageMode === 'storyboard' → 走 storyboard_shot_prompt_generation
   */
  async generateSpecialImageShotPrompt(
    shot: Shot,
    characters: Character[],
    stylePrefix: string = '',
    styleSnapshot?: StyleSnapshotLike,
    allShotsOverride?: Shot[],
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
    const projectHeader = await this.buildStoryboardProjectHeaderVariables(shot, shotCharacters, shotScenes);

    // 构建引用列表（统一 `@<id> <名称>` 顺序，与 mappingSchemaNote 输出约定一致）
    const characterRefs = shotCharacters
      .map(c => `${createMentionString('char', c.id)} ${c.name}`)
      .join('\n');
    const sceneRefs = shotScenes
      .map(s => `${createMentionString('scene', s.id)} ${s.name}`)
      .join('\n');
    const propRefs = shotProps
      .map(p => `${createMentionString('prop', p.id)} ${p.name}`)
      .join('\n');
    const shotCharacterNames = shotCharacters.map(character => character.name);
    const shotCharacterNameById = new Map(shotCharacters.map(c => [c.id, c.name]));

    const templateVariables: Record<string, string> = {
      scriptContent: buildShotVideoScriptContent(shot, shotCharacterNames, this.ctx.projectMode, shotCharacterNameById),
      dialogueText: formatDialogueTextForPrompt(resolveShotDialogueText(shot, shotCharacterNameById), shotCharacterNames, this.ctx.projectMode) || '无',
      dialogueModeDirective: buildVideoDialogueModeDirective(this.ctx.projectMode),
      ...projectHeader,
      characters: shotCharacters.map(c => `${c.name}（${c.prompt || ''}）`).join('; ') || '无',
      scenes: shotScenes.map(s => s.name).join(', ') || '无',
      props: shotProps.map(p => p.name).join(', ') || '无',
      emotion: shot.emotion || '中性',
      stylePrefix: resolvedStylePrefix || '',
      characterRefs: characterRefs || '无角色引用',
      sceneRefs: sceneRefs || '无场景引用',
      propRefs: propRefs || '无道具引用',
    };

    let storyboardReferenceBundle: ShotReferenceBundle | undefined;
    if (shot.imageMode === 'storyboard') {
      const allShots = allShotsOverride ?? await this.loadAllEpisodeShots();
      storyboardReferenceBundle = buildShotReferenceBundle({
        shot,
        characters: shotCharacters,
        scenes: shotScenes,
        props: shotProps,
        allShots,
        options: { includePreviousVideoTail: true },
      });
      logger.info('故事板图片提示词参考集合 bundle 已构建', {
        shotId: shot.id,
        summary: summarizeBundle(storyboardReferenceBundle),
      });
      templateVariables.referenceTable = renderShotMentionReferenceTable(storyboardReferenceBundle);
      templateVariables.storyboardContinuityNotice = buildStoryboardContinuityNotice(storyboardReferenceBundle);
    }

    const templateKey: PromptTemplateType = shot.imageMode === 'storyboard'
      ? 'storyboard_shot_prompt_generation'
      : shot.imageMode === 'grid-4'
        ? 'grid_4_shot_prompt_generation'
        : 'grid_shot_prompt_generation';
    const resolvedPrompt = await resolvePromptTemplate(templateKey, templateVariables);

    const resolvedSystemPrompt = await resolvePromptTemplate('shot_prompt_system', {});

    const result = await this.ctx.llmProvider.chat([
      { role: 'system', content: resolvedSystemPrompt.prompt },
      { role: 'user', content: resolvedPrompt.prompt },
    ]);

    let cleanedResult = result.trim();
    if (cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) {
      cleanedResult = cleanedResult.slice(1, -1);
    }
    if (storyboardReferenceBundle) {
      cleanedResult = rewriteProviderImageTokensToMentions(cleanedResult, storyboardReferenceBundle);
      cleanedResult = ensureStoryboardContinuityInPrompt(cleanedResult, storyboardReferenceBundle);
    }

    return cleanedResult;
  }

  private async buildStoryboardProjectHeaderVariables(
    shot: Shot,
    shotCharacters: Character[],
    shotScenes: Scene[],
  ): Promise<Record<string, string>> {
    const fallbackTitle = firstNonEmptyLine(getShotScriptText(shot)) || '当前分镜';
    let projectTitle = this.ctx.projectTitle?.trim() || '';
    let projectType = this.ctx.projectGenre?.trim() || '';

    if (!projectTitle || !projectType) {
      try {
        const project = await loadProject(this.ctx.projectId);
        projectTitle = projectTitle || project?.title?.trim() || '';
        projectType = projectType || project?.genre?.trim() || '';
      } catch (err) {
        logger.warn('加载项目标题信息失败，故事板项目标题区使用兜底值', err);
      }
    }

    const durationSeconds = Number.isFinite(shot.duration) && shot.duration > 0
      ? Math.round(shot.duration)
      : 0;
    const sceneCount = Math.max(shotScenes.length, 1);
    const constraints = [
      '镜头数量由剧情节奏决定',
      `${shotCharacters.length} 个角色`,
      `${sceneCount} 个场景`,
    ].join(' / ');

    return {
      projectTitle: projectTitle || fallbackTitle,
      projectSubtitle: '短片分镜设计',
      shootingFormat: '单机位',
      projectType: projectType || '未指定类型',
      shotDurationSeconds: durationSeconds > 0 ? String(durationSeconds) : '未指定',
      storyboardConstraints: constraints,
    };
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
    options?: ShotPromptGenerationOptions,
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
    const sharedShotsSnapshot = options?.shotsSnapshot ? [...options.shotsSnapshot] : undefined;
    const taskOptions: ShotPromptGenerationOptions | undefined = sharedShotsSnapshot
      ? { ...options, shotsSnapshot: sharedShotsSnapshot }
      : options;

    let completedCount = 0;
    const tasks = shotsToGenerate.map((shot) => async () => {
      const result = await this.generateAndSaveShotPrompt(
        shot,
        stylePrefix,
        generateFlags,
        taskOptions,
        styleSnapshot,
        preloadedCharacters,
      );
      if (sharedShotsSnapshot && result.success) {
        const index = sharedShotsSnapshot.findIndex(item => item.id === result.shotId);
        if (index >= 0) {
          sharedShotsSnapshot[index] = {
            ...sharedShotsSnapshot[index],
            ...(generateFlags?.image !== false ? { imagePrompt: result.imagePrompt } : {}),
            ...(generateFlags?.video !== false ? { videoPrompt: result.videoPrompt } : {}),
          };
        }
      }
      completedCount++;
      onProgress?.(completedCount, shotsToGenerate.length, result);
      return result;
    });

    // 视频提示词推理需要把上一个分镜已生成的 videoPrompt 注入下一个分镜的 prev1Info（保证
    // 空间编号、床位、人物站位等跨镜头一致）。串行执行时会同步更新 sharedShotsSnapshot，
    // 因此前一个分镜刚生成的 videoPrompt 会进入后一个分镜的 prev1Info。
    // → wantsVideo 时强制串行（concurrency=1）；纯图片批量保留 3 并发。
    const concurrency = wantsVideo ? 1 : 3;
    const settled = await runWithConcurrency(tasks, concurrency);

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
    options?: ShotPromptGenerationOptions,
    styleSnapshot?: StyleSnapshotLike,
    preloadedCharacters?: Character[],
  ): Promise<PromptGenerationResult> {
    try {
      const characters = preloadedCharacters || this.ctx.characters;
      let workingShot = shot;
      let imagePrompt: string;
      let videoPrompt: string;

      const isSpecialImageMode = shot.imageMode === 'grid' || shot.imageMode === 'grid-9' || shot.imageMode === 'grid-4' || shot.imageMode === 'storyboard';
      if (isSpecialImageMode && (generateFlags?.image !== false)) {
        // 网格/故事板模式：imagePrompt 使用专用推理模板
        const needImage = options?.force || !shot.imagePrompt?.trim();
        imagePrompt = needImage
          ? await this.generateSpecialImageShotPrompt(shot, characters, stylePrefix, styleSnapshot, options?.shotsSnapshot)
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
/**
 * 视频提示词响应清洗：仅去掉模板包裹符号，不做硬截断。
 * 字数控制交给模板里给 LLM 的软约束（"应尽量精简，强烈建议控制在 4000 以内"），
 * 截断会切掉句尾导致语意残缺，宁可让 LLM 自己写得短一些。
 */
// ========== 模板选择 + 时长解析 ==========

/** 视频推理模板：只按模式分两套，时长不再分档位。 */
const VIDEO_TEMPLATE_BY_MODE: Record<ShotVideoMode, PromptTemplateType> = {
  'multi-ref': 'shot_video_multi',
  'first-frame': 'shot_video_firstframe',
};

/**
 * 推理时长的兜底上下限。
 *
 * 下限 4 秒：低于 4 秒的镜头没有哪个主流视频模型支持，也写不出有动作推进的提示词。
 * 上限 30 秒：目前能力最强的模型一次也就到这个量级；再长应该拆镜而不是硬推。
 * 真正的可用区间由项目所选视频模型的 VideoDurationSpec 决定，这两个值只在
 * spec 缺失（没配渠道 / 解析失败）时兜底。
 */
export const MIN_PROMPT_DURATION_SECONDS = FALLBACK_DURATION_RANGE.min;
export const MAX_PROMPT_DURATION_SECONDS = FALLBACK_DURATION_RANGE.max;

/**
 * 解析送进模板的 `{{durationSeconds}}`。
 *
 * 旧实现是"在 6/10/15/20 四个档位里找最近的一档"——分镜写 12 秒会被推成 10 秒的
 * 协议，写 25 秒会被推成 20 秒，模板里的"总时长 X 秒"跟实际下发给视频模型的时长
 * 对不上。现在直接用分镜时长，按所选视频模型的 spec 吸附到它真正接受的值，
 * 再夹到 4–30 兜底区间。
 */
export function resolvePromptDurationSeconds(
  duration: unknown,
  spec?: VideoDurationSpec,
): number {
  const raw = typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? duration
    : MIN_PROMPT_DURATION_SECONDS;
  const snapped = spec ? clampDurationToSpec(raw, spec) : raw;
  const bounded = Math.min(
    Math.max(snapped, MIN_PROMPT_DURATION_SECONDS),
    MAX_PROMPT_DURATION_SECONDS,
  );
  return Math.round(bounded);
}

/**
 * 把当前分镜的角色清单格式化为"映射基准库"内容。
 *
 * - multi-ref：每个角色一行 `- @char_<id> <name> 音色 @char_<id>-音色：<appearance>`，
 *   与 mappingSchemaNote 约定的 `@<id> <名称>` 输出格式保持一致，避免 LLM 在
 *   baseline / 输出之间换格式；绑定了音色的角色才带 `音色 @char_<id>-音色` 段
 * - first-frame：仅按角色名简短列表（首帧模板里没有 @ 映射段，无需输出占位）
 */
export function formatCharacterMappingBaseline(
  shotCharacters: Character[],
  mode: ShotVideoMode,
  referenceBundle?: ShotReferenceBundle,
): string {
  if (!shotCharacters.length) return '无';
  if (mode === 'first-frame') {
    return shotCharacters.map(c => c.name).join('、');
  }
  return shotCharacters
    .map(c => {
      const mention = createMentionString('char', c.id);
      const identity = formatCharacterIdentityWithVoice(c);
      const hasReferenceImage = referenceBundle?.items.some(
        item => item.kind === 'character' && item.mentionToken === mention,
      ) ?? Boolean(c.media?.costumePhoto);
      if (hasReferenceImage) {
        return `- ${identity}：外观身份以绑定参考图为准；最终提示词只写本镜头动作、姿态、朝向、视线、表情、手部和临时状态变化，禁止展开发型、脸型、眼睛、体型、常规服装颜色材质、常规配饰。`;
      }
      const appearance = (c.prompt || '').trim();
      return `- ${identity}：${appearance || '（无外观描述）'}`;
    })
    .join('\n');
}

/** 角色是否绑定了音色（绑定后视频提示词才写 `@char_<id>-音色`）。 */
function hasBoundVoice(character: Character): boolean {
  return Boolean((character.voiceId || '').trim());
}

/**
 * 角色在提示词里的完整身份串：`@char_<id> <角色名>`；绑定音色的再补 `音色 @char_<id>-音色`。
 * 图（`@char_<id>`）决定长相，音色 mention 决定声音，两者都写全，视频模型和下游
 * 音色编译才能各取所需。
 */
function formatCharacterIdentityWithVoice(character: Character): string {
  const mention = createMentionString('char', character.id);
  const base = `${mention} ${character.name}`;
  if (!hasBoundVoice(character)) return base;
  return `${base} 音色 ${createMentionString('char', character.id, 'voice')}`;
}

/**
 * 视频提示词的"音色映射约束"。
 *
 * 视频词此前只有 `@char_<id>`（图片映射符），没有任何音色映射符，音画同出模型
 * （MiniMax H3 / Seedance 2.0 等）拿不到"谁用哪条音色"的对应关系，只能靠渲染时
 * 追加的【音色参考】兜底，用户在提示词框里也看不见音色绑定。
 *
 * 这里要求推理输出里每个有台词的角色都写全 `@char_<id> <角色名> 音色 @char_<id>-音色`。
 */
async function buildVoiceMentionDirective(shotCharacters: Character[]): Promise<string> {
  const voiced = shotCharacters.filter(hasBoundVoice);
  if (!voiced.length) return '';
  return resolveDirective('shot_directive_voice_mention', {
    voiceRoster: voiced.map(c => `\`${formatCharacterIdentityWithVoice(c)}\``).join('；'),
  });
}

/**
 * 兜底：LLM 漏写音色映射符时补齐。
 *
 * 优先在角色首次出现的 `@char_<id>` 后面就地补 `音色 @char_<id>-音色`（正文里角色
 * 说明段就带上音色）；正文完全没提到该角色时，统一收进末尾的 `音色提示词：` 行，
 * 插在 `精确时长：` 之前，避免破坏"最后一行必须是精确时长"的输出契约。
 */
function ensureVoiceMentionsInVideoPrompt(prompt: string, shotCharacters: Character[]): string {
  const voiced = shotCharacters.filter(hasBoundVoice);
  if (!voiced.length) return prompt;

  let result = prompt;
  const leftovers: string[] = [];
  for (const character of voiced) {
    const voiceMention = createMentionString('char', character.id, 'voice');
    if (result.includes(voiceMention)) continue;
    const mention = createMentionString('char', character.id);
    // 负向前瞻挡住 @char_abc 命中 @char_abcd；名字可有可无（LLM 偶尔只写映射符）
    const pattern = new RegExp(
      `${escapeRegExp(mention)}(?![A-Za-z0-9_-])(\\s*${escapeRegExp(character.name)})?`,
    );
    if (pattern.test(result)) {
      result = result.replace(
        pattern,
        (_match, namePart?: string) => `${mention}${namePart || ` ${character.name}`} 音色 ${voiceMention}`,
      );
      continue;
    }
    leftovers.push(formatCharacterIdentityWithVoice(character));
  }
  if (!leftovers.length) return result;

  const voiceLine = `音色提示词：${leftovers.join('；')}`;
  const lines = result.split('\n');
  const durationLineIndex = lines.findIndex(line => /^\s*精确时长\s*[:：]/.test(line));
  if (durationLineIndex < 0) return `${result}\n${voiceLine}`;
  lines.splice(durationLineIndex, 0, voiceLine);
  return lines.join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      const desc = (s.prompt || '').trim();
      return `- ${mention} ${s.name}：${desc || '（无空间描述）'}`;
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
      return `- ${mention} ${p.name}：${desc || '（无外观描述）'}`;
    })
    .join('\n');
}

function buildStoryboardContinuityNotice(referenceBundle: ShotReferenceBundle): string {
  const current = referenceBundle.items.find(item => item.kind === 'storyboard-anchor');
  const previous = referenceBundle.items.find(item => item.kind === 'previous-storyboard-anchor');
  const lines: string[] = [];

  if (previous) {
    lines.push(`上一故事板参考：\`${previous.mentionToken} ${previous.label}\`。必须继承上一故事板里的主要人物身份、场景结构、色调、光源方向、镜头语言和末态情绪，只推进剧情，不重启世界观。`);
  } else {
    lines.push('上一故事板参考：无。不要虚构上一故事板，也不要输出 @previous_storyboard_anchor。');
  }

  if (current) {
    lines.push(`当前故事板锚定：\`${current.mentionToken} ${current.label}\`。优化或重推时必须保留其核心连续性，只调整当前分镜的故事节奏、面板编排与情绪层次。`);
  } else {
    lines.push('当前故事板锚定：无。首次生成时不要输出 @storyboard_anchor。');
  }

  return lines.join('\n');
}

function ensureStoryboardContinuityInPrompt(
  prompt: string,
  referenceBundle: ShotReferenceBundle,
): string {
  const previous = referenceBundle.items.find(item => item.kind === 'previous-storyboard-anchor');
  if (!previous || !prompt.trim()) return prompt;

  const continuityValue = `${formatItemMentionForEditablePrompt(previous)}，继承上一分镜的场景结构、人物状态、光影色调、镜头语言和末态情绪，只推进当前剧情，不按第一镜重建`;
  let next = prompt
    .replace(/(连续性\s*[：:])\s*[^。\n]*(?:无上一故事板参考|无参考|第一镜建立|全新建立|角色首次登场)[^。\n]*/g, `$1${continuityValue}`)
    .replace(/(上一故事板参考\s*[：:])\s*无[^。\n]*/g, `$1${continuityValue}`)
    .replace(/继承上一故事板无参考[，,、\s]*按第一镜建立/g, continuityValue)
    .replace(/无上一故事板参考/g, continuityValue)
    .replace(/上一故事板无参考/g, continuityValue)
    .replace(/按第一镜建立/g, '以上一故事板为连续性起点推进当前分镜');

  if (!next.includes(previous.mentionToken)) {
    next = `${next.trimEnd()}\n\n连续性：${continuityValue}。`;
  }
  return next;
}

export function rewriteProviderImageTokensToMentions(
  prompt: string,
  referenceBundle: ShotReferenceBundle,
): string {
  if (!prompt || referenceBundle.items.length === 0) return prompt;
  return prompt.replace(/(?:@Image|@图片)\s*(\d+)/g, (full: string, rawIndex: string, offset: number, sourceText: string) => {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index <= 0) return full;
    const item = referenceBundle.items[index - 1];
    if (!item) return '';
    const label = labelForEditableMention(item);
    const includeLabel = label ? !isFollowedBySameLabel(sourceText, offset + full.length, label) : false;
    return formatItemMentionForEditablePrompt(item, includeLabel);
  });
}

function formatItemMentionForEditablePrompt(item: ShotReferenceItem, includeLabel = true): string {
  const mention = item.mentionToken;
  const label = labelForEditableMention(item);
  return includeLabel && label ? `${mention} ${label}` : mention;
}

function labelForEditableMention(item: ShotReferenceItem): string {
  const label = item.label.trim();
  if (!label) return '';
  return label.replace(/^(角色|场景|道具)：/, '').replace(/（.*?）/g, '').trim() || label;
}

function isFollowedBySameLabel(sourceText: string, tokenEnd: number, label: string): boolean {
  const after = sourceText.slice(tokenEnd).replace(/^[ \t\u3000]+/, '');
  return after.startsWith(label);
}

/**
 * 把邻接分镜的剧情和已生成提示词格式化为上下文段落。
 * - withPrompt=true：包含已生成的 videoPrompt（如果有）
 * - withPrompt=false：仅剧情（用于尚未推理的下一镜）
 * 不存在时返回 "无"，模板里的占位会按"无相邻分镜"处理。
 */
function formatShotContextInfo(
  shot: Shot | undefined,
  options: { withPrompt: boolean; projectMode?: ProjectNarrativeMode },
): string {
  if (!shot) return '无';
  const lines: string[] = [];
  const script = buildShotVideoScriptContent(shot, [], options.projectMode ?? 'drama').trim();
  lines.push(`剧情：${script || '（空）'}`);
  if (options.withPrompt) {
    const prompt = (shot.videoPrompt || '').trim();
    lines.push(`已生成提示词：${prompt ? sanitizeAdjacentVideoPromptContext(prompt) : '（尚未生成）'}`);
  }
  return lines.join('\n');
}

function sanitizeAdjacentVideoPromptContext(prompt: string): string {
  return prompt
    .split(/\r?\n/)
    .map(line => {
      if (/^\s*角色提示词\s*[:：]/.test(line)) {
        return '角色提示词：已省略静态外貌描述；只参考上一分镜角色动作、姿态、朝向、视线、表情、手部、持物和临时状态。';
      }
      return line;
    })
    .join('\n')
    .trim();
}


/** 上一分镜真实视频尾帧的 mention token / 正文里跟在 token 后面的中文名。 */
const PREVIOUS_TAIL_FRAME_MENTION = createMentionString('previous_tail', 'anchor');
const PREVIOUS_TAIL_FRAME_LABEL = '上一分镜尾帧';
/** 承接句前缀，兜底补写与"是否已承接"判定共用同一个字面量。 */
const TAIL_FRAME_CONTINUITY_PREFIX = '承接上一分镜';

/** bundle 里是否含"上一分镜真实视频尾帧"这一项（用户已截取并绑定继承）。 */
function findPreviousTailFrameItem(bundle: ShotReferenceBundle): ShotReferenceItem | undefined {
  return bundle.items.find(item => item.kind === 'previous-video-tail');
}

/**
 * 视频提示词的"尾帧承接约束"。
 *
 * 用户在分镜上截取了上一镜真实视频尾帧后，尾帧只是被塞进了 references 索引表，
 * 推理侧没有任何指令要求 LLM 用它 —— 加上 mappingSchemaNote 那句"只能使用清单里
 * 列出的对象"，模型反而会主动回避 `@previous_tail_frame`，结果推理出来的视频词
 * 完全不承接上一镜（人物站位 / 朝向 / 动作末态被重置成新的起始状态）。
 *
 * 承接关系只需要**一处**：首行承接句。早期版本还要求画面 / 角色 / 呼应字段各重复
 * 一次，实测一条提示词里 `@previous_tail_frame 上一分镜尾帧` 会出现 5-6 次，纯属
 * 浪费 token 且摊薄模型注意力 —— 现在明确限定"全文只出现一次"，
 * 多写的由 dedupePreviousTailFrameMentions 降级成纯文本。
 */
async function buildTailFrameContinuityDirective(referenceBundle: ShotReferenceBundle): Promise<string> {
  if (!findPreviousTailFrameItem(referenceBundle)) return '';
  return resolveDirective('shot_directive_tail_frame', {
    tailFrameMention: PREVIOUS_TAIL_FRAME_MENTION,
    tailFrameLabel: PREVIOUS_TAIL_FRAME_LABEL,
  });
}

/**
 * 解析一段「推理约束段」模板。
 *
 * 这些段落用户可以在 PromptStudio 里改；解析失败（模板被删 / 变量写错）不能连带
 * 让整条推理挂掉——退化成不注入该段，并留日志。
 */
async function resolveDirective(
  templateId: PromptTemplateType,
  variables: Record<string, string>,
): Promise<string> {
  try {
    const resolved = await resolvePromptTemplate(templateId, variables);
    return resolved.prompt.trim();
  } catch (err) {
    logger.warn('推理约束段解析失败，本次跳过该段', {
      templateId,
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

/**
 * 视频提示词的"延长承接约束"。
 *
 * 与尾帧承接互斥：尾帧模式给的是一张图（锁死起始画面），延长模式给的是整段上一镜
 * 成片（运镜惯性、动作节奏、光影漂移都由模型自己从视频里读）。两者同时注入会让
 * 模型在"从图起手"和"从视频续拍"之间摇摆，所以由调用方二选一。
 */
async function buildVideoExtendDirective(shot: Shot, previousShot?: Shot): Promise<string> {
  if (!usesPreviousVideoExtend(shot)) return '';
  const previousDuration = typeof previousShot?.duration === 'number' && previousShot.duration > 0
    ? `${Math.round(previousShot.duration)} 秒处`
    : '结尾处';
  return resolveDirective('shot_directive_video_extend', {
    previousVideoMention: PREVIOUS_VIDEO_MENTION,
    previousVideoLabel: PREVIOUS_VIDEO_LABEL,
    durationHint: previousDuration,
  });
}

/** 延长模式同样只允许引用一次；多余的降级成纯文本，理由同尾帧去重。 */
function dedupePreviousVideoMentions(prompt: string): string {
  const pattern = new RegExp(
    `${escapeRegExp(PREVIOUS_VIDEO_MENTION)}(?:\\s*${escapeRegExp(PREVIOUS_VIDEO_LABEL)})?`,
    'g',
  );
  let seen = false;
  return prompt.replace(pattern, (match) => {
    if (!seen) {
      seen = true;
      return match;
    }
    return '上一镜';
  });
}

/**
 * 兜底：延长模式下 LLM 漏写延长声明时，在最前面补一行。
 * 落库的可编辑提示词自带声明，用户在提示词框里能直接看到 / 改这条承接关系。
 */
function ensureVideoExtendInVideoPrompt(prompt: string, shot: Shot): string {
  if (!usesPreviousVideoExtend(shot)) return prompt;
  const trimmed = prompt.trim();
  if (!trimmed) return prompt;
  if (trimmed.includes(PREVIOUS_VIDEO_MENTION)) return dedupePreviousVideoMentions(trimmed);
  return [
    `延长上一分镜视频：${PREVIOUS_VIDEO_MENTION} ${PREVIOUS_VIDEO_LABEL} —— 机位、景别、运镜方向与光影全部延续上一镜，不重新开场、不重演已完成的动作，只把剧情继续往前推进。`,
    trimmed,
  ].join('\n');
}

/**
 * 把首行承接句之后重复出现的 `@previous_tail_frame` 降级成纯文本「上一镜尾帧」。
 *
 * 尾帧在 references 里只占一个位置，重复引用不会带来任何新信息：编译后是同一个
 * `@Image N`，却要多花 5-6 份 token，还会让模型把注意力压在"回看上一镜"而不是
 * "推进本镜动作"。保留纯文字表述，语义读起来仍然连贯。
 */
function dedupePreviousTailFrameMentions(prompt: string): string {
  const pattern = new RegExp(
    `${escapeRegExp(PREVIOUS_TAIL_FRAME_MENTION)}(?:\\s*${escapeRegExp(PREVIOUS_TAIL_FRAME_LABEL)})?`,
    'g',
  );
  let seen = false;
  return prompt.replace(pattern, (match) => {
    if (!seen) {
      seen = true;
      return match;
    }
    return '上一镜尾帧';
  });
}

/**
 * 兜底：LLM 没写承接句时，在推理结果最前面补一行。
 *
 * 这样落库的可编辑视频提示词本身就带 `@previous_tail_frame`，用户在提示词框里能
 * 直接看到 / 编辑这条承接关系；下游 shotRenderWorkflow 的同名兜底就不会再重复追加。
 */
function ensureTailFrameContinuityInVideoPrompt(
  prompt: string,
  referenceBundle: ShotReferenceBundle,
): string {
  if (!findPreviousTailFrameItem(referenceBundle)) return prompt;
  const trimmed = prompt.trim();
  if (!trimmed) return prompt;
  if (trimmed.includes(PREVIOUS_TAIL_FRAME_MENTION)) return dedupePreviousTailFrameMentions(trimmed);
  return [
    `${TAIL_FRAME_CONTINUITY_PREFIX}：${PREVIOUS_TAIL_FRAME_MENTION} ${PREVIOUS_TAIL_FRAME_LABEL} —— 人物站位、朝向、动作末态、视线、持物与场景光影全部从尾帧自然继续，不要重置为新的起始状态。`,
    trimmed,
  ].join('\n');
}

/**
 * 视频提示词的"空间锚定约束"：根据本分镜是否有锚定图（imagePrompt）+ 是否 @了场景，
 * 输出对应的空间真相提示，统一抑制 LLM 凭空编造空间方位。
 *
 * 三个分支：
 * 1) 有 imagePrompt（锚定图 / 宫格）：图本身是空间真相 → 严格禁止写方位词，
 *    让 LLM 把视频提示词收敛到动作 / 运镜 / 节奏 / 情绪 / 时间推进。
 * 2) 无 imagePrompt 但 @了场景（多参考模式）：画面由 @scene / @char / @prop
 *    引用图组合构成 → 把场景描述作为空间基线，禁止编造场景描述以外的空间关系。
 * 3) 无 imagePrompt 也没场景：返回空串（无可锚定的空间信息，让模型自由发挥）。
 *
 * 只要 shot 关联了 @scene，无论是否有 imagePrompt，都会把场景描述继承进来作为
 * 辅助空间锚点 —— 防止 AI 在场景图细节之外猜测房间布局 / 家具位置 / 距离关系。
 */
async function buildSpatialAnchorDirective(
  shot: Shot,
  shotScenes: Scene[],
  referenceBundle: ShotReferenceBundle,
): Promise<string> {
  const hasGeneratedShotImage = referenceBundle.hasShotImage;
  const hasScenes = shotScenes.length > 0;
  if (!hasGeneratedShotImage && !hasScenes) return '';

  const sceneBaseline = hasScenes
    ? [
      '',
      hasGeneratedShotImage
        ? '**场景空间基线（继承自 @scene，作为对生成图的语义辅助；以图为准，下方文字仅用于理解场景类型，不要复述）：**'
        : '**场景空间基线（继承自 @scene，本分镜的空间真相；只能引用此处出现过的区域 / 标志物作为站位参照，禁止编造）：**',
      ...shotScenes.map((scene) => {
        const mention = createMentionString('scene', scene.id);
        const desc = (scene.prompt || '').trim();
        return `  - ${mention} ${scene.name}：${desc || '（无空间描述，此场景无法提供空间锚点）'}`;
      }),
    ].join('\n')
    : '';

  if (!hasGeneratedShotImage) {
    return resolveDirective('shot_directive_spatial_multiref', { sceneBaseline });
  }

  const isGridMode = shot.imageMode === 'grid'
    || shot.imageMode === 'grid-9'
    || shot.imageMode === 'grid-4';
  const isStoryboardMode = shot.imageMode === 'storyboard';

  return resolveDirective('shot_directive_spatial_anchored', {
    gridModeRule: isGridMode
      ? [
        '',
        '**宫格模式（关键）**：图像提示词已按 cell 分别写好每一格的画面（cell 1 = 镜头 01、cell 2 = 镜头 02、cell 3 = 镜头 03、cell 4 = 镜头 04 ……）。视频提示词的**镜头 N 起始姿态 = 图像提示词镜头 N 的姿态描述**，必须严格对应：',
        '  · 不得在 cell 之间互换姿态（例如把镜头 01 的"坐"挪到镜头 03）；',
        '  · 不得引入图像提示词没规定过的中间状态；',
        '  · cell 之间的过渡只能靠运镜（推 / 拉 / 摇 / 切）与时间推进。',
        '',
      ].join('\n')
      : '',
    storyboardModeRule: isStoryboardMode
      ? [
        '',
        '**故事板模式（关键）**：当前图是多面板制作方案板，不是单一首帧。视频提示词必须从故事板中提炼当前分镜的关键动作链与情绪推进，不能把整张故事板版式、边框、箭头或制作表文本当作视频画面内容。',
        '  · 保持人物、场景、道具和光影连续性；',
        '  · 只使用故事板中的剧情面板作为参考，不生成面板边框、编号、说明文字；',
        '  · 若有上一故事板参考，只继承连续性，不重复上一分镜已完成的动作。',
        '',
      ].join('\n')
      : '',
    imagePromptText: (shot.imagePrompt || '').trim(),
    sceneBaseline,
  });
}

/**
 * 视频推理模板示例使用 "@Image 1 / @Image 2" 等占位约定；项目实际使用 mention 协议
 * (@char_<id> / @scene_<id> / @prop_<id> / @shot_anchor / @grid_anchor)。本约定告诉 LLM：
 *
 * - 写正文时使用**语义前缀**：`@角色 <名称>` / `@场景 <名称>` / `@道具 <名称>` / `@图`，
 *   而不是模板示例里的 `<名称> @Image N` 或 `@（角色场景道具）<名称>` 写法 —— 后者让模型混淆
 *   "图片位置编号"和"语义对象"。
 * - 每个语义前缀后必须**紧跟一次** mention 协议字符串（@char_<id> / @scene_<id> /
 *   @prop_<id> / @shot_anchor / @grid_anchor）作为机器可读 ID，下游 compile 才能把它
 *   翻译成 references 中对应的 @Image N 位置。
 * - 有图模式（含 shot-anchor / grid-anchor）下额外强调：必须在每个镜头描述中至少出现
 *   一次 `@图 @shot_anchor`（或 `@图 @grid_anchor`），把锚定图作为剧情连贯性基准。
 */
async function buildMappingSchemaNote(
  shotCharacters: Character[],
  shotScenes: Scene[],
  shotProps: Prop[],
  referenceBundle: ShotReferenceBundle,
): Promise<string> {
  const anchorItem = referenceBundle.items.find(
    item => item.kind === 'shot-anchor' || item.kind === 'grid-anchor' || item.kind === 'storyboard-anchor',
  );
  const tailFrameItem = findPreviousTailFrameItem(referenceBundle);
  const hasVoicedCharacter = shotCharacters.some(hasBoundVoice);

  const mentionFormatLines = [
    '   - 角色：`@char_<id> <角色名>`，例如 `@char_abc123 周明`',
    '   - 场景：`@scene_<id> <场景名>`，例如 `@scene_xyz789 教室`',
    '   - 道具：`@prop_<id> <道具名>`，例如 `@prop_def456 钥匙`',
    ...(hasVoicedCharacter
      ? ['   - 角色音色：`@char_<id>-音色`（跟在角色身份后面写成 `@char_abc123 周明 音色 @char_abc123-音色`）']
      : []),
    ...(anchorItem ? [`   - 分镜锚定图：\`${anchorItem.mentionToken} ${anchorItem.label}\``] : []),
    ...(tailFrameItem
      ? [`   - 上一分镜尾帧：\`${PREVIOUS_TAIL_FRAME_MENTION} ${PREVIOUS_TAIL_FRAME_LABEL}\``]
      : []),
  ].join('\n');

  const mappingList = [
    // 角色带上音色映射符：`@char_<id>` 是形象图，`@char_<id>-音色` 是声音，两者都在清单里
    // 列出来，"只能使用清单内对象"才不会把音色映射符一起挡掉。
    formatMappingList('角色', shotCharacters.map(c => ({
      name: c.name,
      mention: createMentionString('char', c.id),
      suffix: hasBoundVoice(c) ? ` 音色 ${createMentionString('char', c.id, 'voice')}` : '',
    }))),
    formatMappingList('场景', shotScenes.map(s => ({ name: s.name, mention: createMentionString('scene', s.id) }))),
    formatMappingList('道具', shotProps.map(p => ({ name: p.name, mention: createMentionString('prop', p.id) }))),
    ...(anchorItem ? [`- 分镜锚定图：\`${anchorItem.mentionToken} ${anchorItem.label}\``] : []),
    ...(tailFrameItem
      ? [`- 上一分镜尾帧：\`${PREVIOUS_TAIL_FRAME_MENTION} ${PREVIOUS_TAIL_FRAME_LABEL}\``]
      : []),
  ].join('\n');

  return resolveDirective('shot_directive_mapping_schema', {
    mentionFormatLines,
    anchorModeRule: anchorItem
      ? `**本分镜处于"有图模式"**：每个镜头描述至少出现一次 \`${anchorItem.mentionToken} ${anchorItem.label}\`，用作画面 / 姿态 / 空间 / 光影的锚定基准；若是九宫格 / 四宫格锚定，需说明本镜头对应锚定图中的哪个 cell。`
      : '本分镜处于"无图模式"（references 中没有分镜锚定图），不要使用 `@shot_anchor` / `@grid_anchor` / `@storyboard_anchor`，所有视觉锚点完全靠 `@char_<id>` / `@scene_<id>` / `@prop_<id>` 描述。',
    mappingList,
  });
}

function formatMappingList(
  label: string,
  entries: Array<{ name: string; mention: string; suffix?: string }>,
): string {
  if (entries.length === 0) return `- ${label}：（本分镜未绑定）`;
  const items = entries.map(e => `\`${e.mention} ${e.name}${e.suffix || ''}\``).join('；');
  return `- ${label}：${items}`;
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
  options?: ShotPromptGenerationOptions,
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
  options?: ShotPromptGenerationOptions,
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
    metadata: {
      shotCount: shots.length,
      // shotIds 提供给 UI 在切走再回来时复原 per-shot loading 指示
      shotIds: shots.map(s => s.id),
      force: options?.force ?? false,
    },
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
