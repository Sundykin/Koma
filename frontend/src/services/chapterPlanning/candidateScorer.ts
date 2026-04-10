/**
 * 候选切点评分器
 *
 * 在每对相邻 unit 之间生成一个 CandidateCutpoint，
 * 基于摘要信息计算多维度得分。
 *
 * Smart 模式权重偏重叙事转折，Even 模式权重偏重均匀分布（锚点吻合）。
 */

import type {
  ChapterUnit,
  ChapterUnitSummary,
  CandidateCutpoint,
  CutpointScoreBreakdown,
  ChapterPlanningMode,
  ChapterPlanningConfig,
} from './types';

// ─── 权重配置 ──────────────────────────────────────────

interface ScoreWeights {
  narrativeShift: number;
  hookStrength: number;
  castShift: number;
  locationShift: number;
  structureCue: number;
  anchorFit: number;
}

const SMART_WEIGHTS: ScoreWeights = {
  narrativeShift: 0.30,
  hookStrength: 0.20,
  castShift: 0.15,
  locationShift: 0.10,
  structureCue: 0.10,
  anchorFit: 0.15,
};

const EVEN_WEIGHTS: ScoreWeights = {
  narrativeShift: 0.10,
  hookStrength: 0.10,
  castShift: 0.10,
  locationShift: 0.05,
  structureCue: 0.10,
  anchorFit: 0.55,
};

function getWeights(mode: ChapterPlanningMode): ScoreWeights {
  return mode === 'even' ? EVEN_WEIGHTS : SMART_WEIGHTS;
}

// ─── 分项评分函数 ──────────────────────────────────────

/**
 * Jaccard 距离：两个集合的差异度 (0=完全相同, 1=完全不同)
 */
function jaccardDistance(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : 1 - intersection / union;
}

/**
 * 提取中文 bigram 集合（连续字符对），用于文本相似度比较。
 * 比单字符重叠更能区分不同的中文摘要内容。
 */
function extractBigrams(text: string): Set<string> {
  // 归一化：去标点、空白，保留中文/英文/数字
  const normalized = text.replace(/[^\u4e00-\u9fff\w]/g, '');
  const bigrams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.add(normalized.slice(i, i + 2));
  }
  // 长度不足 2 时退化为 unigram
  if (bigrams.size === 0 && normalized.length === 1) {
    bigrams.add(normalized);
  }
  return bigrams;
}

/**
 * 基于 bigram Jaccard 距离和 tone 变化估计叙事转折
 */
function scoreNarrativeShift(
  before: ChapterUnitSummary | undefined,
  after: ChapterUnitSummary | undefined,
): number {
  if (!before || !after) return 0.3; // 边缘默认

  // Tone 变化 (0 或 1)
  const toneShift = (before.tone && after.tone && before.tone !== after.tone) ? 1 : 0;
  // tone 缺失时使用中性值
  const hasTone = !!(before.tone && after.tone);

  // Bigram Jaccard 距离
  const bigramsB = extractBigrams(before.summary);
  const bigramsA = extractBigrams(after.summary);
  let lexicalShift = 0;
  if (bigramsB.size > 0 || bigramsA.size > 0) {
    const intersection = [...bigramsB].filter(b => bigramsA.has(b)).length;
    const union = new Set([...bigramsB, ...bigramsA]).size;
    lexicalShift = union > 0 ? 1 - intersection / union : 0;
  }

  const toneComponent = hasTone ? toneShift : 0.35;
  return Math.min(1, lexicalShift * 0.72 + toneComponent * 0.28);
}

/**
 * 钩子强度 — 分级悬念关键词词典 + 前后不对称加权
 *
 * 四级权重: critical > strong > medium > weak
 * 同级多次命中取 max（防刷分），跨级叠加
 * 前段结尾悬念(0.68) + 后段开头吸引力(0.24) + 多样性奖励 + 升级奖励
 */
interface HookTier {
  weight: number;
  keywords: string[];
}

