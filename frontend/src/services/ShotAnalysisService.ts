/**
 * 分镜生成服务
 * 使用 LLM 基于剧本和已确认的角色/场景/道具生成分镜列表
 * 独立于剧本解析，作为单独的步骤执行
 */
import type { Shot } from '../types';
import { createScriptLine } from '../types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { TaskManager, Task } from './TaskManager';
import { createTaskCancellationSignal } from './taskCancellationSignal';
import { parseLLMJSONWithMeta } from '../utils/llmJsonParser';
import { parseShotScriptParagraph } from './dramaScript';
import { saveEpisodeShots } from '../store/projectStore';
import { createLogger } from '../store/logger';
import { extractErrorMessage } from '../utils/errorHandler';
import { appendStyleRequirement, type StyleSnapshotLike } from '../utils/promptNormalize';


import { clampDurationToSpec, formatSpecPromptHint } from '../providers/itv/durationSpec';
import { estimateShotSpeechDuration } from './shotFreshness';
import { buildGenreToneDirective } from './dramaGenreTags';
import {
  buildShotBreakdownDialogueModeDirective,
  formatProjectNarrativeMode,
} from './narrativeMode';
import {
  normalizeShotContinuity,
  type ShotContinuityPayload,
} from './shotContinuity';

const logger = createLogger('ShotAnalysis');
const SHOT_ANALYSIS_LLM_TIMEOUT_MS = 300_000;
const SHOT_ANALYSIS_CHUNK_THRESHOLD_CHARS = 3500;
const SHOT_ANALYSIS_CHUNK_TARGET_CHARS = 2400;

/**
 * 跨块衔接摘要：从本块最后一个分镜 payload 提取一句话概要，
 * 注入下一块 prompt，让 LLM 知道上文剧情走到哪、谁在场。
 */
function summarizePayloadForHandoff(payload: any): string {
  const dramaLines = (payload?.__dramaScriptLines as Array<{ role: string; text: string; speaker?: string }> | undefined) ?? [];
  const texts = dramaLines.length
    ? dramaLines.map(l => (l.role === 'dialogue' && l.speaker ? `${l.speaker}："${l.text}"` : l.text))
    : ((payload?.__resolvedLines as string[] | undefined) ?? []);
  const firstLine = (texts[0] || '').slice(0, 60);
  const rest = texts.length > 1 ? `……（共 ${texts.length} 行）` : '';
  const chars = (payload?.characters || []).join('、');
  const scns = (payload?.scenes || []).join('、');
  const cast = [chars && `角色：${chars}`, scns && `场景：${scns}`].filter(Boolean).join('；');
  return `画面：${firstLine}${rest}${cast ? `；出场 ${cast}` : ''}`;
}

interface ScriptAnalysisChunk {
  index: number;
  total: number;
  text: string;
}

function normalizeForCoverage(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：“”‘’「」『』（）()《》<>\[\]【】\-—…,.!?;:'"`~]/g, '');
}

function splitCoverageUnits(script: string): string[] {
  return script
    .split(/[\n。！？!?；;]+/)
    .map(unit => normalizeForCoverage(unit))
    .filter(unit => unit.length >= 6);
}

export function buildShotCoverageReport(script: string, shots: Pick<Shot, 'scriptLines'>[]): {
  totalUnits: number;
  coveredUnits: number;
  coverageRatio: number;
  missingSamples: string[];
} {
  const units = splitCoverageUnits(script);
  if (!units.length) {
    return { totalUnits: 0, coveredUnits: 0, coverageRatio: 1, missingSamples: [] };
  }

  const shotText = normalizeForCoverage(
    shots.map(shot => (shot.scriptLines || []).map(line => line.text).join('\n')).join('\n')
  );
  const missing = units.filter(unit => !shotText.includes(unit));
  const coveredUnits = units.length - missing.length;
  return {
    totalUnits: units.length,
    coveredUnits,
    coverageRatio: coveredUnits / units.length,
    missingSamples: missing.slice(0, 8),
  };
}

