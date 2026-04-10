/**
 * 章节规划 — Unit 摘要生成服务
 *
 * 将 units 分批发送给 LLM，生成结构化摘要。
 * 每批包含 N 个 unit 的采样文本，LLM 返回 JSON 摘要数组。
 *
 * R6: 并行化 — 使用 runWithConcurrency 并行执行多个 batch（默认并发 3）
 * R7: 自适应 batch — 基于 contextWindowTokens 动态计算 batchSize 和 maxPromptChars
 */

import type { LLMProvider, LLMCallOptions } from '../../providers/llm/types';
import type {
  ChapterUnit,
  ChapterUnitSummary,
  ChapterPlanningSummaryTuning,
  OnProgressCallback,
} from './types';
import { sampleUnitText } from './scriptSampling';
import { parseLLMJSON } from '../../utils/llmJsonParser';
import { runWithConcurrency } from '../../utils/concurrency';

// ─── 默认常量 ────────────────────────────────────────────

/** 默认每批最多处理的 unit 数 */
const DEFAULT_BATCH_SIZE = 8;
/** 默认每批最大 prompt 字符数 */
const DEFAULT_MAX_PROMPT_CHARS = 24_000;
/** 默认并发数 */
const DEFAULT_CONCURRENCY = 3;
/** 最大并发数 */
const MAX_CONCURRENCY = 4;
/** 安全系数：保留 22% 窗口给系统提示 + 输出 */
const PROMPT_SAFETY_RATIO = 0.78;
/** 中文字符平均 token 比例（约 1 字符 ≈ 1.5 token） */
const CHARS_PER_TOKEN = 0.67;

const SUMMARY_SYSTEM_PROMPT = `你是一位剧本分析助手。你的任务是为给定的剧本片段生成结构化摘要。

对于每个片段，返回一个 JSON 数组，每个元素包含：
- unitIndex: 片段编号（与输入中的编号一致）
- summary: 一句话剧情摘要（50-100 字，概括主线剧情）
- mainCharacters: 主要出场角色名数组（最多5个）
- mainLocations: 主要场景/地点数组（最多3个）
- tone: 情绪/氛围标签（如 "紧张"、"温馨"、"悲伤"）

严格返回 JSON 数组，不要添加其他文字。`;

// ─── 自适应 batch 参数计算 ─────────────────────────────────

interface AdaptiveBatchParams {
  batchSize: number;
  maxPromptChars: number;
}

/**
 * 根据模型上下文窗口大小计算最优 batch 参数
 */
export function computeAdaptiveBatchParams(
  tuning?: ChapterPlanningSummaryTuning,
): AdaptiveBatchParams {
  const contextWindow = tuning?.contextWindowTokens;

  if (!contextWindow || contextWindow <= 0) {
    return { batchSize: DEFAULT_BATCH_SIZE, maxPromptChars: DEFAULT_MAX_PROMPT_CHARS };
  }

  // 可用输入 token = 上下文窗口 × 安全系数 - 系统提示开销(~500 token)
  const usableInputTokens = Math.floor(contextWindow * PROMPT_SAFETY_RATIO) - 500;
  // 转为字符数
  const usableChars = Math.floor(usableInputTokens * CHARS_PER_TOKEN);

  // 每个 unit 平均采样后 ~2000-3000 字符 + overhead
  const avgUnitChars = 2800;
  const batchSize = Math.max(4, Math.min(24, Math.floor(usableChars / avgUnitChars)));
  const maxPromptChars = Math.max(DEFAULT_MAX_PROMPT_CHARS, usableChars);

  return { batchSize, maxPromptChars };
}

// ─── Batch 分组 ──────────────────────────────────────────

interface SummaryBatchInput {
  unitIndex: number;
  label: string;
  text: string;
}

function buildBatchPrompt(batch: SummaryBatchInput[]): string {
  const sections = batch.map(item =>
    `--- 片段 ${item.unitIndex}（${item.label}）---\n${item.text}`,
  );

  return `请为以下 ${batch.length} 个剧本片段生成摘要：\n\n${sections.join('\n\n')}\n\n返回 JSON 数组，格式: [{ unitIndex, summary, mainCharacters, mainLocations, tone }]`;
}

/**
 * 将 units 划分为适合 LLM 处理的批次（支持自适应参数）
 */