const HOOK_TIERS: HookTier[] = [
  {
    weight: 0.38,
    keywords: [
      '死', '杀', '死亡', '牺牲', '毁灭', '灭亡',
      '背叛', '叛变', '出卖',
      '爆炸', '崩塌', '毁',
    ],
  },
  {
    weight: 0.24,
    keywords: [
      '危机', '冲突', '困境', '绝境', '陷阱',
      '消失', '失踪', '逃', '逃亡', '追杀',
      '秘密', '真相', '阴谋', '暗中',
      '决裂', '对峙', '摊牌',
    ],
  },
  {
    weight: 0.14,
    keywords: [
      '悬念', '突然', '意外', '震惊', '转折',
      '发现', '揭露', '暴露', '揭穿',
      '威胁', '警告', '预言', '诅咒',
      '误会', '谎言', '隐瞒',
    ],
  },
  {
    weight: 0.08,
    keywords: [
      '离别', '分别', '重逢', '相认',
      '怀疑', '犹豫', '动摇', '挣扎',
      '承诺', '誓言', '约定',
      '线索', '暗示', '伏笔',
    ],
  },
];

function tierMaxScore(text: string, tiers: HookTier[]): number {
  let total = 0;
  for (const tier of tiers) {
    const hit = tier.keywords.some(kw => text.includes(kw));
    if (hit) total += tier.weight;
  }
  return total;
}

function scoreHookStrength(
  before: ChapterUnitSummary | undefined,
  after: ChapterUnitSummary | undefined,
): number {
  if (!before || !after) return 0.2;

  const endHook = tierMaxScore(before.summary, HOOK_TIERS);
  const openPull = tierMaxScore(after.summary, HOOK_TIERS);

  // 前后不对称加权
  let score = endHook * 0.68 + openPull * 0.24;

  // 多样性奖励：前后都命中不同层级时 +0.05
  const beforeTiers = HOOK_TIERS.filter(t => t.keywords.some(kw => before.summary.includes(kw)));
  const afterTiers = HOOK_TIERS.filter(t => t.keywords.some(kw => after.summary.includes(kw)));
  if (beforeTiers.length > 0 && afterTiers.length > 0) {
    score += 0.05;
  }

  // 升级奖励：后段出现更高级别悬念时 +0.03
  if (afterTiers.length > 0 && beforeTiers.length > 0) {
    const bestAfter = Math.max(...afterTiers.map(t => t.weight));
    const bestBefore = Math.max(...beforeTiers.map(t => t.weight));
    if (bestAfter > bestBefore) {
      score += 0.03;
    }
  }

  return Math.min(1, score);
}

function scoreCastShift(
  before: ChapterUnitSummary | undefined,
  after: ChapterUnitSummary | undefined,
): number {
  if (!before || !after) return 0.3;
  return jaccardDistance(before.mainCharacters, after.mainCharacters);
}

function scoreLocationShift(
  before: ChapterUnitSummary | undefined,
  after: ChapterUnitSummary | undefined,
): number {
  if (!before || !after) return 0.3;
  return jaccardDistance(before.mainLocations, after.mainLocations);
}

/**
 * 结构标记：检查 unit label 中是否有结构化线索
 */
const STRUCTURE_CUES = ['大结局', '番外', '尾声', '序章', '终章', '下半', '上半', '前传', '后传'];

function scoreStructureCue(
  _before: ChapterUnit | undefined,
  after: ChapterUnit | undefined,
): number {
  if (!after) return 0;
  const label = after.label;
  const hasCue = STRUCTURE_CUES.some(cue => label.includes(cue));
  return hasCue ? 0.9 : 0.1;
}

/**
 * 锚点吻合度 — 切点位置距离理想均匀切点的接近程度
 */
function scoreAnchorFit(
  afterUnitIndex: number,
  totalUnits: number,
  config: ChapterPlanningConfig,
): number {
  const targetChapters = config.targetChapters
    ?? Math.ceil(totalUnits / (config.unitsPerChapter ?? 10));

  if (targetChapters <= 1) return 0.5;

  const idealStep = totalUnits / targetChapters;
  let bestDistance = Infinity;

  // 找到最近的理想切点
  for (let i = 1; i < targetChapters; i++) {
    const idealPosition = i * idealStep;
    const distance = Math.abs(afterUnitIndex + 0.5 - idealPosition);
    bestDistance = Math.min(bestDistance, distance);
  }

  // 归一化为 0-1（距离越近分越高）
  const maxDistance = idealStep / 2;
  return Math.max(0, 1 - bestDistance / maxDistance);
}

