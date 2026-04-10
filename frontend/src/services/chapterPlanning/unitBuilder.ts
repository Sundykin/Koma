/**
 * Unit Builder — 将剧本拆分为最小不可分割的 ChapterUnit 数组
 *
 * 双模式:
 * 1. Episode 模式: 检测到 ≥2 个集标记时，每集一个 unit
 * 2. Block 模式: 无集标记时，按段落/场景边界分块（带 offset）
 *
 * 复用 episodeBoundaryDetector 做集标记检测，
 * 复用 scriptAnalysisChunking 的 SCENE_BOUNDARY_RE 做段落分割。
 */

import { detectExplicitEpisodeBoundaries } from '../episodeBoundaryDetector';
import type { EpisodeBoundary } from '../episodeBoundaryDetector';
import { SCENE_BOUNDARY_RE } from '../scriptAnalysisChunking';
import type { ChapterUnit, EpisodeUnit, BlockUnit } from './types';

/** Block 模式下的目标块大小（字符数） */
const BLOCK_TARGET_CHARS = 3000;
/** Block 模式下的最大块大小 */
const BLOCK_MAX_CHARS = 5000;
/** Block 模式下的最小块大小（避免碎片化） */
const BLOCK_MIN_CHARS = 800;

// ─── Episode 模式 ──────────────────────────────────────

function buildEpisodeUnits(
  script: string,
  boundaries: EpisodeBoundary[],
): EpisodeUnit[] {
  const units: EpisodeUnit[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const nextBoundary = boundaries[i + 1];

    const startOffset = boundary.contentStart;
    const endOffset = nextBoundary ? nextBoundary.start : script.length;

    units.push({
      kind: 'episode',
      index: i,
      label: boundary.title,
      episodeNumber: boundary.episodeNumber,
      startOffset,
      endOffset,
      charCount: endOffset - startOffset,
    });
  }

  return units;
}

// ─── Block 模式 ────────────────────────────────────────

interface RawBlock {
  content: string;
  startOffset: number;
  endOffset: number;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * 将剧本按段落/场景边界切成带 offset 的原始块
 */
function splitIntoRawBlocks(script: string): RawBlock[] {
  const normalized = normalizeNewlines(script);
  const lines = normalized.split('\n');
  const blocks: RawBlock[] = [];
  let currentLines: string[] = [];
  let blockStartOffset = 0;
  let cursor = 0;

  for (const line of lines) {
    const lineEnd = cursor + line.length + 1; // +1 for \n
    const isBoundary = SCENE_BOUNDARY_RE.test(line.trim());

    if (isBoundary && currentLines.length > 0) {
      const content = currentLines.join('\n').trim();
      if (content) {
        blocks.push({
          content,
          startOffset: blockStartOffset,
          endOffset: cursor,
        });
      }
      currentLines = [line];
      blockStartOffset = cursor;
    } else {
      currentLines.push(line);
    }

    cursor = lineEnd;
  }

  // Last block
  if (currentLines.length > 0) {
    const content = currentLines.join('\n').trim();
    if (content) {
      blocks.push({
        content,
        startOffset: blockStartOffset,
        endOffset: cursor - 1, // no trailing \n
      });
    }
  }

  return blocks;
}

/**
 * 将过长的 block 在合理断点处拆分
 */
function splitLongBlock(block: RawBlock): RawBlock[] {
  if (block.content.length <= BLOCK_MAX_CHARS) {
    return [block];
  }

  const results: RawBlock[] = [];
  let remaining = block.content;
  let offset = block.startOffset;

  while (remaining.length > BLOCK_MAX_CHARS) {
    const candidate = remaining.slice(0, BLOCK_MAX_CHARS);
    const breakpoints = [
      candidate.lastIndexOf('\n\n'),
      candidate.lastIndexOf('\n'),
      candidate.lastIndexOf('。'),
      candidate.lastIndexOf('！'),
      candidate.lastIndexOf('？'),
    ].filter(idx => idx >= Math.floor(BLOCK_TARGET_CHARS * 0.5));

    const splitIndex = breakpoints.length > 0
      ? Math.max(...breakpoints) + 1
      : BLOCK_MAX_CHARS;

    const piece = remaining.slice(0, splitIndex).trim();
    if (piece) {
      results.push({
        content: piece,
        startOffset: offset,
        endOffset: offset + splitIndex,
      });
    }

    remaining = remaining.slice(splitIndex).trim();
    offset += splitIndex;
  }

  if (remaining) {
    results.push({
      content: remaining,
      startOffset: offset,
      endOffset: block.endOffset,
    });
  }

  return results;
}

/**
 * 合并过小的相邻块
 */
function mergeSmallBlocks(blocks: RawBlock[]): RawBlock[] {
  if (blocks.length <= 1) return blocks;

  const merged: RawBlock[] = [];
  let current = blocks[0];

  for (let i = 1; i < blocks.length; i++) {
    const next = blocks[i];
    const combinedLength = current.content.length + next.content.length + 2; // +2 for \n\n

    if (current.content.length < BLOCK_MIN_CHARS && combinedLength <= BLOCK_MAX_CHARS) {
      // Merge into current
      current = {
        content: `${current.content}\n\n${next.content}`,
        startOffset: current.startOffset,
        endOffset: next.endOffset,
      };
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);
  return merged;
}

function buildBlockUnits(script: string): BlockUnit[] {
  const rawBlocks = splitIntoRawBlocks(script);
  const split = rawBlocks.flatMap(splitLongBlock);
  const final = mergeSmallBlocks(split);

  return final.map((block, index) => ({
    kind: 'block' as const,
    index,
    label: `段落 ${index + 1}`,
    startOffset: block.startOffset,
    endOffset: block.endOffset,
    charCount: block.content.length,
  }));
}

// ─── Public API ────────────────────────────────────────

export interface BuildUnitsResult {
  units: ChapterUnit[];
  /** 检测到的集边界（仅 episode 模式有值） */
  boundaries: EpisodeBoundary[];
  /** episode | block */
  mode: 'episode' | 'block';
}

/**
 * 从剧本文本构建 ChapterUnit 数组
 *
 * 优先使用 episode 模式（检测到 ≥2 个集标记）。
 * 无显式集标记时降级为 block 模式。
 *
 * @param overrideBoundaries — 外部传入的集边界（如 LLM 管线检测结果），
 *   传入后跳过内部 regex 检测。
 */
export function buildUnits(
  script: string,
  options?: { overrideBoundaries?: EpisodeBoundary[] },
): BuildUnitsResult {
  const boundaries = options?.overrideBoundaries ?? detectExplicitEpisodeBoundaries(script);

  if (boundaries.length >= 2) {
    return {
      units: buildEpisodeUnits(script, boundaries),
      boundaries,
      mode: 'episode',
    };
  }

  return {
    units: buildBlockUnits(script),
    boundaries: [],
    mode: 'block',
  };
}

/**
 * 提取 unit 对应的原始文本
 */
export function extractUnitText(script: string, unit: ChapterUnit): string {
  return script.slice(unit.startOffset, unit.endOffset).trim();
}

/**
 * 提取多个连续 unit 的合并文本
 */
export function extractUnitsText(
  script: string,
  units: ChapterUnit[],
  startIndex: number,
  endIndex: number,
): string {
  const start = units[startIndex]?.startOffset ?? 0;
  const end = units[endIndex]?.endOffset ?? script.length;
  return script.slice(start, end).trim();
}
