/**
 * 剧本采样工具 — 为长文本 LLM 调用提取代表性片段
 *
 * 从 EpisodeSplitService 的 bookends + middle segments 模式提炼为通用工具。
 * 支持按 ChapterUnit 级别采样，也支持原始文本采样。
 */

import type { ChapterUnit } from './types';
import { SCENE_BOUNDARY_RE } from '../scriptAnalysisChunking';

/** 单个 unit 采样的最大字符数 */
const UNIT_SAMPLE_MAX_CHARS = 2000;
/** unit 的 bookend 大小（头尾各取） */
const UNIT_BOOKEND_SIZE = 600;

const OMISSION_MARKER = '\n[...]\n';

/**
 * 对单个 unit 的文本进行采样（头尾 + 中间）
 * 短文本直接返回，长文本取 bookends。
 */
export function sampleUnitText(fullText: string): string {
  const text = fullText.trim();
  if (text.length <= UNIT_SAMPLE_MAX_CHARS) {
    return text;
  }

  const opening = text.slice(0, UNIT_BOOKEND_SIZE);
  const closing = text.slice(-UNIT_BOOKEND_SIZE);
  return `${opening}${OMISSION_MARKER}${closing}`;
}

/**
 * 批量采样：从原始 script 中按 unit 范围提取并采样文本
 */
export function sampleUnitsForBatch(
  script: string,
  units: ChapterUnit[],
  batchStart: number,
  batchEnd: number,
): Array<{ unitIndex: number; label: string; sample: string }> {
  const results: Array<{ unitIndex: number; label: string; sample: string }> = [];

  for (let i = batchStart; i <= batchEnd && i < units.length; i++) {
    const unit = units[i];
    const rawText = script.slice(unit.startOffset, unit.endOffset).trim();
    results.push({
      unitIndex: unit.index,
      label: unit.label,
      sample: sampleUnitText(rawText),
    });
  }

  return results;
}

/**
 * 在 script 的指定区间中查找场景边界位置
 */
function findSceneBoundaries(script: string, from: number, to: number): number[] {
  const segment = script.slice(from, to);
  const positions: number[] = [];
  const lines = segment.split('\n');
  let cursor = 0;

  for (const line of lines) {
    if (SCENE_BOUNDARY_RE.test(line.trim())) {
      positions.push(from + cursor);
    }
    cursor += line.length + 1;
  }

  return positions;
}

/** 原始文本级别的采样参数 */
interface RawSamplingOptions {
  /** 总字符预算 */
  charBudget?: number;
  /** bookend 大小 */
  bookendSize?: number;
  /** 中间段落数量上限 */
  maxMiddleSegments?: number;
}

const DEFAULT_CHAR_BUDGET = 36_000;
const DEFAULT_BOOKEND_SIZE = 3_000;
const DEFAULT_MAX_MIDDLE_SEGMENTS = 12;
const MIDDLE_SEGMENT_MIN = 3_000;
const MIDDLE_SEGMENT_MAX = 6_000;

/**
 * 对原始剧本文本做 bookend + middle 采样
 * 短文本直接返回，长文本提取代表性片段并标注原始位置。
 */
export function sampleRawScript(
  script: string,
  options?: RawSamplingOptions,
): string {
  const charBudget = options?.charBudget ?? DEFAULT_CHAR_BUDGET;
  const bookendSize = options?.bookendSize ?? DEFAULT_BOOKEND_SIZE;
  const maxMiddleSegments = options?.maxMiddleSegments ?? DEFAULT_MAX_MIDDLE_SEGMENTS;
  const totalLength = script.length;

  if (totalLength <= charBudget) {
    return script;
  }

  // Opening bookend
  const openingEnd = Math.min(bookendSize, totalLength);
  const opening = script.slice(0, openingEnd);

  // Closing bookend
  const closingStart = Math.max(totalLength - bookendSize, openingEnd);
  const closing = script.slice(closingStart);

  // Middle segments
  const middleFrom = openingEnd;
  const middleTo = closingStart;
  const middleLength = middleTo - middleFrom;

  if (middleLength <= 0) {
    return `${opening}${OMISSION_MARKER}${closing}`;
  }

  const segmentCount = Math.min(maxMiddleSegments, Math.ceil(middleLength / 6000));
  const boundaries = findSceneBoundaries(script, middleFrom, middleTo);

  const segments: string[] = [];

  if (boundaries.length >= segmentCount) {
    // Evenly pick from boundaries
    const step = boundaries.length / segmentCount;
    for (let i = 0; i < segmentCount; i++) {
      const boundaryIdx = Math.floor(i * step);
      const start = boundaries[boundaryIdx];
      const segSize = Math.min(MIDDLE_SEGMENT_MIN, middleTo - start);
      segments.push(script.slice(start, start + segSize));
    }
  } else {
    // Evenly space + snap to boundary
    const step = middleLength / (segmentCount + 1);
    for (let i = 1; i <= segmentCount; i++) {
      let target = middleFrom + Math.floor(i * step);
      // Snap to nearest boundary if within range
      const nearby = boundaries.find(b => Math.abs(b - target) < 2000);
      if (nearby !== undefined) {
        target = nearby;
      }
      const segSize = Math.max(
        MIDDLE_SEGMENT_MIN,
        Math.min(MIDDLE_SEGMENT_MAX, Math.floor(step)),
      );
      const segEnd = Math.min(target + segSize, middleTo);
      segments.push(script.slice(target, segEnd));
    }
  }

  // Assemble with position labels
  const totalSegments = segments.length + 2;
  const parts: string[] = [
    `【片段 1/${totalSegments}，位置 0-${openingEnd}】\n${opening}`,
  ];

  for (let i = 0; i < segments.length; i++) {
    parts.push(`【片段 ${i + 2}/${totalSegments}，中间采样】\n${segments[i]}`);
  }

  parts.push(
    `【片段 ${totalSegments}/${totalSegments}，位置 ${closingStart}-${totalLength}】\n${closing}`,
  );

  return parts.join(OMISSION_MARKER);
}
