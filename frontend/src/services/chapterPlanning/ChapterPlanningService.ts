/**
 * 章节规划主编排服务
 *
 * 数据流:
 * script → buildUnits → units[]
 *   → summarizeUnitsInBatches → summaries[]
 *   → generateCandidateCutpoints → candidates[] (scored)
 *   → chooseCutpointsWithLLM → selectedCandidateIds[]
 *   → validateChapterSelection → pass/repair/fallback
 *   → materializeChapterRanges → ChapterPreview[]
 */

import type { LLMProvider, LLMCallOptions } from '../../providers/llm/types';
import type {
  ChapterUnit,
  ChapterUnitSummary,
  CandidateCutpoint,
  ChapterPreview,
  ChapterPlanningConfig,
  ChapterPlanningResult,
  ChapterPlanningSummaryTuning,
  LLMChapterSelection,
  OnProgressCallback,
} from './types';
import { DEFAULT_PLANNING_CONFIG } from './types';
import { buildUnits } from './unitBuilder';
import { summarizeUnitsInBatches } from './summaryService';
import { generateCandidateCutpoints, selectTopCandidates } from './candidateScorer';
import { validateChapterSelection, deterministicFallback } from './validator';
import { buildSelectionPrompt, buildRepairPrompt } from './prompts';
import { parseLLMJSON } from '../../utils/llmJsonParser';

/** LLM 选择的最大重试次数（含初始请求） */
const MAX_LLM_ATTEMPTS = 2;

// ─── Materialize ───────────────────────────────────────

function materializeChapterRanges(
  selectedIds: string[],
  candidates: CandidateCutpoint[],
  units: ChapterUnit[],
  summaries: ChapterUnitSummary[],
  chapterTitles?: string[],
): ChapterPreview[] {
  const candidateMap = new Map(candidates.map(c => [c.id, c]));
  const summaryMap = new Map(summaries.map(s => [s.unitIndex, s]));

  // Sort selected cut indices
  const cutIndices = selectedIds
    .map(id => candidateMap.get(id)?.afterUnitIndex ?? -1)
    .filter(i => i >= 0)
    .sort((a, b) => a - b);

  // Build chapter boundaries: [0..cut1], [cut1+1..cut2], ..., [lastCut+1..end]
  const chapters: ChapterPreview[] = [];
  const startPoints = [0, ...cutIndices.map(i => i + 1)];
  const endPoints = [...cutIndices, units.length - 1];

  for (let i = 0; i < startPoints.length; i++) {
    const startIdx = startPoints[i];
    const endIdx = endPoints[i];

    if (startIdx > endIdx || startIdx >= units.length) continue;

    const chapterUnits = units.slice(startIdx, endIdx + 1);
    const chapterSummaries = chapterUnits
      .map(u => summaryMap.get(u.index))
      .filter((s): s is ChapterUnitSummary => s !== undefined);

    const plotSummary = chapterSummaries.map(s => s.summary).join('；');
    const charCount = chapterUnits.reduce((sum, u) => sum + u.charCount, 0);

    const defaultTitle = chapterUnits.length === 1
      ? chapterUnits[0].label
      : `${chapterUnits[0].label} ~ ${chapterUnits[chapterUnits.length - 1].label}`;

    chapters.push({
      chapterIndex: i + 1,
      title: chapterTitles?.[i] || defaultTitle,
      startUnitIndex: startIdx,
      endUnitIndex: endIdx,
      unitLabels: chapterUnits.map(u => u.label),
      plotSummary,
      charCount,
      startOffset: chapterUnits[0].startOffset,
      endOffset: chapterUnits[chapterUnits.length - 1].endOffset,
    });
  }

  return chapters;
}

// ─── LLM Selection ─────────────────────────────────────

async function chooseCutpointsWithLLM(
  units: ChapterUnit[],
  summaries: ChapterUnitSummary[],
  candidates: CandidateCutpoint[],
  config: ChapterPlanningConfig,
  provider: LLMProvider,
  callOptions?: LLMCallOptions,
): Promise<LLMChapterSelection> {
  const { systemPrompt, userPrompt } = buildSelectionPrompt(
    units,
    summaries,
    candidates,
    config,
  );

  const response = await provider.generateText(
    userPrompt,
    systemPrompt,
    {
      ...callOptions,
      source: 'chapterPlanning',
      operation: 'chooseCutpoints',
      disableChunking: true,
    },
  );

  const parsed = parseLLMJSON<{
    selectedIds?: string[];
    chapterTitles?: string[];
  }>(response);

  return {
    selectedIds: Array.isArray(parsed.selectedIds) ? parsed.selectedIds : [],
    chapterTitles: Array.isArray(parsed.chapterTitles) ? parsed.chapterTitles : undefined,
  };
}

