/**
 * 章节规划服务 — 公共 API
 */

export { planChapters } from './ChapterPlanningService';
export type { PlanChaptersOptions } from './ChapterPlanningService';

export { buildUnits, extractUnitText, extractUnitsText } from './unitBuilder';
export type { BuildUnitsResult } from './unitBuilder';

export { generateCandidateCutpoints, selectTopCandidates } from './candidateScorer';
export { validateChapterSelection, deterministicFallback } from './validator';
export { summarizeUnitsInBatches } from './summaryService';

export type {
  ChapterUnit,
  EpisodeUnit,
  BlockUnit,
  ChapterUnitSummary,
  CandidateCutpoint,
  CutpointScoreBreakdown,
  LLMChapterSelection,
  ValidationResult,
  ValidationIssue,
  ChapterPreview,
  ChapterPlanningConfig,
  ChapterPlanningMode,
  ChapterPlanningResult,
  ChapterPlanningStage,
  ChapterPlanningProgress,
  ChapterPlanningSummaryTuning,
  OnProgressCallback,
} from './types';

export { DEFAULT_PLANNING_CONFIG } from './types';
