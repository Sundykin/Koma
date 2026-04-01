/**
 * AI 自动剧集服务
 * 单次调用 LLM 生成切分方案，再在本地落地切分结果
 */
import type { LLMModelConfig } from '../types';
import { createLLMProvider } from '../providers';
import { parseLLMJSON } from '../utils/llmJsonParser';
import { detectExplicitEpisodeAnalysis, materializeEpisodeSplit } from './episodeSplitUtils';
import type { SplitAnalysis, SplitResult } from './episodeSplitUtils';

const FULL_SCRIPT_ANALYSIS_CHAR_LIMIT = 36_000;
const SCRIPT_SAMPLE_COUNT = 6;
const SINGLE_EPISODE_COUNT = 1;

export interface SplitOptions {
  targetEpisodeCount?: number;
  maxEpisodeDuration?: number;
  splitStrategy: 'auto' | 'scene' | 'chapter';
}

export type { EpisodeBlueprint, SplitAnalysis, SplitPoint, SplitResult } from './episodeSplitUtils';

function buildAnalysisScript(script: string): string {
  if (script.length <= FULL_SCRIPT_ANALYSIS_CHAR_LIMIT) {
    return script;
  }

  const segmentLength = Math.floor(FULL_SCRIPT_ANALYSIS_CHAR_LIMIT / SCRIPT_SAMPLE_COUNT);
  const maxStart = Math.max(script.length - segmentLength, 0);
  const segments = Array.from({ length: SCRIPT_SAMPLE_COUNT }, (_, index) => {
    const ratio = index / (SCRIPT_SAMPLE_COUNT - SINGLE_EPISODE_COUNT);
    const start = Math.floor(maxStart * ratio);
    const end = Math.min(start + segmentLength, script.length);
    return `【片段 ${index + 1}/${SCRIPT_SAMPLE_COUNT}，原始位置 ${start}-${end}】\n${script.slice(start, end)}`;
  });

  return [
    '原始剧本较长，以下内容是按时间顺序抽样的完整剧本片段。',
    '请基于这些片段判断整体节奏，所有 splitPoints.position 都必须使用完整原始剧本的字符位置。',
    ...segments,
  ].join('\n\n');
}

function buildSplitPrompt(script: string, options: SplitOptions): string {
  const scriptForAnalysis = buildAnalysisScript(script);
  const targetCountInstruction = options.targetEpisodeCount
    ? `- 必须严格分成 ${options.targetEpisodeCount} 集`
    : '- 根据剧情自动判断合适的集数';
  const strategy = options.splitStrategy === 'scene'
    ? '按场景分割'
    : options.splitStrategy === 'chapter'
      ? '按章节分割'
      : '智能分析';

  return `请分析以下剧本结构，规划多集拆分方案。

剧本内容：
${scriptForAnalysis}

要求：
${targetCountInstruction}
- 分割策略: ${strategy}
- 若原文存在明确分集边界，必须严格遵守原文边界，不得重排集数
- splitPoints 必须按剧情顺序输出，数量必须等于 suggestedCount - 1
- marker 必须是靠近分割点的原文短语，便于在完整剧本中直接定位
- episodeBlueprints 必须按剧集顺序输出，数量必须等于 suggestedCount
- 只返回合法 JSON，不要附加说明文字

JSON 格式：
{
  "suggestedCount": 数字,
  "splitPoints": [
    { "position": 原始剧本字符位置, "marker": "分割点附近原文", "reason": "分割理由" }
  ],
  "episodeBlueprints": [
    { "title": "剧集标题", "summary": "本集摘要" }
  ],
  "reasoning": "整体分析说明"
}`;
}

export class EpisodeSplitService {
  private provider: ReturnType<typeof createLLMProvider>;
  private aborted = false;

  constructor(llmConfig: LLMModelConfig) {
    this.provider = createLLMProvider({
      provider: llmConfig.provider as any,
      apiKey: llmConfig.apiKey,
      baseUrl: llmConfig.baseUrl,
      modelName: llmConfig.modelName,
    });
  }

  abort(): void {
    this.aborted = true;
  }

  private safeParseJSON<T>(text: string): T {
    return parseLLMJSON<T>(text);
  }

  private getExplicitAnalysis(script: string, options: SplitOptions): SplitAnalysis | null {
    const analysis = detectExplicitEpisodeAnalysis(script);
    if (!analysis) {
      return null;
    }

    if (
      options.targetEpisodeCount
      && options.targetEpisodeCount !== analysis.suggestedCount
    ) {
      return {
        ...analysis,
        reasoning: `${analysis.reasoning}。用户输入目标为 ${options.targetEpisodeCount} 集，但已优先按原文识别出的 ${analysis.suggestedCount} 集拆分。`,
      };
    }

    return analysis;
  }

  async analyzeScript(script: string, options: SplitOptions): Promise<SplitAnalysis> {
    this.aborted = false;
    const explicitAnalysis = this.getExplicitAnalysis(script, options);
    if (explicitAnalysis) {
      return explicitAnalysis;
    }

    const systemPrompt = `你是一个专业的影视编剧，擅长分析剧本结构和规划剧集。
分析时请考虑：
1. 故事弧线的完整性
2. 情节的自然过渡点
3. 每集的戏剧张力
4. 角色发展的节奏`;

    const response = await this.provider.generateText(
      buildSplitPrompt(script, options),
      systemPrompt
    );

    if (this.aborted) {
      throw new Error('剧集分析已取消');
    }

    return this.safeParseJSON<SplitAnalysis>(response);
  }

  splitScript(script: string, analysis: SplitAnalysis): SplitResult[] {
    if (this.aborted) {
      throw new Error('剧集切分已取消');
    }

    return materializeEpisodeSplit(script, analysis);
  }
}

export default EpisodeSplitService;
