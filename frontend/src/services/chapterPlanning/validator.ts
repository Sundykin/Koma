/**
 * 章节选择校验器
 *
 * 校验 LLM 选出的切点 IDs 是否合法，
 * 支持自动修复（去重、排序、补齐）和降级策略。
 */

import type {
  CandidateCutpoint,
  ChapterUnit,
  ChapterPlanningConfig,
  ValidationIssue,
  ValidationResult,
} from './types';

// ─── 校验规则 ──────────────────────────────────────────

function checkDuplicates(ids: string[]): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({
        code: 'DUPLICATE_CUT',
        message: `重复选择了切点 ${id}`,
        severity: 'warning',
        autoFixable: true,
      });
    }
    seen.add(id);
  }
  return issues;
}

function checkUnknownCandidates(
  ids: string[],
  candidateMap: Map<string, CandidateCutpoint>,
): ValidationIssue[] {
  return ids
    .filter(id => !candidateMap.has(id))
    .map(id => ({
      code: 'UNKNOWN_CANDIDATE' as const,
      message: `未知的候选切点 ${id}`,
      severity: 'error' as const,
      autoFixable: true,
    }));
}

function checkOutOfRange(
  ids: string[],
  candidateMap: Map<string, CandidateCutpoint>,
  totalUnits: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const id of ids) {
    const candidate = candidateMap.get(id);
    if (candidate && (candidate.afterUnitIndex < 0 || candidate.afterUnitIndex >= totalUnits - 1)) {
      issues.push({
        code: 'OUT_OF_RANGE',
        message: `切点 ${id} 的位置 ${candidate.afterUnitIndex} 超出范围 [0, ${totalUnits - 2}]`,
        severity: 'error',
        autoFixable: true,
      });
    }
  }
  return issues;
}

function checkChapterSizes(
  sortedCutIndices: number[],
  totalUnits: number,
  config: ChapterPlanningConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const boundaries = [0, ...sortedCutIndices.map(i => i + 1), totalUnits];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const size = end - start;

    if (size <= 0) {
      issues.push({
        code: 'EMPTY_CHAPTER',
        message: `第 ${i + 1} 章为空 (unit ${start} 到 ${end})`,
        severity: 'error',
        autoFixable: true,
      });
    } else if (size < config.minUnitsPerChapter) {
      issues.push({
        code: 'CHAPTER_TOO_SHORT',
        message: `第 ${i + 1} 章仅含 ${size} 个单元，低于最小值 ${config.minUnitsPerChapter}`,
        severity: 'error',
        autoFixable: true,
      });
    } else if (size > config.maxUnitsPerChapter) {
      issues.push({
        code: 'CHAPTER_TOO_LONG',
        message: `第 ${i + 1} 章含 ${size} 个单元，超过最大值 ${config.maxUnitsPerChapter}`,
        severity: 'warning',
        autoFixable: false,
      });
    }
  }

  return issues;
}

function checkCutCount(
  validCutCount: number,
  config: ChapterPlanningConfig,
  totalUnits: number,
): ValidationIssue[] {
  const targetChapters = config.targetChapters
    ?? Math.ceil(totalUnits / (config.unitsPerChapter ?? 10));
  const expectedCuts = Math.max(0, targetChapters - 1);

  if (validCutCount !== expectedCuts) {
    return [{
      code: 'WRONG_CUT_COUNT',
      message: `选择了 ${validCutCount} 个切点，期望 ${expectedCuts} 个（目标 ${targetChapters} 章）`,
      severity: 'error',
      autoFixable: true,
    }];
  }
  return [];
}

function checkAdjacentCuts(sortedCutIndices: number[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 1; i < sortedCutIndices.length; i++) {
    if (sortedCutIndices[i] - sortedCutIndices[i - 1] <= 1) {
      issues.push({
        code: 'ADJACENT_CUTS',
        message: `切点 ${sortedCutIndices[i - 1]} 和 ${sortedCutIndices[i]} 位置相同或相邻`,
        severity: 'error',
        autoFixable: true,
      });
    }
  }
  return issues;
}

// ─── 自动修复 ──────────────────────────────────────────