async function chooseCutpointsWithRepair(
  units: ChapterUnit[],
  summaries: ChapterUnitSummary[],
  candidates: CandidateCutpoint[],
  config: ChapterPlanningConfig,
  provider: LLMProvider,
  callOptions?: LLMCallOptions,
): Promise<{ selection: LLMChapterSelection; usedRepair: boolean }> {
  const { userPrompt } = buildSelectionPrompt(units, summaries, candidates, config);

  for (let attempt = 0; attempt < MAX_LLM_ATTEMPTS; attempt++) {
    try {
      const selection = await chooseCutpointsWithLLM(
        units,
        summaries,
        candidates,
        config,
        provider,
        callOptions,
      );

      const validation = validateChapterSelection(
        selection.selectedIds,
        candidates,
        units,
        config,
      );

      if (validation.valid) {
        return { selection, usedRepair: attempt > 0 };
      }

      // If repairable and this is the first attempt, try repair prompt
      if (attempt === 0 && validation.repairedIds) {
        // Try auto-repair first
        const repairValidation = validateChapterSelection(
          validation.repairedIds,
          candidates,
          units,
          config,
        );

        if (repairValidation.valid) {
          return {
            selection: {
              selectedIds: validation.repairedIds,
              chapterTitles: selection.chapterTitles,
            },
            usedRepair: true,
          };
        }

        // Auto-repair didn't work, try LLM repair
        const errorIssues = validation.issues.filter(i => i.severity === 'error');
        const { systemPrompt: repairSystem, userPrompt: repairUser } = buildRepairPrompt(
          userPrompt,
          errorIssues,
        );

        const repairResponse = await provider.generateText(
          repairUser,
          repairSystem,
          {
            ...callOptions,
            source: 'chapterPlanning',
            operation: 'repairCutpoints',
            disableChunking: true,
          },
        );

        const repaired = parseLLMJSON<{
          selectedIds?: string[];
          chapterTitles?: string[];
        }>(repairResponse);

        const finalSelection: LLMChapterSelection = {
          selectedIds: Array.isArray(repaired.selectedIds) ? repaired.selectedIds : [],
          chapterTitles: Array.isArray(repaired.chapterTitles)
            ? repaired.chapterTitles
            : selection.chapterTitles,
        };

        const finalValidation = validateChapterSelection(
          finalSelection.selectedIds,
          candidates,
          units,
          config,
        );

        if (finalValidation.valid) {
          return { selection: finalSelection, usedRepair: true };
        }

        if (finalValidation.repairedIds) {
          return {
            selection: {
              selectedIds: finalValidation.repairedIds,
              chapterTitles: finalSelection.chapterTitles,
            },
            usedRepair: true,
          };
        }
      }
    } catch {
      // LLM call failed, will fallback
    }
  }

  // All attempts failed — signal caller to use deterministic fallback
  throw new Error('LLM_SELECTION_FAILED');
}

// ─── Main Pipeline ─────────────────────────────────────

export interface PlanChaptersOptions {
  script: string;
  config: Partial<ChapterPlanningConfig> & { mode: ChapterPlanningConfig['mode'] };
  provider: LLMProvider;
  callOptions?: LLMCallOptions;
  onProgress?: OnProgressCallback;
  /** 摘要生成调优参数（并发、自适应 batch） */
  summaryTuning?: ChapterPlanningSummaryTuning;
  /** 外部预检测的集边界（跳过 buildUnits 内置 regex 检测） */
  overrideBoundaries?: import('../episodeBoundaryDetector').EpisodeBoundary[];
}

/**
 * 执行完整章节规划管线
 */
