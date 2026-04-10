/**
 * 章节规划服务 — 类型定义
 * 方案 C: 规则候选切点 + LLM 选边界
 *
 * 数据流:
 * script → unitBuilder → units[]
 *   → summaryService → summaries[]
 *   → candidateScorer → candidates[] (scored)
 *   → LLM chooseCutpoints → selectedCandidateIds[]
 *   → validator → pass/repair/fallback
 *   → materialize → ChapterPreview[]
 */

import type { EpisodeBoundary } from '../episodeBoundaryDetector';

// ─── Unit: 最小不可分割的剧本单元 ───────────────────────

/** 集模式下的 unit（每个 unit 对应一集） */
export interface EpisodeUnit {
  kind: 'episode';
  /** 0-based 序号 */
  index: number;
  /** 集标题（如"第3集：离别"） */
  label: string;
  /** 集编号（如 3） */
  episodeNumber: number | null;
  /** 原始文本在 script 中的 byte offset 起点 */
  startOffset: number;
  /** 原始文本在 script 中的 byte offset 终点（exclusive） */
  endOffset: number;
  /** 字符数 */
  charCount: number;
}

/** 块模式下的 unit（无集标记时，按文本段落分块） */
export interface BlockUnit {
  kind: 'block';
  index: number;
  label: string;
  startOffset: number;
  endOffset: number;
  charCount: number;
}

export type ChapterUnit = EpisodeUnit | BlockUnit;

// ─── Summary: unit 摘要（LLM 生成） ─────────────────────

export interface ChapterUnitSummary {
  /** 对应 unit 的 index */
  unitIndex: number;
  /** 一句话摘要（50-100 字） */
  summary: string;
  /** 主要角色名 */
  mainCharacters: string[];
  /** 主要地点 */
  mainLocations: string[];
  /** 情绪/氛围标签 */
  tone?: string;
}

// ─── Candidate: 候选切点（在两个 unit 之间） ─────────────

export interface CutpointScoreBreakdown {
  /** 叙事转折（剧情弧线变化） */
  narrativeShift: number;
  /** 钩子强度（前段结尾悬念/后段开头吸引力） */
  hookStrength: number;
  /** 角色阵容变化程度 */
  castShift: number;
  /** 场景/地点变化程度 */
  locationShift: number;
  /** 结构标记（时间跳跃、旁白分隔等） */
  structureCue: number;
  /** 锚点吻合度（均匀分章时此项权重更高） */
  anchorFit: number;
}

export interface CandidateCutpoint {
  /** 唯一标识 "cut-3" 表示在 unit[3] 和 unit[4] 之间 */
  id: string;
  /** 切点位置：在 afterUnitIndex 和 afterUnitIndex+1 之间 */
  afterUnitIndex: number;
  /** 综合得分 0-1 */
  score: number;
  /** 分项得分 */
  breakdown: CutpointScoreBreakdown;
  /** 人类可读理由 */
  reason: string;
}

// ─── LLM Selection: LLM 选出的切点 ──────────────────────

export interface LLMChapterSelection {
  /** LLM 选中的 candidate ids */
  selectedIds: string[];
  /** LLM 返回的整体章节标题建议 */
  chapterTitles?: string[];
}

// ─── Validation ─────────────────────────────────────────

export type ValidationCode =
  | 'DUPLICATE_CUT'
  | 'OUT_OF_RANGE'
  | 'UNKNOWN_CANDIDATE'
  | 'CHAPTER_TOO_SHORT'
  | 'CHAPTER_TOO_LONG'
  | 'TOTAL_MISMATCH'
  | 'ADJACENT_CUTS'
  | 'EMPTY_CHAPTER'
  | 'FIRST_CUT_BEFORE_START'
  | 'LAST_CUT_AFTER_END'
  | 'WRONG_CUT_COUNT';

export interface ValidationIssue {
  code: ValidationCode;
  message: string;
  severity: 'error' | 'warning';
  /** 可自动修复 */
  autoFixable: boolean;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** 修复后的 selectedIds（如果有自动修复） */
  repairedIds?: string[];
}

// ─── Chapter Preview: 最终产物 ──────────────────────────

export interface ChapterPreview {
  /** 1-based 章节编号 */
  chapterIndex: number;
  /** 章节标题（LLM 或自动生成） */
  title: string;
  /** 包含的 unit index 范围 [startUnit, endUnit] (inclusive) */
  startUnitIndex: number;
  endUnitIndex: number;
  /** 包含的 unit labels */
  unitLabels: string[];
  /** 合并后的摘要 */
  plotSummary: string;
  /** 章节字符数 */
  charCount: number;
  /** 对应原始 script 的 offset 范围 */
  startOffset: number;
  endOffset: number;
}

// ─── Planning Config ────────────────────────────────────

export type ChapterPlanningMode = 'smart' | 'even';

export interface ChapterPlanningConfig {
  mode: ChapterPlanningMode;
  /** 用户期望的章节数（可选，不传则自动推算） */
  targetChapters?: number;
  /** 每章包含的 unit 数量建议（even 模式下优先使用） */
  unitsPerChapter?: number;
  /** 单章最少 unit 数 */
  minUnitsPerChapter: number;
  /** 单章最多 unit 数 */
  maxUnitsPerChapter: number;
}

export const DEFAULT_PLANNING_CONFIG: Omit<ChapterPlanningConfig, 'mode'> = {
  minUnitsPerChapter: 2,
  maxUnitsPerChapter: 30,
};

// ─── Pipeline Result ────────────────────────────────────

export interface ChapterPlanningResult {
  /** 最终章节预览 */
  chapters: ChapterPreview[];
  /** unit 列表（用于 UI 渲染 strip map） */
  units: ChapterUnit[];
  /** 候选切点（用于 UI 渲染可拖动标记） */
  candidates: CandidateCutpoint[];
  /** 实际选中的 candidate ids */
  selectedCutIds: string[];
  /** 校验结果 */
  validation: ValidationResult;
  /** 是否使用了降级路径 */
  usedFallback: boolean;
  /** 管线耗时 ms */
  durationMs: number;
}

// ─── Summary Tuning ─────────────────────────────────────

export interface ChapterPlanningSummaryTuning {
  /** 模型上下文窗口 token 数（如 128000, 32000） */
  contextWindowTokens?: number;
  /** 并发 batch 数上限（默认 3, 上限 4） */
  concurrency?: number;
}

// ─── Progress callback ─────────────────────────────────

export type ChapterPlanningStage =
  | 'detecting-boundaries'
  | 'building-units'
  | 'summarizing'
  | 'scoring-candidates'
  | 'llm-selecting'
  | 'validating'
  | 'materializing'
  | 'done'
  | 'error';

export interface ChapterPlanningProgress {
  stage: ChapterPlanningStage;
  /** 0-1 进度 */
  progress: number;
  message: string;
}

export type OnProgressCallback = (progress: ChapterPlanningProgress) => void;