export function splitScriptForShotAnalysis(script: string): string[] {
  const normalized = script.trim();
  if (!normalized) return [];
  if (normalized.length <= SHOT_ANALYSIS_CHUNK_THRESHOLD_CHARS) return [normalized];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);
  const units = paragraphs.length > 1
    ? paragraphs
    : normalized
      .split(/(?<=[。！？!?；;])/)
      .map(p => p.trim())
      .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    if (!current) {
      current = unit;
      continue;
    }
    if (current.length + unit.length + 2 <= SHOT_ANALYSIS_CHUNK_TARGET_CHARS) {
      current += `${paragraphs.length > 1 ? '\n\n' : ''}${unit}`;
    } else {
      chunks.push(current);
      current = unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// 预选资产类型
export interface PresetAssets {
  characterIds: string[];
  propIds: string[];
}

// 分镜 JSON Schema（不含 description，后续手动生成提示词）
export const _SHOTS_SCHEMA = {
  type: 'object',
  properties: {
    shots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          scriptContent: { type: 'string', description: '对应剧本原文' },
          shotType: { type: 'string', enum: ['close-up', 'medium', 'wide', 'extreme-wide'] },
          cameraMovement: { type: 'string', enum: ['static', 'pan', 'zoom-in', 'tracking', 'handheld'] },
          duration: { type: 'number', description: '持续时长(秒)，只能是 6、10、12、16、20 之一' },
          characters: { type: 'array', items: { type: 'string' }, description: '涉及的角色名' },
          dialogue: { type: 'string', description: '台词' },
          emotion: { type: 'string', description: '情绪氛围' },
          props: { type: 'array', items: { type: 'string' }, description: '涉及的道具名' },
          scenes: { type: 'array', items: { type: 'string' }, description: '涉及的场景名' },
          continuity: {
            type: 'string',
            enum: ['inherit', 'independent'],
            description: '相对上一镜是否需要延续人物站位、动作和空间状态',
          },
          continuityReason: { type: 'string', description: '连续性判断的简短剧情依据' },
        },
        required: ['scriptContent', 'shotType'],
      },
    },
  },
  required: ['shots'],
};

export function normalizeGeneratedShotContinuity(
  shots: Shot[],
  payloads: ShotContinuityPayload[],
): Shot[] {
  return normalizeShotContinuity(shots, payloads);
}

export class ShotAnalysisService {
  private ctx: import('./CreationContext').CreationContext;
  private presetAssets: PresetAssets | null = null;

  constructor(ctx: import('./CreationContext').CreationContext) {
    this.ctx = ctx;
  }

  /** 让外部 fulfiller 在调用 runShotAnalysis 前注入 presetAssets */
  setPresetAssets(presetAssets?: PresetAssets): void {
    this.presetAssets = presetAssets || null;
  }

  /**
   * 启动分镜生成任务
   */
  async startShotAnalysis(
    episodeId: string,
    episodeName: string,
    script: string,
    presetAssets?: PresetAssets,
  ): Promise<Task> {
    this.presetAssets = presetAssets || null;

    const task = TaskManager.createTask({
      projectId: this.ctx.projectId,
      type: 'shot-analysis',
      targetType: 'episode',
      targetId: episodeId,
      targetName: episodeName,
    });

    TaskManager.updateTask(task.id, { status: 'running', progress: 0 });

    // 异步执行
    this.runShotAnalysis(task.id, episodeId, script);

    return task;
  }

