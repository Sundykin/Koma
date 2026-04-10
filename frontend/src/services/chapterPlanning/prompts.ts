/**
 * 章节规划 — LLM 切点选择 Prompt
 *
 * 构建 system prompt + user prompt，让 LLM 从候选切点中选出最佳章节边界。
 */

import type {
  ChapterUnit,
  ChapterUnitSummary,
  CandidateCutpoint,
  ChapterPlanningConfig,
} from './types';

// ─── System Prompt ─────────────────────────────────────

const SMART_SYSTEM_PROMPT = `你是一位专业的剧本编辑。你的任务是从候选切点中选出最佳的章节分割位置。

选择原则（智能模式）：
1. 尊重剧情弧线：优先在叙事转折、冲突解决、场景大幅切换处分章
2. 章节完整性：每章应有独立的起承转合
3. 悬念钩子：章节末尾应有足够的悬念推动阅读
4. 节奏均衡：避免极度不均匀的章节长度（但允许一定的差异）

你必须严格按指定格式返回 JSON，不要添加任何其他文字。`;

const EVEN_SYSTEM_PROMPT = `你是一位专业的剧本编辑。你的任务是从候选切点中选出章节分割位置。

选择原则（均匀模式）：
1. 均匀分配：章节长度尽可能接近
2. 自然断点：在相近位置有多个候选时，优先选择评分更高的自然断点
3. 完整性：不要在对话或场景中间切割

你必须严格按指定格式返回 JSON，不要添加任何其他文字。`;

const REPAIR_SYSTEM_PROMPT = `你是一位剧本编辑。你之前的切点选择有问题，请根据错误提示修正。
严格返回 JSON，格式与之前相同。`;

// ─── User Prompt Builder ───────────────────────────────

function formatUnitSummaries(
  units: ChapterUnit[],
  summaries: ChapterUnitSummary[],
): string {
  const summaryMap = new Map(summaries.map(s => [s.unitIndex, s]));

  return units.map(unit => {
    const s = summaryMap.get(unit.index);
    const parts = [
      `[${unit.index}] ${unit.label}（${unit.charCount} 字）`,
    ];
    if (s) {
      parts.push(`  摘要: ${s.summary}`);
      if (s.mainCharacters.length > 0) {
        parts.push(`  角色: ${s.mainCharacters.join('、')}`);
      }
      if (s.tone) {
        parts.push(`  氛围: ${s.tone}`);
      }
    }
    return parts.join('\n');
  }).join('\n');
}

function formatCandidates(candidates: CandidateCutpoint[]): string {
  return candidates.map(c => {
    return `  ${c.id}（在 unit[${c.afterUnitIndex}] 之后，得分 ${c.score}）: ${c.reason}`;
  }).join('\n');
}

export function buildSelectionPrompt(
  units: ChapterUnit[],
  summaries: ChapterUnitSummary[],
  candidates: CandidateCutpoint[],
  config: ChapterPlanningConfig,
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = config.mode === 'even' ? EVEN_SYSTEM_PROMPT : SMART_SYSTEM_PROMPT;

  const targetChapters = config.targetChapters
    ?? Math.ceil(units.length / (config.unitsPerChapter ?? 10));

  const numCuts = targetChapters - 1;

  const userPrompt = `## 剧本结构概览

共 ${units.length} 个单元：
${formatUnitSummaries(units, summaries)}

## 候选切点（共 ${candidates.length} 个，按评分排序）

${formatCandidates(candidates)}

## 你的任务

从上述候选中选出恰好 ${numCuts} 个切点，将剧本分为 ${targetChapters} 章。

硬性约束：
- 恰好选 ${numCuts} 个切点（不多不少）
- 只能选已列出的候选 ID
- 每章至少包含 ${config.minUnitsPerChapter} 个单元

返回格式（严格 JSON）：
\`\`\`json
{
  "selectedIds": ["cut-X", "cut-Y", ...],
  "chapterTitles": ["第一章标题", "第二章标题", ...]
}
\`\`\``;

  return { systemPrompt, userPrompt };
}

/**
 * 构建修复 prompt（当首次选择校验失败时）
 */
export function buildRepairPrompt(
  originalPrompt: string,
  issues: Array<{ code: string; message: string }>,
): { systemPrompt: string; userPrompt: string } {
  const issueText = issues.map(i => `- [${i.code}] ${i.message}`).join('\n');

  return {
    systemPrompt: REPAIR_SYSTEM_PROMPT,
    userPrompt: `${originalPrompt}\n\n## 上次选择的问题\n\n${issueText}\n\n请修正并返回正确的 JSON。`,
  };
}