function repairSelection(
  ids: string[],
  candidateMap: Map<string, CandidateCutpoint>,
  totalUnits: number,
): string[] {
  // 1. 去重 + 过滤未知候选
  const unique = [...new Set(ids)].filter(id => candidateMap.has(id));

  // 2. 过滤越界
  const inRange = unique.filter(id => {
    const c = candidateMap.get(id)!;
    return c.afterUnitIndex >= 0 && c.afterUnitIndex < totalUnits - 1;
  });

  // 3. 按 afterUnitIndex 排序并去除重叠或相邻的 index
  const sorted = inRange
    .map(id => ({ id, index: candidateMap.get(id)!.afterUnitIndex }))
    .sort((a, b) => a.index - b.index);

  const deduped: string[] = [];
  let lastIndex = -Infinity;
  for (const item of sorted) {
    if (item.index - lastIndex > 1) {
      deduped.push(item.id);
      lastIndex = item.index;
    }
  }

  return deduped;
}

// ─── Public API ────────────────────────────────────────

/**
 * 校验 LLM 选出的切点 IDs
 */
export function validateChapterSelection(
  selectedIds: string[],
  candidates: CandidateCutpoint[],
  units: ChapterUnit[],
  config: ChapterPlanningConfig,
): ValidationResult {
  const candidateMap = new Map(candidates.map(c => [c.id, c]));

  const allIssues: ValidationIssue[] = [
    ...checkDuplicates(selectedIds),
    ...checkUnknownCandidates(selectedIds, candidateMap),
    ...checkOutOfRange(selectedIds, candidateMap, units.length),
  ];

  // Resolve valid cut indices for size checks
  const validIds = selectedIds.filter(id => candidateMap.has(id));
  const sortedCutIndices = validIds
    .map(id => candidateMap.get(id)!.afterUnitIndex)
    .sort((a, b) => a - b);

  allIssues.push(...checkCutCount(sortedCutIndices.length, config, units.length));
  allIssues.push(...checkAdjacentCuts(sortedCutIndices));
  allIssues.push(...checkChapterSizes(sortedCutIndices, units.length, config));

  const hasErrors = allIssues.some(i => i.severity === 'error');
  const hasAutoFixable = allIssues.some(i => i.autoFixable);

  let repairedIds: string[] | undefined;
  if (hasErrors && hasAutoFixable) {
    repairedIds = repairSelection(selectedIds, candidateMap, units.length);
  }

  return {
    valid: !hasErrors,
    issues: allIssues,
    repairedIds,
  };
}

/**
 * 确定性降级：均匀选择切点（当 LLM 结果不可用时）
 */
export function deterministicFallback(
  candidates: CandidateCutpoint[],
  units: ChapterUnit[],
  config: ChapterPlanningConfig,
): string[] {
  const targetChapters = config.targetChapters
    ?? Math.ceil(units.length / (config.unitsPerChapter ?? 10));

  if (targetChapters <= 1 || units.length <= 1) return [];

  const numCuts = Math.min(targetChapters - 1, units.length - 1);
  const step = units.length / targetChapters;

  // 在每个理想均匀位置，找 score 最高的候选
  const candidateByIndex = new Map<number, CandidateCutpoint>();
  for (const c of candidates) {
    const existing = candidateByIndex.get(c.afterUnitIndex);
    if (!existing || c.score > existing.score) {
      candidateByIndex.set(c.afterUnitIndex, c);
    }
  }

  const selectedIds: string[] = [];
  const usedIndices = new Set<number>();

  for (let i = 1; i <= numCuts; i++) {
    const idealPos = Math.round(i * step) - 1;

    // Search window around ideal position
    let bestCandidate: CandidateCutpoint | null = null;
    let bestScore = -1;
    const searchRadius = Math.max(2, Math.floor(step / 2));

    for (let offset = 0; offset <= searchRadius; offset++) {
      for (const delta of offset === 0 ? [0] : [-offset, offset]) {
        const idx = idealPos + delta;
        if (idx < 0 || idx >= units.length - 1 || usedIndices.has(idx)) continue;
        const c = candidateByIndex.get(idx);
        if (c && c.score > bestScore) {
          bestCandidate = c;
          bestScore = c.score;
        }
      }
    }

    if (bestCandidate) {
      selectedIds.push(bestCandidate.id);
      usedIndices.add(bestCandidate.afterUnitIndex);
    }
  }

  return selectedIds;
}