  /**
   * 执行分镜生成
   * 公开后可被 main-side 'analysis:shot' handler 的 renderer fulfiller 直接调用，
   * 复用其状态机与 cancel 信号订阅，不必再创建一个新的 Task。
   */
  async runShotAnalysis(
    taskId: string,
    episodeId: string,
    script: string,
  ): Promise<void> {
    const traceId = `shot-analysis-${taskId}`;
    const cancellation = createTaskCancellationSignal(taskId);
    const checkCancel = () => {
      if (cancellation.signal.aborted) {
        throw cancellation.signal.reason instanceof Error
          ? cancellation.signal.reason
          : new Error('cancelled');
      }
    };
    try {
      checkCancel();
      TaskManager.updateTask(taskId, { progress: 10 });

      const { characters, scenes, props } = this.ctx;

      logger.info('开始分镜生成', {
        traceId,
        episodeId,
        scriptLength: script.length,
        charactersCount: characters.length,
        scenesCount: scenes.length,
        propsCount: props.length,
        hasPresetAssets: !!this.presetAssets,
      });

      TaskManager.updateTask(taskId, { progress: 20 });

      const chunks = splitScriptForShotAnalysis(script).map((text, index, arr): ScriptAnalysisChunk => ({
        index,
        total: arr.length,
        text,
      }));
      logger.info('分镜生成分块计划', {
        traceId,
        chunkCount: chunks.length,
        chunkLengths: chunks.map(chunk => chunk.text.length),
      });

      const parsedShotPayloads: any[] = [];
      // 跨块衔接上下文：上一块末尾原文 + 上一块最后一镜摘要，注入下一块的 prompt，
      // 解决"每块 LLM 只见本块文本"导致的跨块剧情断裂（边界动作/对话被打断）。
      let prevChunkContext: { tailText: string; lastShotSummary: string } | undefined;
      for (const chunk of chunks) {
        checkCancel();
        const progressBase = 20 + Math.floor((chunk.index / Math.max(chunks.length, 1)) * 55);
        TaskManager.updateTask(taskId, { progress: progressBase });
        const chunkShots = await this.generateShotPayloadsForChunk(traceId, chunk, prevChunkContext);
        parsedShotPayloads.push(...chunkShots.map((payload, payloadIndex) => ({
          ...payload,
          // 多 chunk 的局部首镜：没有注入上文时才忽略它的连续性建议；
          // 注入后 LLM 能看到上一段结尾，建议有效，予以保留。
          __ignoreContinuitySuggestion: chunks.length > 1 && payloadIndex === 0 && !prevChunkContext,
        })));
        const lastPayload = chunkShots[chunkShots.length - 1];
        if (lastPayload) {
          prevChunkContext = {
            tailText: chunk.text.slice(-300),
            lastShotSummary: summarizePayloadForHandoff(lastPayload),
          };
        }
      }

      TaskManager.updateTask(taskId, { progress: 75 });

      // 将角色名/道具名映射到 ID
      // 优先使用预选资产的 Sora2 ID，其次使用已绑定的 Sora2 ID，最后使用自定义 ID
      const presetCharacterIds = new Set(this.presetAssets?.characterIds || []);
      const presetPropIds = new Set(this.presetAssets?.propIds || []);

      const getCharId = (c: typeof characters[0]) => {
        if (c.sora2CharacterId && presetCharacterIds.has(c.sora2CharacterId)) {
          return c.sora2CharacterId;
        }
        return c.sora2CharacterId || c.id;
      };

      const getPropId = (p: typeof props[0]) => {
        if (p.sora2PropId && presetPropIds.has(p.sora2PropId)) {
          return p.sora2PropId;
        }
        return p.sora2PropId || p.id;
      };

      // 模糊匹配：支持 LLM 返回的名称包含描述后缀（如 "宁卓（侠客）"）或微小差异
      const fuzzyMatchAsset = <T extends { name: string }>(
        name: string,
        assets: T[]
      ): T | undefined => {
        if (!name) return undefined;
        const trimmed = name.trim();
        // 1. 精确匹配
        const exact = assets.find(a => a.name === trimmed);
        if (exact) return exact;
        // 2. LLM 返回的名称包含资产名（如 "宁卓（侠客）" 包含 "宁卓"）
        const containsAsset = assets.find(a => trimmed.includes(a.name));
        if (containsAsset) return containsAsset;
        // 3. 资产名包含 LLM 返回的名称（如资产名 "宁卓·天机" 包含 "宁卓"）
        const assetContains = assets.find(a => a.name.includes(trimmed));
        if (assetContains) return assetContains;
        return undefined;
      };

      // 剧情模式：scriptLines = 分镜脚本的行结构（无标记行=分镜描述；带 [旁白]/[台词·角色]
      // 标记的行按对应类型解析，说话人名映射 characterId）；解说模式行是纯字幕文本，全部为旁白行。
      const isDrama = this.ctx.projectMode === 'drama';
      // 资产名映射失败的名字汇总：不再静默丢弃——记日志 + 写进任务 result 供 UI 提示
      const unmatchedAssetNames = new Set<string>();
      const buildScriptLines = (s: any): Shot['scriptLines'] => {
        if (!isDrama) {
          const texts = (s.__resolvedLines as string[] | undefined) || [];
          return texts.map(text => createScriptLine(text, 'narration'));
        }
        const parsedLines = (s.__dramaScriptLines as Array<{ role: 'description' | 'narration' | 'dialogue'; text: string; speaker?: string }> | undefined) || [];
        return parsedLines.map(line => {
          if (line.role === 'dialogue') {
            const speaker = line.speaker ? fuzzyMatchAsset(line.speaker, characters) : undefined;
            if (line.speaker && !speaker) unmatchedAssetNames.add(line.speaker);
            return createScriptLine(line.text, 'dialogue', speaker ? getCharId(speaker) : undefined);
          }
          return createScriptLine(line.text, line.role);
        });
      };

      // 分镜拆解时 description 为 undefined，后续手动生成
      // 时长按当前项目选择的 ITV 渠道 spec 吸附（grok 渠道 → 6/10/12/16/20；seedance → 4-15 范围），
      // 之前一律走 normalizeShotDuration（grok 枚举）会把 seedance 渠道的有效值 5 强制吸到 6
      const shotEntries = parsedShotPayloads.map((payload, index) => {
        const scriptLines = buildScriptLines(payload);
        const baseDuration = clampDurationToSpec(payload.duration, this.ctx.itvDurationSpec);
        // 时长自动校准前置：台词/旁白朗读估算超过当前时长时，向上吸附到能容纳的合法时长，
        // 避免拆解产物天然配音溢出（此前完全靠用户事后手动"批量校准"）
        const speechEstimate = estimateShotSpeechDuration({ scriptLines });
        const duration = speechEstimate > baseDuration
          ? clampDurationToSpec(Math.ceil(speechEstimate * 1.2), this.ctx.itvDurationSpec)
          : baseDuration;
        return {
          payload,
          shot: {
            id: `shot_${Date.now()}_${index}`,
            scriptLines,
            shotType: payload.shotType || 'medium',
            cameraMovement: payload.cameraMovement || 'static',
            duration,
            characters: (payload.characters || [])
            .map((name: string) => {
              const match = fuzzyMatchAsset(name, characters);
              if (!match) unmatchedAssetNames.add(String(name));
              return match ? getCharId(match) : undefined;
            })
            .filter((id: string | undefined): id is string => id !== undefined),
            dialogue: payload.dialogue || '',
            emotion: payload.emotion || '',
            props: (payload.props || [])
            .map((name: string) => {
              const match = fuzzyMatchAsset(name, props);
              if (!match) unmatchedAssetNames.add(String(name));
              return match ? getPropId(match) : undefined;
            })
            .filter((id: string | undefined): id is string => id !== undefined),
            scenes: (payload.scenes || [])
            .map((name: string) => {
              const match = fuzzyMatchAsset(name, scenes);
              if (!match) unmatchedAssetNames.add(String(name));
              return match ? match.id : undefined;
            })
            .filter((id: string | undefined): id is string => id !== undefined),
            confirmed: false,
          } satisfies Shot,
        };
      }).filter(entry => entry.shot.scriptLines.length > 0); // Phase 2 方案 A：彻底丢弃空分镜

      // 必须在所有 chunk 合并、空镜过滤且最终 Shot ID 固定之后判断相邻连续性。
      const shots = normalizeGeneratedShotContinuity(
        shotEntries.map(entry => entry.shot),
        shotEntries.map(entry => ({
          continuity: entry.payload.continuity,
          usePreviousTailFrame: entry.payload.usePreviousTailFrame,
          continuityReason: entry.payload.continuityReason,
          ignoreContinuitySuggestion: entry.payload.__ignoreContinuitySuggestion,
        })),
      );

      // 覆盖率校验仅适用于解说模式的"行号切分"（文本不改写，可逐行核对）；
      // 剧情模式是创作式拆解（description 是新文本），跳过逐行覆盖率检查
      if (!isDrama) {
        const coverage = buildShotCoverageReport(script, shots);
        logger.info('分镜覆盖率检查', {
          traceId,
          shotsCount: shots.length,
          totalUnits: coverage.totalUnits,
          coveredUnits: coverage.coveredUnits,
          coverageRatio: Number(coverage.coverageRatio.toFixed(3)),
          missingSamples: coverage.missingSamples,
        });
        if (coverage.totalUnits > 0 && coverage.coverageRatio < 0.85) {
          logger.warn('分镜可能漏掉剧本内容：覆盖率低于阈值，但仍保存结果供用户检查', {
            traceId,
            coverageRatio: Number(coverage.coverageRatio.toFixed(3)),
            missingSamples: coverage.missingSamples,
          });
        }
      }

      checkCancel();
      TaskManager.updateTask(taskId, { progress: 85 });

      // 保存分镜到剧集
      await saveEpisodeShots(this.ctx.projectId, episodeId, shots);

      if (cancellation.signal.aborted) return;
      if (unmatchedAssetNames.size > 0) {
        logger.warn('部分资产名未能匹配到项目资产，已跳过归属（台词仍保留）', {
          traceId,
          unmatched: Array.from(unmatchedAssetNames),
        });
      }
      TaskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result: {
          shotsCount: shots.length,
          ...(unmatchedAssetNames.size > 0 ? { unmatchedAssetNames: Array.from(unmatchedAssetNames) } : {}),
        },
      });
    } catch (error: unknown) {
      // 已被 cancel：状态已是 cancelled，不要覆盖成 failed
      if (cancellation.signal.aborted) return;
      logger.error('生成失败', error);
      TaskManager.updateTask(taskId, {
        status: 'failed',
        error: extractErrorMessage(error) || '生成失败',
      });
    } finally {
      cancellation.dispose();
    }
  }

  /**
   * 剧情模式分镜拆解：不做行号切分，由 LLM 创作真正的分镜。
   * 每镜产出 description（分镜描述文本：场景/人物/动作/画面）+ voiceLines（旁白/台词带说话人）。
   */
  private async generateDramaShotPayloadsForChunk(
    traceId: string,
    chunk: ScriptAnalysisChunk,
    options: { durationConstraint: string; durationDefault: string; chunkLabel: string },
    prevContext?: { tailText: string; lastShotSummary: string },
  ): Promise<any[]> {
    const { characters, scenes, props } = this.ctx;
    const scriptForPrompt = chunk.total > 1
      ? [
        ...(prevContext
          ? [
            '【上一段结尾（仅供衔接参考，不在拆解范围内，禁止重复拆解）】',
            prevContext.tailText,
            `【上一段最后一个分镜】${prevContext.lastShotSummary}`,
            '',
          ]
          : []),
        `【当前拆解范围${options.chunkLabel}】`,
        prevContext
          ? '只拆解下面这一段剧本；不要补写其他分段内容。本段开头要自然承接上一段结尾的剧情与人物状态，不要重复已有剧情；本段内必须完整覆盖到末尾。'
          : '只拆解下面这一段剧本；不要补写其他分段内容。本段内必须完整覆盖到末尾。',
        chunk.text,
      ].join('\n')
      : chunk.text;

    const resolvedPrompt = await resolvePromptTemplate('shot_breakdown_drama', {
      script: scriptForPrompt,
      characters: characters.length > 0
        ? characters.map(c => c.prompt ? `${c.name}（${c.prompt}）` : c.name).join('\n')
        : '无',
      scenes: scenes.length > 0
        ? scenes.map(s => s.prompt ? `${s.name}（${s.prompt}）` : s.name).join('\n')
        : '无',
      props: props.length > 0
        ? props.map(p => p.prompt ? `${p.name}（${p.prompt}）` : p.name).join('\n')
        : '无',
      durationConstraint: options.durationConstraint,
      durationDefault: options.durationDefault,
    });
    const styledPrompt = await this.appendGenreToneDirective(
      this.appendStyleRequirement(resolvedPrompt.prompt),
    );

    const systemPrompt = [
      '你是一个专业的影视分镜师。把剧本拆解成真正的分镜：每镜写一段专业的分镜脚本',
      '（画面行无标记：场景/动作/构图/光线；声音行必须带标记：[台词·角色名] / [旁白]，一行一条）。',
      '剧情模式的听觉主体是人物台词——默认不要写 [旁白]，仅当剧情明确需要内心独白或叙述声音时才写。',
      '画面行只写摄影机能拍到的当下内容；严禁复述角色设定、外貌清单、背景故事、',
      '世界观介绍与心理活动，严禁照抄参考资料中的资产描述。台词与关键情节必须全部覆盖，',
      '不得遗漏。只输出 JSON，不要任何解释。',
    ].join('\n');

    const chunkTraceId = chunk.total > 1 ? `${traceId}-chunk-${chunk.index + 1}` : traceId;
    logger.info('剧情模式分镜拆解 - 调用 LLM', {
      traceId: chunkTraceId,
      chunkIndex: chunk.index + 1,
      chunkTotal: chunk.total,
      scriptLength: chunk.text.length,
      hasPrevContext: Boolean(prevContext),
      userPromptHead: styledPrompt.slice(0, 200),
    });

    const { shots: rawShots, parseMethod } = await this.callBreakdownLLMWithRetry({
      traceId: chunkTraceId,
      systemPrompt,
      userPrompt: styledPrompt,
      operation: chunk.total > 1 ? 'breakdown-drama-chunk' : 'breakdown-drama',
    });

    logger.info('剧情模式分镜 JSON 解析成功', {
      traceId: chunkTraceId,
      shotsCount: rawShots.length,
      parseMethod,
    });

    return rawShots.map((s) => {
      // 分镜脚本文本（完整一段，可能多行）；按行拆成块，无标记行=分镜描述，
      // 用户/模型手写的 [旁白]/[台词·角色] 标记行仍按对应类型解析（向前兼容）
      const scriptLines = parseShotScriptParagraph(String(s.script || ''));
      return {
        ...s,
        __dramaScriptLines: scriptLines,
      };
    }).filter((s: any) => s.__dramaScriptLines.length > 0);
  }

  private async generateShotPayloadsForChunk(
    traceId: string,
    chunk: ScriptAnalysisChunk,
    prevContext?: { tailText: string; lastShotSummary: string },
  ): Promise<any[]> {
    const durationSpec = this.ctx.itvDurationSpec;
    const durationConstraint = formatSpecPromptHint(durationSpec);
    const durationDefault = String(durationSpec.default);
    const { characters, scenes, props } = this.ctx;
    const chunkLabel = chunk.total > 1 ? `（第 ${chunk.index + 1}/${chunk.total} 段）` : '';
    const isDrama = this.ctx.projectMode === 'drama';

    // 剧情模式：不切片文字，让 LLM 创作真正的分镜描述（description）+ 归属声音行（voiceLines）
    if (isDrama) {
      return this.generateDramaShotPayloadsForChunk(traceId, chunk, {
        durationConstraint,
        durationDefault,
        chunkLabel,
      }, prevContext);
    }

    const projectNarrativeMode = formatProjectNarrativeMode(this.ctx.projectMode);
    const dialogueModeDirective = buildShotBreakdownDialogueModeDirective(this.ctx.projectMode);

    // Phase 2 方案 A：把 chunk 文本预先拆成"字幕行 + 行号"形式喂给 LLM；
    // LLM 只输出 scriptLineIndices（局部 1-based），下游用这些索引从 chunkLines 切片，
    // 文本绝不经 LLM 改写。
    const chunkLines = chunk.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const numberedScript = chunkLines.map((line, idx) => `[${idx + 1}] ${line}`).join('\n');
    const scriptForPrompt = chunk.total > 1
      ? [
        ...(prevContext
          ? [
            '【上一段结尾（仅供衔接参考，没有行号、不在拆解范围内，禁止重复拆解）】',
            prevContext.tailText,
            `【上一段最后一个分镜】${prevContext.lastShotSummary}`,
            '',
          ]
          : []),
        `【当前拆解范围${chunkLabel}】`,
        prevContext
          ? '只拆解下面带行号的这一段字幕行；不要补写其他分段内容。开头要自然承接上一段结尾的剧情，不要重复已有剧情。本段内必须连续不重不漏覆盖到末行。'
          : '只拆解下面这一段字幕行；不要补写其他分段内容。本段内必须连续不重不漏覆盖到末行。',
        numberedScript,
      ].join('\n')
      : numberedScript;

    const resolvedPrompt = await resolvePromptTemplate('shot_breakdown', {
      script: scriptForPrompt,
      characters: characters.length > 0
        ? characters.map(c => c.prompt ? `${c.name}（${c.prompt}）` : c.name).join('\n')
        : '无',
      scenes: scenes.length > 0
        ? scenes.map(s => s.prompt ? `${s.name}（${s.prompt}）` : s.name).join('\n')
        : '无',
      props: props.length > 0
        ? props.map(p => p.prompt ? `${p.name}（${p.prompt}）` : p.name).join('\n')
        : '无',
      durationConstraint,
      durationDefault,
      projectNarrativeMode,
      dialogueModeDirective,
    });
    const styledPrompt = await this.appendGenreToneDirective(
      this.appendStyleRequirement(resolvedPrompt.prompt),
    );

    const resolvedSystemPrompt = await resolvePromptTemplate('shot_breakdown_system', {
      durationConstraint,
      durationDefault,
      projectNarrativeMode,
      dialogueModeDirective,
    });
    const systemPrompt = resolvedSystemPrompt.prompt;

    const chunkTraceId = chunk.total > 1 ? `${traceId}-chunk-${chunk.index + 1}` : traceId;
    logger.info('准备调用 LLM', {
      traceId: chunkTraceId,
      parentTraceId: traceId,
      chunkIndex: chunk.index + 1,
      chunkTotal: chunk.total,
      scriptLength: chunk.text.length,
      systemPromptLength: systemPrompt.length,
      userPromptLength: styledPrompt.length,
      hasPrevContext: Boolean(prevContext),
      userPromptHead: styledPrompt.slice(0, 200),
    });

    const { shots: rawShots, parseMethod } = await this.callBreakdownLLMWithRetry({
      traceId: chunkTraceId,
      systemPrompt,
      userPrompt: styledPrompt,
      operation: chunk.total > 1 ? 'breakdown-chunk' : 'breakdown',
    });
    logger.info('JSON 解析成功', {
      traceId: chunkTraceId,
      parentTraceId: traceId,
      shotsCount: rawShots.length,
      parseMethod,
    });

    // Phase 2 方案 A：把 LLM 的 scriptLineIndices（1-based 局部行号）翻译成原文字幕行
    // 全程只做"切片 + 去重 + 越界过滤"，不做任何文本改写
    {
      const usedIndices = new Set<number>();
      const resolvedShots = rawShots.map((s) => {
        const indicesRaw = Array.isArray(s.scriptLineIndices) ? s.scriptLineIndices : [];
        const lines: string[] = [];
        for (const idx of indicesRaw) {
          if (typeof idx !== 'number' || !Number.isInteger(idx)) continue;
          if (idx < 1 || idx > chunkLines.length) continue;
          if (usedIndices.has(idx)) continue;
          usedIndices.add(idx);
          lines.push(chunkLines[idx - 1]);
        }
        return { ...s, __resolvedLines: lines };
      });

      // 兜底：未被任何分镜认领的字幕行追加到末镜，避免丢字
      const missingIndices: number[] = [];
      for (let i = 1; i <= chunkLines.length; i += 1) {
        if (!usedIndices.has(i)) missingIndices.push(i);
      }
      if (missingIndices.length && resolvedShots.length) {
        const lastShot = resolvedShots[resolvedShots.length - 1];
        for (const i of missingIndices) lastShot.__resolvedLines.push(chunkLines[i - 1]);
        logger.warn('LLM 未覆盖全部字幕行，已追加到末镜', {
          traceId: chunkTraceId,
          parentTraceId: traceId,
          missingCount: missingIndices.length,
          missingPreview: missingIndices.slice(0, 5).map(i => chunkLines[i - 1]).join(' / '),
        });
      } else if (missingIndices.length && !resolvedShots.length) {
        // 极端情况：LLM 一镜都没切；造一个兜底镜把整段塞进去
        logger.warn('LLM 未输出任何分镜，构造兜底单镜承载全部字幕行', {
          traceId: chunkTraceId,
          parentTraceId: traceId,
          lineCount: chunkLines.length,
        });
        resolvedShots.push({ __resolvedLines: [...chunkLines] });
      }

      return resolvedShots;
    }
  }

  /**
   * 分镜拆解 LLM 调用 + JSON 解析，块级重试（最多 2 次）：
   * - 空返回 / 解析彻底失败 → 重试，第二次在 prompt 末尾追加严格 JSON 提示；
   * - jsonrepair 修复成功（method !== 'direct'）视为"可能是半截数组"，也先重试一次求完整；
   * - 重试后仍是修复结果则接受（半截数组也比整块作废强），并 warn。
   */
  private async callBreakdownLLMWithRetry(params: {
    traceId: string;
    systemPrompt: string;
    userPrompt: string;
    operation: string;
  }): Promise<{ shots: any[]; parseMethod: string }> {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const userPrompt = attempt === 1
        ? params.userPrompt
        : `${params.userPrompt}\n\n【重要】上次输出不是合法、完整的 JSON（可能截断或夹杂解释文字）。请严格只输出一个完整 JSON 对象，覆盖拆解范围内的全部内容，不要任何解释、不要代码块标记。`;
      const result = await this.ctx.llmProvider.chat(
        [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          traceId: params.traceId,
          source: 'shot-analysis',
          operation: attempt > 1 ? `${params.operation}-retry` : params.operation,
          taskKind: 'structured',
          taskProfileId: 'shot-breakdown',
          stream: true,
          timeoutMs: SHOT_ANALYSIS_LLM_TIMEOUT_MS,
          responseFormat: 'json_object',
        },
      );

      if (result.trim().length === 0) {
        if (attempt < maxAttempts) {
          logger.warn('LLM 返回内容为空，重试一次', { traceId: params.traceId, attempt });
          continue;
        }
        throw new Error('LLM 返回内容为空，请检查所选 LLM 渠道的模型名 / 接口路径 / 配额是否可用');
      }

      try {
        const parseResult = parseLLMJSONWithMeta<{ shots: any[] }>(result);
        const shots = Array.isArray(parseResult.data?.shots) ? parseResult.data.shots : [];
        if (parseResult.method === 'direct') {
          return { shots, parseMethod: parseResult.method };
        }
        if (attempt < maxAttempts) {
          logger.warn('分镜 JSON 需修复才能解析（可能是半截数组），重试一次求完整输出', {
            traceId: params.traceId,
            attempt,
            parseMethod: parseResult.method,
            shotsCount: shots.length,
          });
          continue;
        }
        logger.warn('分镜 JSON 重试后仍需修复，接受修复结果（可能不完整）', {
          traceId: params.traceId,
          parseMethod: parseResult.method,
          shotsCount: shots.length,
        });
        return { shots, parseMethod: parseResult.method };
      } catch (parseErr) {
        if (attempt === maxAttempts) throw parseErr;
        logger.warn('分镜 JSON 解析失败，重试一次', {
          traceId: params.traceId,
          attempt,
          error: parseErr instanceof Error ? parseErr.message : String(parseErr),
        });
      }
    }
    throw new Error('分镜 LLM 输出解析失败');
  }

  /**
   * 把项目的三轴风格标签拼到拆解提示词后面。
   * 题材卡在这一步起的作用最大——它决定每段先给什么结果、集尾钩子往哪长。
   * 没有标签或解析失败时原样返回，不影响拆解。
   */
  private async appendGenreToneDirective(prompt: string): Promise<string> {
    const directive = await buildGenreToneDirective(this.ctx.genreTags);
    return directive ? `${prompt}\n\n${directive}` : prompt;
  }

  private appendStyleRequirement(prompt: string): string {
    return appendStyleRequirement(prompt, this.ctx.styleSnapshot);
  }
}

/**
 * @deprecated 现役 UI 已切到 services/analysisTaskClient.submitShotAnalysisTask
 *   （走主进程 'shot-analysis' handler，含限流 + 取消 + 多窗口共享状态）。
 *   保留此 renderer-driven 入口作为应急 fallback；新代码不要再调。
 */
export async function startShotAnalysis(
  projectId: string,
  episodeId: string,
  episodeName: string,
  script: string,
  llmSelection?: string,
  presetAssets?: PresetAssets,
  styleSnapshot?: StyleSnapshotLike,
): Promise<Task> {
  const { createCreationContext } = await import('./CreationContext');
  const ctx = await createCreationContext(projectId, episodeId, {
    llmConfigId: llmSelection,
    styleSnapshot,
  });
  const service = new ShotAnalysisService(ctx);
  return service.startShotAnalysis(episodeId, episodeName, script, presetAssets);
}
