/**
 * 短剧风格标签分析：吃剧本 / 小说，输出三轴标签（题材 / 调性 / 前提装置）。
 *
 * 只做判定，不落库——回填由项目设置页决定，用户随时可以手改覆盖。
 * LLM 输出的自由标签一律经 normalizeGenreTags 归一到卡名，命中不了的直接丢弃，
 * 避免"AI 编了个新题材，下游找不到对应卡片"。
 */
import type { DramaGenreTags } from '../types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { getProjectLLMProvider } from '../providers';
import { parseLLMJSON } from '../utils/llmJsonParser';
import { createLogger } from '../store/logger';
import { buildGenreOptionList, normalizeGenreTags } from './dramaGenreTags';

const logger = createLogger('DramaGenreAnalysis');

/** 分析用的剧本上限：标签判定只需要看骨架，全本喂进去纯烧 token。 */
const MAX_ANALYSIS_CHARS = 8000;

export async function analyzeDramaGenreTags(script: string): Promise<DramaGenreTags> {
  const text = (script || '').trim();
  if (!text) throw new Error('没有可分析的剧本内容');

  const provider = await getProjectLLMProvider();
  if (!provider) throw new Error('未配置 LLM 模型');

  // 超长时取头尾：开头定题材与装置，结尾定调性走向（BE / 团圆 / 反转）
  const sample = text.length > MAX_ANALYSIS_CHARS
    ? `${text.slice(0, MAX_ANALYSIS_CHARS * 0.7)}\n……（中间略）……\n${text.slice(-MAX_ANALYSIS_CHARS * 0.3)}`
    : text;

  const resolved = await resolvePromptTemplate('drama_genre_analysis', {
    script: sample,
    genreOptions: buildGenreOptionList('genre'),
    toneOptions: buildGenreOptionList('tone'),
    deviceOptions: buildGenreOptionList('device'),
  });

  const response = await provider.chat([{ role: 'user', content: resolved.prompt }], {
    source: 'DramaGenreAnalysisService.analyze',
    operation: 'drama_genre_analysis',
    taskKind: 'analyze',
    targetName: '短剧风格标签分析',
  });

  let raw: DramaGenreTags;
  try {
    raw = parseLLMJSON<DramaGenreTags>(response);
  } catch (err) {
    logger.error('风格标签分析结果解析失败', {
      error: err instanceof Error ? err.message : String(err),
      response: response.slice(0, 400),
    });
    throw new Error('风格标签分析结果不是合法 JSON，请重试');
  }

  const normalized = normalizeGenreTags(raw);
  logger.info('风格标签分析完成', {
    scriptLength: text.length,
    sampled: sample.length !== text.length,
    raw: { genre: raw.genre, tones: raw.tones, premiseDevices: raw.premiseDevices },
    normalized,
  });
  return { ...normalized, analyzedAt: Date.now() };
}