function planBatches(
  script: string,
  units: ChapterUnit[],
  params: AdaptiveBatchParams,
): SummaryBatchInput[][] {
  const { batchSize, maxPromptChars } = params;
  const batches: SummaryBatchInput[][] = [];
  let currentBatch: SummaryBatchInput[] = [];
  let currentChars = 0;

  for (const unit of units) {
    const rawText = script.slice(unit.startOffset, unit.endOffset).trim();
    const sampled = sampleUnitText(rawText);
    const entry: SummaryBatchInput = {
      unitIndex: unit.index,
      label: unit.label,
      text: sampled,
    };

    const entryChars = sampled.length + unit.label.length + 50; // overhead

    if (
      currentBatch.length >= batchSize ||
      (currentChars + entryChars > maxPromptChars && currentBatch.length > 0)
    ) {
      batches.push(currentBatch);
      currentBatch = [entry];
      currentChars = entryChars;
    } else {
      currentBatch.push(entry);
      currentChars += entryChars;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

// ─── 结果解析 ─────────────────────────────────────────────

interface RawSummaryItem {
  unitIndex: number;
  summary: string;
  mainCharacters?: string[];
  mainLocations?: string[];
  tone?: string;
}

function normalizeSummaryItem(raw: RawSummaryItem): ChapterUnitSummary {
  return {
    unitIndex: raw.unitIndex,
    summary: raw.summary || '',
    mainCharacters: Array.isArray(raw.mainCharacters) ? raw.mainCharacters : [],
    mainLocations: Array.isArray(raw.mainLocations) ? raw.mainLocations : [],
    tone: raw.tone,
  };
}

function makeFallbackSummaries(batch: SummaryBatchInput[]): ChapterUnitSummary[] {
  return batch.map(entry => ({
    unitIndex: entry.unitIndex,
    summary: `（${entry.label}）`,
    mainCharacters: [],
    mainLocations: [],
  }));
}

// ─── Public API ──────────────────────────────────────────

/**
 * 为全部 units 生成摘要（并行 + 自适应 batch）
 */
export async function summarizeUnitsInBatches(
  script: string,
  units: ChapterUnit[],
  provider: LLMProvider,
  onProgress?: OnProgressCallback,
  callOptions?: LLMCallOptions,
  summaryTuning?: ChapterPlanningSummaryTuning,
): Promise<ChapterUnitSummary[]> {
  const batchParams = computeAdaptiveBatchParams(summaryTuning);
  const batches = planBatches(script, units, batchParams);
  const concurrency = Math.min(
    summaryTuning?.concurrency ?? DEFAULT_CONCURRENCY,
    MAX_CONCURRENCY,
  );

  // 进度跟踪：按完成数推进
  let completedCount = 0;
  const totalBatches = batches.length;

  const tasks = batches.map((batch, batchIndex) => async () => {
    const prompt = buildBatchPrompt(batch);

    const response = await provider.generateText(
      prompt,
      SUMMARY_SYSTEM_PROMPT,
      {
        ...callOptions,
        source: 'chapterPlanning',
        operation: 'summarize',
        disableChunking: true,
      },
    );

    let summaries: ChapterUnitSummary[];
    try {
      const items = parseLLMJSON<RawSummaryItem[]>(response);
      summaries = Array.isArray(items)
        ? items.map(normalizeSummaryItem)
        : makeFallbackSummaries(batch);
    } catch {
      summaries = makeFallbackSummaries(batch);
    }

    // 更新进度（线程安全：单线程 JS 无需 mutex）
    completedCount++;
    onProgress?.({
      stage: 'summarizing',
      progress: completedCount / totalBatches,
      message: `正在生成摘要 (${completedCount}/${totalBatches})...`,
    });

    return { batchIndex, summaries };
  });

  // 并行执行
  const results = await runWithConcurrency(tasks, concurrency);

  // 收集结果（保持顺序，失败 batch 使用 fallback）
  const allSummaries: ChapterUnitSummary[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      allSummaries.push(...result.value.summaries);
    } else {
      // batch 级别回退
      allSummaries.push(...makeFallbackSummaries(batches[i]));
    }
  }

  // 确保所有 unit 都有摘要（补齐遗漏的）
  const indexSet = new Set(allSummaries.map(s => s.unitIndex));
  for (const unit of units) {
    if (!indexSet.has(unit.index)) {
      allSummaries.push({
        unitIndex: unit.index,
        summary: `（${unit.label}）`,
        mainCharacters: [],
        mainLocations: [],
      });
    }
  }

  // 按 unitIndex 排序
  allSummaries.sort((a, b) => a.unitIndex - b.unitIndex);

  return allSummaries;
}