export async function planChapters(
  options: PlanChaptersOptions,
): Promise<ChapterPlanningResult> {
  const startTime = Date.now();
  const { script, provider, callOptions, onProgress, summaryTuning } = options;
  const config: ChapterPlanningConfig = {
    ...DEFAULT_PLANNING_CONFIG,
    ...options.config,
  };

  let usedFallback = false;

  // Step 1: Build units
  onProgress?.({
    stage: 'building-units',
    progress: 0,
    message: '正在分析剧本结构...',
  });

  // Yield to event loop so React can render the stage change
  await new Promise(r => setTimeout(r, 0));

  const { units } = buildUnits(script, options.overrideBoundaries ? { overrideBoundaries: options.overrideBoundaries } : undefined);

  if (units.length === 0) {
    throw new Error('剧本为空或无法解析');
  }

  // Auto-calculate target chapters if not provided
  if (!config.targetChapters) {
    const unitsPerChapter = config.unitsPerChapter ?? defaultUnitsPerChapter(units.length);
    config.targetChapters = Math.max(1, Math.ceil(units.length / unitsPerChapter));
  }

  // Single chapter — no cuts needed
  if (config.targetChapters <= 1 || units.length <= 1) {
    const chapters: ChapterPreview[] = [{
      chapterIndex: 1,
      title: units[0]?.label ?? '全文',
      startUnitIndex: 0,
      endUnitIndex: units.length - 1,
      unitLabels: units.map(u => u.label),
      plotSummary: '',
      charCount: units.reduce((sum, u) => sum + u.charCount, 0),
      startOffset: units[0]?.startOffset ?? 0,
      endOffset: units[units.length - 1]?.endOffset ?? script.length,
    }];

    return {
      chapters,
      units,
      candidates: [],
      selectedCutIds: [],
      validation: { valid: true, issues: [] },
      usedFallback: false,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 2: Summarize
  onProgress?.({
    stage: 'summarizing',
    progress: 0.1,
    message: '正在生成单元摘要...',
  });

  const summaries = await summarizeUnitsInBatches(
    script,
    units,
    provider,
    onProgress,
    callOptions,
    summaryTuning,
  );

  // Step 3: Score candidates
  onProgress?.({
    stage: 'scoring-candidates',
    progress: 0.5,
    message: '正在评估候选切点...',
  });

  await new Promise(r => setTimeout(r, 0));

  const allCandidates = generateCandidateCutpoints(units, summaries, config);
  const topCandidates = selectTopCandidates(allCandidates, config);

  // Step 4: LLM selection
  onProgress?.({
    stage: 'llm-selecting',
    progress: 0.6,
    message: '正在由 AI 选择章节边界...',
  });

  let selectedIds: string[];
  let chapterTitles: string[] | undefined;
  let validation;

  try {
    const { selection, usedRepair } = await chooseCutpointsWithRepair(
      units,
      summaries,
      topCandidates,
      config,
      provider,
      callOptions,
    );

    selectedIds = selection.selectedIds;
    chapterTitles = selection.chapterTitles;
    usedFallback = usedRepair;

    // Step 5: Validate (success path)
    onProgress?.({
      stage: 'validating',
      progress: 0.8,
      message: '正在校验章节选择...',
    });

    validation = validateChapterSelection(selectedIds, topCandidates, units, config);
  } catch {
    // LLM failed completely — deterministic fallback
    onProgress?.({
      stage: 'validating',
      progress: 0.8,
      message: '使用确定性降级...',
    });

    selectedIds = deterministicFallback(allCandidates, units, config);
    usedFallback = true;
    validation = validateChapterSelection(selectedIds, allCandidates, units, config);

    if (validation.repairedIds) {
      selectedIds = validation.repairedIds;
      validation = validateChapterSelection(selectedIds, allCandidates, units, config);
    }
  }

  // Step 5: Materialize
  onProgress?.({
    stage: 'materializing',
    progress: 0.9,
    message: '正在生成章节预览...',
  });

  const chapters = materializeChapterRanges(
    selectedIds,
    allCandidates,
    units,
    summaries,
    chapterTitles,
  );

  onProgress?.({
    stage: 'done',
    progress: 1,
    message: `已生成 ${chapters.length} 章`,
  });

  return {
    chapters,
    units,
    candidates: allCandidates,
    selectedCutIds: selectedIds,
    validation,
    usedFallback,
    durationMs: Date.now() - startTime,
  };
}

/**
 * 默认每章 unit 数（基于总 unit 数推算）
 */
function defaultUnitsPerChapter(totalUnits: number): number {
  if (totalUnits <= 12) return 3;
  if (totalUnits <= 30) return 5;
  if (totalUnits <= 60) return 8;
  if (totalUnits <= 100) return 10;
  return 15;
}