// ─── 主评分函数 ────────────────────────────────────────

function computeBreakdown(
  afterUnitIndex: number,
  units: ChapterUnit[],
  summaryMap: Map<number, ChapterUnitSummary>,
  config: ChapterPlanningConfig,
): CutpointScoreBreakdown {
  const before = summaryMap.get(afterUnitIndex);
  const after = summaryMap.get(afterUnitIndex + 1);
  const beforeUnit = units[afterUnitIndex];
  const afterUnit = units[afterUnitIndex + 1];

  return {
    narrativeShift: scoreNarrativeShift(before, after),
    hookStrength: scoreHookStrength(before, after),
    castShift: scoreCastShift(before, after),
    locationShift: scoreLocationShift(before, after),
    structureCue: scoreStructureCue(beforeUnit, afterUnit),
    anchorFit: scoreAnchorFit(afterUnitIndex, units.length, config),
  };
}

function computeWeightedScore(
  breakdown: CutpointScoreBreakdown,
  weights: ScoreWeights,
): number {
  return (
    breakdown.narrativeShift * weights.narrativeShift +
    breakdown.hookStrength * weights.hookStrength +
    breakdown.castShift * weights.castShift +
    breakdown.locationShift * weights.locationShift +
    breakdown.structureCue * weights.structureCue +
    breakdown.anchorFit * weights.anchorFit
  );
}

function buildReason(breakdown: CutpointScoreBreakdown): string {
  const parts: string[] = [];
  if (breakdown.narrativeShift > 0.5) parts.push('叙事转折');
  if (breakdown.hookStrength > 0.5) parts.push('悬念钩子');
  if (breakdown.castShift > 0.5) parts.push('角色阵容变化');
  if (breakdown.locationShift > 0.5) parts.push('场景转换');
  if (breakdown.structureCue > 0.5) parts.push('结构标记');
  if (breakdown.anchorFit > 0.7) parts.push('均匀锚点');
  return parts.length > 0 ? parts.join('、') : '综合评估';
}

// ─── Public API ────────────────────────────────────────

/**
 * 为所有相邻 unit 对生成候选切点并评分
 *
 * @returns 按 score 降序排列的候选切点数组
 */
export function generateCandidateCutpoints(
  units: ChapterUnit[],
  summaries: ChapterUnitSummary[],
  config: ChapterPlanningConfig,
): CandidateCutpoint[] {
  if (units.length < 2) return [];

  const summaryMap = new Map(summaries.map(s => [s.unitIndex, s]));
  const weights = getWeights(config.mode);

  const candidates: CandidateCutpoint[] = [];

  for (let i = 0; i < units.length - 1; i++) {
    const breakdown = computeBreakdown(i, units, summaryMap, config);
    const score = computeWeightedScore(breakdown, weights);

    candidates.push({
      id: `cut-${i}`,
      afterUnitIndex: i,
      score: Math.round(score * 1000) / 1000,
      breakdown,
      reason: buildReason(breakdown),
    });
  }

  // 按 score 降序
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}

/**
 * 从候选中选出 top-K 作为 LLM 的候选集（减少 LLM 选择空间）
 *
 * @param topK 保留候选数量（默认为 targetChapters * 3）
 */
export function selectTopCandidates(
  candidates: CandidateCutpoint[],
  config: ChapterPlanningConfig,
  topK?: number,
): CandidateCutpoint[] {
  const targetChapters = config.targetChapters
    ?? Math.ceil(candidates.length / (config.unitsPerChapter ?? 10));
  const k = topK ?? Math.max(targetChapters * 3, 10);
  return candidates.slice(0, Math.min(k, candidates.length));
}
