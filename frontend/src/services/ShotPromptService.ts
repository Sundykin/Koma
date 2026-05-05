/**
 * 分镜提示词生成服务
 * 独立于分镜拆解，支持单条和批量生成
 * v2: 支持 force 强制重新生成，分离 image/video 任务
 */
import type { Prop, Shot, Character, Scene, ShotVideoMode } from '../types';
import { getShotScriptText } from '../types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import type { PromptTemplateType } from '../store/promptTemplates';
import { loadScenes, loadProps, updateShot, loadEpisodeShots } from '../store/projectStore';
import { createLogger } from '../store/logger';
import { createMentionString } from '../editor/mentionTypes';
import { runWithConcurrency } from '../utils/concurrency';
import type { StyleSnapshotLike } from '../utils/promptNormalize';
import { runWithTask } from './taskRunner';
import type { TaskSubType } from './TaskManager';
import { buildShotReferenceBundle } from './shotReference/builder';
import {
  renderGridSequenceNotice,
  renderShotReferenceTable,
  summarizeBundle,
} from './shotReference/render';
import { decideShotsMode, renderShotsSection } from './shotReference/shotsOutputFormat';
import type { ShotReferenceBundle } from './shotReference/types';

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
    // 渲染——保证 LLM 推理出来的 @图片N 跟下游 provider 请求的 references 数组
    // 位置一一对应。
    const referenceBundle = buildShotReferenceBundle({
      shot,
      characters: shotCharacters,
      scenes: shotScenes,
      props: shotProps,
    });
    const referenceTable = renderShotReferenceTable(referenceBundle);
    const gridSequenceNotice = renderGridSequenceNotice(referenceBundle);

    // 阶段 A：shots 段从硬骨架抽成 {{shotsSection}}。grid 模式渲染 N 镜头硬切骨架
    // （grid-9 用 9，grid-4 用 4），normal 模式渲染 2-3 镜头硬切骨架。
    // 直接从 shot.imageMode 派生 explicitCellCount（用户意图），独立于锚定图是否已生成。
    // 这样用户切到 grid-4 但还没生成 3×3 / 2×2 图时，shotsSection 也能按 4 镜头渲染。
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

    // 按需并行生成
    const promises: Promise<string>[] = [];
    if (needImage) {
      promises.push(this.generatePromptByType(
        'image', shot, shotCharacters, shotScenes, shotProps,
        characterRefs, sceneRefs, propRefs, resolvedStylePrefix,
        referenceTable, gridSequenceNotice, shotsSection, referenceBundle,
      ));
    }
    if (needVideo) {
      promises.push(this.generatePromptByType(
        'video', shot, shotCharacters, shotScenes, shotProps,
        characterRefs, sceneRefs, propRefs, resolvedStylePrefix,
        referenceTable, gridSequenceNotice, shotsSection, referenceBundle,
      ));
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
    shotProps: Prop[],
    characterRefs: string,
    sceneRefs: string,
    propRefs: string,
    stylePrefix: string,
    referenceTable: string,
    gridSequenceNotice: string,
    shotsSection: string,
    referenceBundle: ShotReferenceBundle,
  ): Promise<string> {
    // 视频路径：按 (duration, videoMode) 选择 5 个新模板之一，附带上下文衔接
    if (type === 'video') {
      return this.generateVideoPrompt(
        shot, shotCharacters, shotScenes, shotProps,
        referenceTable, gridSequenceNotice, shotsSection, referenceBundle,
      );
    }

    // 图片路径：仍使用旧通用模板
    const templateKey: PromptTemplateType = 'shot_image_prompt_generation';
    const templateVariables: Record<string, string> = {
      scriptContent: getShotScriptText(shot),
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
      // 阶段 3：让图片提示词模板里也能引用 references 索引表（默认未使用，模板按需渲染）
      referenceTable,
      gridSequenceNotice,
      shotsSection,
    };
    const resolvedPrompt = await resolvePromptTemplate(templateKey, templateVariables);
    const prompt = resolvedPrompt.prompt;

    const resolvedSystemPrompt = await resolvePromptTemplate('shot_prompt_system', {});
    const systemPrompt = resolvedSystemPrompt.prompt;

    // 图片提示词同样追加映射约定，确保 LLM 输出 `@<id> <名称>` 格式（与视频提示词一致）。
    const mappingSchemaNote = buildMappingSchemaNote(
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
  ): Promise<string> {
    const videoMode: ShotVideoMode = shot.videoMode || 'multi-ref';
    const projectSelections = this.ctx.videoPromptDurationSelections;
    const modeSelections = videoMode === 'first-frame'
      ? projectSelections?.firstFrame
      : projectSelections?.multiRef;
    const templateKey = selectVideoTemplateKey(shot.duration, videoMode, modeSelections);

    // 邻接分镜上下文：按需 load 同剧集的所有分镜，定位 prev2 / prev1 / next
    const adjacency = await this.loadAdjacentShots(shot);

    // 视频推理模板（multi / firstframe）当前都不消费 {{stylePrefix}}——风格前缀仅由 TTI
    // 终稿模板使用。这里若仍传 stylePrefix 会触发 PromptTemplate 的"未声明变量"告警。
    const templateVariables: Record<string, string> = {
      scriptContent: getShotScriptText(shot) || '',
      characters: formatCharacterMappingBaseline(shotCharacters, videoMode),
      scenes: formatSceneMappingBaseline(shotScenes, videoMode),
      props: formatPropMappingBaseline(shotProps, videoMode),
      // 阶段 3：references 索引表 + 九宫格时序约定（grid 模式才有内容，其它模式空串）
      referenceTable,
      gridSequenceNotice,
      // 阶段 A：分镜镜头内容段（normal=2-3 镜头硬切，grid-9=9 帧时序，grid-4=4 帧时序）
      shotsSection,
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
    // 同时附带 referenceBundle，让映射约定能根据有图/无图模式注入 @图（锚点）的引用指引。
    const mappingSchemaNote = buildMappingSchemaNote(
      shotCharacters,
      shotScenes,
      shotProps,
      referenceBundle,
    );
    const dialogueGuardNote = buildDialogueGuardNote(
      getShotScriptText(shot) || '',
      shotCharacters.map(character => character.name),
    );
    // 空间锚定约束：
    //  · 有 imagePrompt（锚定图 / 宫格）→ 图就是空间真相，让 LLM 不要写方位词
    //  · 无 imagePrompt（多参考模式）→ 由 @scene / @char / @prop 引用图组合构成画面，
    //    把场景描述作为空间基线，禁止 AI 凭空编造空间关系
    // 两种情况下，只要 shot 引用了 @scene，都把场景描述继承进来作为空间真相
    const spatialAnchorDirective = buildSpatialAnchorDirective(shot, shotScenes);

    const result = await this.ctx.llmProvider.chat([
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [userPrompt, dialogueGuardNote, mappingSchemaNote, spatialAnchorDirective]
          .filter(Boolean)
          .join('\n\n'),
      },
    ]);

    return sanitizeVideoPromptResult(result);
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
   * 网格模式：将单个分镜扩展为 N 个连续画面的 imagePrompt。
   *  - shot.imageMode === 'grid-4' → 走 grid_4_shot_prompt_generation（4 帧）
   *  - shot.imageMode === 'grid' / 'grid-9' / 默认 → 走 grid_shot_prompt_generation（9 帧）
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

    const templateVariables: Record<string, string> = {
      scriptContent: getShotScriptText(shot),
      characters: shotCharacters.map(c => `${c.name}（${c.appearance || c.description || ''}）`).join('; ') || '无',
      scenes: shotScenes.map(s => s.name).join(', ') || '无',
      props: shotProps.map(p => p.name).join(', ') || '无',
      emotion: shot.emotion || '中性',
      stylePrefix: resolvedStylePrefix || '',
      characterRefs: characterRefs || '无角色引用',
      sceneRefs: sceneRefs || '无场景引用',
      propRefs: propRefs || '无道具引用',
    };

    const gridTemplateKey: PromptTemplateType = shot.imageMode === 'grid-4'
      ? 'grid_4_shot_prompt_generation'
      : 'grid_shot_prompt_generation';
    const resolvedPrompt = await resolvePromptTemplate(gridTemplateKey, templateVariables);

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

    // 视频提示词推理需要把上一个分镜已生成的 videoPrompt 注入下一个分镜的 prev1Info（保证
    // 空间编号、床位、人物站位等跨镜头一致）。loadAdjacentShots 是从 SQLite 读最新状态的，
    // 因此只要前一个 generateAndSaveShotPrompt 的 updateShot 完成后再启动下一个，prev1
    // 的 withPrompt 上下文就是真实的、刚生成的内容。
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

      const isGridMode = shot.imageMode === 'grid' || shot.imageMode === 'grid-9' || shot.imageMode === 'grid-4';
      const needsGridVideoPrompt = generateFlags?.video ?? !shot.videoPrompt?.trim();
      if (isGridMode && needsGridVideoPrompt && !shot.imagePrompt?.trim()) {
        prerequisiteGridImagePrompt = await this.generateGridShotPrompt(shot, characters, stylePrefix, styleSnapshot);
        workingShot = {
          ...shot,
          imagePrompt: prerequisiteGridImagePrompt,
        };
      }

      if (isGridMode && (generateFlags?.image !== false)) {
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
/**
 * 视频提示词响应清洗：仅去掉模板包裹符号，不做硬截断。
 * 字数控制交给模板里给 LLM 的软约束（"应尽量精简，强烈建议控制在 4000 以内"），
 * 截断会切掉句尾导致语意残缺，宁可让 LLM 自己写得短一些。
 */
function sanitizeVideoPromptResult(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/_::~OUTPUT_START::~_/g, '');
  s = s.replace(/_::~OUTPUT_END::~_/g, '');
  s = s.replace(/^[ \t]*Grok视频生成\d+秒分镜单元【[^】]*】[ \t]*\r?\n?/gm, '');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

// ========== 模板池 + 档位选择 ==========

/**
 * 模板池：按 (mode × 时长) 维护对应的 PromptTemplateType。
 * 时长档位是模板的"内置档位"，与视频模型 spec（如 grok enum / 即梦 range）独立。
 *
 *   - multi-ref：6 / 10 / 15 / 20s（4 档）
 *   - first-frame：6 / 10 / 16 / 20s（4 档）
 *
 * 项目级配置（ProjectMeta.videoPromptDurationSelections）从中各自勾选启用的档位；
 * 默认全选。运行时按 shot.duration 在勾选档位中找最近的档位匹配模板，避免落空。
 */
export const VIDEO_TEMPLATE_BUCKETS = {
  'multi-ref': [
    { duration: 6, key: 'shot_video_6s_multi' as const },
    { duration: 10, key: 'shot_video_10s_multi' as const },
    { duration: 15, key: 'shot_video_15s_multi' as const },
    { duration: 20, key: 'shot_video_20s_multi' as const },
  ],
  'first-frame': [
    { duration: 6, key: 'shot_video_6s_firstframe' as const },
    { duration: 10, key: 'shot_video_10s_firstframe' as const },
    { duration: 16, key: 'shot_video_16s_firstframe' as const },
    { duration: 20, key: 'shot_video_20s_firstframe' as const },
  ],
} as const;

/** 默认勾选 = 当前模式下的全部档位 */
export function getDefaultVideoTemplateSelections(mode: ShotVideoMode): number[] {
  return VIDEO_TEMPLATE_BUCKETS[mode].map((b) => b.duration);
}

/**
 * 选模板：在 mode 对应的模板池中，按"项目级勾选档位"过滤后，找跟 shot.duration
 * 距离最近的档位。距离平局时取较小档位（避免不必要的拉长）。
 *
 * 当 selections 为空 / 未提供 / 与当前模板池没有交集时，回退到模式默认全选档位 —
 * 防止因配置异常导致落空。
 */
function selectVideoTemplateKey(
  duration: number,
  mode: ShotVideoMode,
  selections?: number[],
): PromptTemplateType {
  const bucket = VIDEO_TEMPLATE_BUCKETS[mode];
  const allDurations = bucket.map((b) => b.duration);
  const requested = Array.isArray(selections) && selections.length > 0
    ? selections.filter((d) => allDurations.includes(d))
    : [];
  const enabled = requested.length > 0 ? requested : allDurations;
  const target = typeof duration === 'number' && duration > 0 ? duration : 6;

  // 在 enabled 中找最近的档位；平局取较小档位
  let best = enabled[0];
  let bestDist = Math.abs(best - target);
  for (const d of enabled.slice(1)) {
    const dist = Math.abs(d - target);
    if (dist < bestDist || (dist === bestDist && d < best)) {
      best = d;
      bestDist = dist;
    }
  }
  const matched = bucket.find((b) => b.duration === best);
  if (matched) return matched.key;
  // 理论上不会到这（enabled 始终命中 bucket 至少 1 项），保留兜底
  return bucket[0].key;
}

/**
 * 把当前分镜的角色清单格式化为"映射基准库"内容。
 *
 * - multi-ref：每个角色一行 `- @char_<id> <name>：<appearance>`，与 mappingSchemaNote
 *   约定的 `@<id> <名称>` 输出格式保持一致，避免 LLM 在 baseline / 输出之间换格式
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
      return `- ${mention} ${c.name}：${appearance || '（无外观描述）'}`;
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
  const script = (getShotScriptText(shot) || '').trim();
  lines.push(`剧情：${script || '（空）'}`);
  if (options.withPrompt) {
    const prompt = (shot.videoPrompt || '').trim();
    lines.push(`已生成提示词：${prompt || '（尚未生成）'}`);
  }
  return lines.join('\n');
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDialogueText(text: string): string {
  return text
    .trim()
    .replace(/^[“”「」『』"']+|[“”「」『』"']+$/g, '')
    .trim();
}

function pushUniqueDialogue(target: string[], text: string | undefined): void {
  const normalized = normalizeDialogueText(text || '');
  if (!normalized || target.includes(normalized)) return;
  target.push(normalized);
}

function extractExplicitDialogueEvidence(
  scriptContent: string,
  characterNames: string[],
): { spoken: string[]; voiceover: string[]; commentary: string[] } {
  const spoken: string[] = [];
  const voiceover: string[] = [];
  // 第三方旁观者引语：社交评论 / 弹幕 / 字幕 / 新闻 / 短信 / 微博等。**绝对不是主角口播台词**，
  // 单独收集后告诉 LLM 不要把它们当作角色开口内容。
  const commentary: string[] = [];
  const lines = scriptContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const sortedNames = characterNames
    .map(name => name.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const speakerPattern = sortedNames.length > 0
    ? new RegExp(`^(?:${sortedNames.map(escapeRegex).join('|')})\\s*[\uff1a:]\\s*(.+)$`)
    : null;
  const voiceoverPattern = /^(?:OS|OV|旁白|画外音|内心OS|内心独白|内心旁白)\s*[\uff1a:]\s*(.+)$/i;
  // 第三方旁观者前缀：行首命中即为评论 / 弹幕 / 字幕等，跳过台词归类
  const commentaryLinePattern = /^(?:网友评论|网友|评论区|评论|弹幕|留言|短评|跟帖|回帖|微博|朋友圈|微信群|微信|QQ群|社交媒体|社交平台|字幕|标题|片头|片尾|新闻|播报|广播|公告|通知|短信|消息|推送|系统提示|系统提示音|提示音|背景音|环境音)\s*[\uff1a:]\s*(.+)$/i;
  const commentaryPrefixForQuote = /(?:网友评论|网友|评论区|评论|弹幕|留言|短评|跟帖|回帖|微博|朋友圈|微信群|微信|社交媒体|字幕|标题|片头|片尾|新闻|播报|广播|公告|通知|短信|消息|推送|系统提示|提示音|背景音|环境音)\s*[\uff1a:]?\s*$/;
  const speechCuePattern = /(?:自言自语|喃喃|嘀咕|低声说|轻声说|沉声说|说道|说|问道|问|答道|答|喊道|喊|叫道|叫)\s*[\uff1a:,\uff0c]\s*(.+)$/;

  for (const line of lines) {
    // 第三方评论 / 弹幕 / 字幕优先判定——命中后不再走台词归类
    const commentaryMatch = line.match(commentaryLinePattern);
    if (commentaryMatch) {
      pushUniqueDialogue(commentary, commentaryMatch[1]);
      continue;
    }

    const voiceoverMatch = line.match(voiceoverPattern);
    if (voiceoverMatch) {
      pushUniqueDialogue(voiceover, voiceoverMatch[1]);
      continue;
    }

    const speakerMatch = speakerPattern?.exec(line);
    if (speakerMatch) {
      pushUniqueDialogue(spoken, speakerMatch[1]);
      continue;
    }

    const speechCueMatch = line.match(speechCuePattern);
    if (speechCueMatch) {
      pushUniqueDialogue(spoken, speechCueMatch[1]);
    }
  }

  for (const match of scriptContent.matchAll(/[\u201c\u300c\u300e"]([^\u201c\u201d\u300c\u300d\u300e"\r\n]{1,80})[\u201d\u300d\u300f"]/g)) {
    const quoted = normalizeDialogueText(match[1] || '');
    if (!quoted) continue;
    const idx = match.index ?? 0;
    // 前缀范围扩大到 80 字符，覆盖"前文：网友评论：『xxx』"这种长前缀写法
    const prefix = scriptContent.slice(Math.max(0, idx - 80), idx);
    if (commentaryPrefixForQuote.test(prefix)) {
      pushUniqueDialogue(commentary, quoted);
      continue;
    }
    if (/(?:OS|OV|旁白|画外音|内心OS|内心独白|内心旁白)/i.test(prefix)) {
      pushUniqueDialogue(voiceover, quoted);
      continue;
    }
    pushUniqueDialogue(spoken, quoted);
  }

  return { spoken, voiceover, commentary };
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
function buildSpatialAnchorDirective(
  shot: Shot,
  shotScenes: Scene[],
): string {
  const hasImagePrompt = !!(shot.imagePrompt || '').trim();
  const hasScenes = shotScenes.length > 0;
  if (!hasImagePrompt && !hasScenes) return '';

  const isGridMode = shot.imageMode === 'grid'
    || shot.imageMode === 'grid-9'
    || shot.imageMode === 'grid-4';

  const lines: string[] = [];

  if (hasImagePrompt) {
    lines.push('【图像锚定约束（本分镜已有图像提示词 / 生成图，视频模型会直接读图作参考）】');
    lines.push('');
    lines.push('**第一原则**：图像提示词所建立的人物**姿态 / 动作 / 持物 / 视线方向 / 互动关系**就是画面真相，视频提示词每一镜的**起始状态必须严格继承**，禁止改写或颠覆。最常见且必须避免的冲突示例：');
    lines.push('  · 图说"坐在床沿"，视频写成"站立"——禁止；');
    lines.push('  · 图说"端着水杯递出"，视频写成"双手放下 / 空手"——禁止；');
    lines.push('  · 图说"两人面对面对峙"，视频写成"并排坐"或"背对"——禁止；');
    lines.push('  · 图说"右手抬起推拒"，视频写成"双手插兜 / 双手交叉"——禁止；');
    lines.push('  · 改写图已确立的视线方向、持物方式、肢体朝向——禁止。');
    lines.push('');
    lines.push('**屏幕方位词**（画面左 / 右 / 中央 / 前景 / 背景 / 几何坐标 / 座位编号）由生图与机位决定，视频提示词**不要重复描述**——但**允许直接引用图像提示词里已经出现的姿态词**（例如"坐在床沿""端着水杯""位于其对侧"），因为那是图的真相，不是文本凭空编造。');
    lines.push('');
    lines.push('视频提示词应在"图像提示词建立的姿态"基础上，描述**动作如何展开**：');
    lines.push('  · 起始姿态（取自图像提示词对应镜头）→ 动作过程（运动、视线、表情、手势变化）→ 收束姿态（接续图像提示词或本单元末态）；');
    lines.push('  · 镜头语言：推 / 拉 / 摇 / 移 / 切 / 跟随 / 景别变化 / 焦距变化；');
    lines.push('  · 时间推进与节奏；');
    lines.push('  · 情绪 / 表情 / 视线变化；');
    lines.push('  · 不要凭空发明图里不存在的人物 / 道具 / 空间关系（例如图里没桌子，就不要写"绕到桌后"）。');
    if (isGridMode) {
      lines.push('');
      lines.push('**宫格模式（关键）**：图像提示词已按 cell 分别写好每一格的画面（cell 1 = 镜头 01、cell 2 = 镜头 02、cell 3 = 镜头 03、cell 4 = 镜头 04 ……）。视频提示词的**镜头 N 起始姿态 = 图像提示词镜头 N 的姿态描述**，必须严格对应：');
      lines.push('  · 不得在 cell 之间互换姿态（例如把镜头 01 的"坐"挪到镜头 03）；');
      lines.push('  · 不得引入图像提示词没规定过的中间状态；');
      lines.push('  · cell 之间的过渡只能靠运镜（推 / 拉 / 摇 / 切）与时间推进。');
    }
    lines.push('');
    lines.push('**本分镜的图像提示词原文（请对照阅读，将其作为每一镜起始姿态的真相依据；不要复述图里的"画面左 / 右"等屏幕方位词）：**');
    lines.push('```');
    lines.push((shot.imagePrompt || '').trim());
    lines.push('```');
  } else {
    // 多参考模式：没有锚定图，画面由 @scene / @char / @prop 引用图组合构成
    lines.push('【空间锚定约束（多参考模式：本分镜无锚定图，画面由 @scene / @char / @prop 引用图组合构成）】');
    lines.push('');
    lines.push('视频模型会综合各 mention 引用图组装画面，文本 LLM **不要凭空猜测空间关系**。具体来说：');
    lines.push('  · 角色 / 道具的位置参照只能基于下方"场景空间基线"里**已经出现的区域 / 标志物 / 距离**；场景基线之外的空间关系**禁止编造**（房间布局、家具具体位置、相对距离都由场景图承担）；');
    lines.push('  · **不要写**屏幕方位词（画面左 / 右 / 中央 / 前景 / 背景），屏幕构图由镜头语言和景别决定，不属于文本约束范围；');
    lines.push('  · 重点写：谁在做什么动作 / 与谁产生什么交互 / 镜头如何运动 / 时间如何推进；位置交给场景图、人物图与镜头语言共同决定。');
  }

  if (hasScenes) {
    lines.push('');
    lines.push(hasImagePrompt
      ? '**场景空间基线（继承自 @scene，作为对生成图的语义辅助；以图为准，下方文字仅用于理解场景类型，不要复述）：**'
      : '**场景空间基线（继承自 @scene，本分镜的空间真相；只能引用此处出现过的区域 / 标志物作为站位参照，禁止编造）：**');
    for (const scene of shotScenes) {
      const mention = createMentionString('scene', scene.id);
      const desc = (scene.description || scene.prompt || '').trim();
      lines.push(`  - ${mention} ${scene.name}：${desc || '（无空间描述，此场景无法提供空间锚点）'}`);
    }
  }

  return lines.join('\n');
}

export function buildDialogueGuardNote(scriptContent: string, characterNames: string[]): string {
  const { spoken, voiceover, commentary } = extractExplicitDialogueEvidence(scriptContent, characterNames);
  return [
    '【口播台词判定（高优先级，覆盖模板里的"台词"占位习惯）】',
    '本分镜的音频内容必须严格分轨，不要混淆三类：',
    '  · **DIALOGUE（人物开口台词）**：仅当原文明确出现"角色名:" / 直接引语 / "说/问/喊/自言自语"等发声动作时才能写。第三人称叙述、心理活动、认知句、环境说明、作者说明都不是口播；尤其不要把"她/他/她的/他的/这不是她的卧室"这类叙述句改写成自言自语或对话。',
    '  · **VOICEOVER（OS/OV/旁白/画外音）**：仅当原文明确写"OS:""OV:""旁白:""内心独白:"等标记时才有；播报全程对应人物嘴巴必须完全闭合。',
    '  · **COMMENTARY（社交评论 / 弹幕 / 字幕 / 新闻播报 / 短信 / 微博 / 朋友圈等第三方内容）**：**绝对不是主角口播台词**，**禁止改写为角色对白**，**也不属于 OS/OV**。如需在画面中呈现，只能用屏幕字幕 / 弹幕飘字 / 手机短信弹窗 等可视形式，并明确标注为"COMMENTARY (字幕)"——人物不发声、不张嘴、不读出来。',
    spoken.length > 0
      ? `本分镜显式口播台词（DIALOGUE）：\n${spoken.map(text => `- ${text}`).join('\n')}`
      : '本分镜显式口播台词（DIALOGUE）：无。若要表现人物认知/情绪，只能通过表情、视线、动作、停顿体现，不得补写台词。',
    voiceover.length > 0
      ? `本分镜显式 OS/OV / 旁白（VOICEOVER，对应人物全程闭嘴）：\n${voiceover.map(text => `- ${text}`).join('\n')}`
      : '本分镜显式 OS/OV / 旁白（VOICEOVER）：无。',
    commentary.length > 0
      ? `本分镜社交评论 / 弹幕 / 字幕 / 第三方文本（COMMENTARY，禁止作为人物开口台词，仅可作为画面字幕显示）：\n${commentary.map(text => `- ${text}`).join('\n')}`
      : '本分镜无第三方评论 / 弹幕 / 字幕（COMMENTARY）。',
  ].join('\n');
}

/**
 * 视频推理模板示例使用 "@图片1 / @图片2" 等占位约定；项目实际使用 mention 协议
 * (@char_<id> / @scene_<id> / @prop_<id> / @shot_anchor / @grid_anchor)。本约定告诉 LLM：
 *
 * - 写正文时使用**语义前缀**：`@角色 <名称>` / `@场景 <名称>` / `@道具 <名称>` / `@图`，
 *   而不是模板示例里的 `<名称> @图片N` 或 `@（角色场景道具）<名称>` 写法 —— 后者让模型混淆
 *   "图片位置编号"和"语义对象"。
 * - 每个语义前缀后必须**紧跟一次** mention 协议字符串（@char_<id> / @scene_<id> /
 *   @prop_<id> / @shot_anchor / @grid_anchor）作为机器可读 ID，下游 compile 才能把它
 *   翻译成 references 中对应的 @图片N 位置。
 * - 有图模式（含 shot-anchor / grid-anchor）下额外强调：必须在每个镜头描述中至少出现
 *   一次 `@图 @shot_anchor`（或 `@图 @grid_anchor`），把锚定图作为剧情连贯性基准。
 */
function buildMappingSchemaNote(
  shotCharacters: Character[],
  shotScenes: Scene[],
  shotProps: Prop[],
  referenceBundle: ShotReferenceBundle,
): string {
  const anchorItem = referenceBundle.items.find(
    item => item.kind === 'shot-anchor' || item.kind === 'grid-anchor',
  );

  const lines: string[] = [];
  lines.push('【映射符约定（覆盖模板示例中的 "@图片X" 写法，最终输出必须遵守本节）】');
  lines.push('');
  lines.push('1) 正文里指代角色 / 场景 / 道具 / 锚定图时，**必须使用 `@<id> <名称>` 格式**——mention 协议字符串在前，空格分隔，再跟该对象的中文名称。示例：');
  lines.push('   - 角色：`@char_<id> <角色名>`，例如 `@char_abc123 周明`');
  lines.push('   - 场景：`@scene_<id> <场景名>`，例如 `@scene_xyz789 教室`');
  lines.push('   - 道具：`@prop_<id> <道具名>`，例如 `@prop_def456 钥匙`');
  if (anchorItem) {
    lines.push(`   - 分镜锚定图：\`${anchorItem.mentionToken} ${anchorItem.label}\``);
  }
  lines.push('');
  lines.push('2) **禁止**以下其它格式：`名称 @图片1`、`@图片2 名称`、`@角色 名称`、`@场景 名称`、`@道具 名称`、`@（角色场景道具）名称`，也禁止单独出现 `@图片N` 或单独出现中文名。模板正文里所有 `@图片N` 仅为示例占位，最终输出必须替换成 `@<id> <名称>` 形式。');
  lines.push('');
  lines.push('3) 同一对象**每次出现都必须重复**写完整的 `@<id> <名称>`：不允许写"如前所述"省略，不允许只写 `@<id>`，也不允许只写中文名。');
  lines.push('');
  if (anchorItem) {
    lines.push(`4) **本分镜处于"有图模式"**：每个镜头描述至少出现一次 \`${anchorItem.mentionToken} ${anchorItem.label}\`，用作画面 / 姿态 / 空间 / 光影的锚定基准；若是九宫格 / 四宫格锚定，需说明本镜头对应锚定图中的哪个 cell。`);
  } else {
    lines.push('4) 本分镜处于"无图模式"（references 中没有分镜锚定图），不要使用 `@shot_anchor` / `@grid_anchor`，所有视觉锚点完全靠 `@char_<id>` / `@scene_<id>` / `@prop_<id>` 描述。');
  }
  lines.push('');
  lines.push('本分镜可用映射符清单（**只能**使用这里列出的对象，禁止虚构或引用未列出的资产）：');
  lines.push(formatMappingList('角色', shotCharacters.map(c => ({ name: c.name, mention: createMentionString('char', c.id) }))));
  lines.push(formatMappingList('场景', shotScenes.map(s => ({ name: s.name, mention: createMentionString('scene', s.id) }))));
  lines.push(formatMappingList('道具', shotProps.map(p => ({ name: p.name, mention: createMentionString('prop', p.id) }))));
  if (anchorItem) {
    lines.push(`- 分镜锚定图：\`${anchorItem.mentionToken} ${anchorItem.label}\``);
  }
  return lines.join('\n');
}

function formatMappingList(
  label: string,
  entries: Array<{ name: string; mention: string }>,
): string {
  if (entries.length === 0) return `- ${label}：（本分镜未绑定）`;
  const items = entries.map(e => `\`${e.mention} ${e.name}\``).join('；');
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
