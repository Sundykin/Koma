/**
 * 短剧风格标签：把项目的三轴标签解析成可注入推理的「风格约束段」。
 *
 * 三轴各管一件事：
 *   - 题材（genre）  压力从哪来 → 影响分镜拆解怎么选冲突点和集尾钩子
 *   - 调性（tone）   台词与镜头怎么演 → 影响台词语气、动作幅度、节奏、镜头取向
 *   - 装置（device） 主角比别人多什么 → 影响能力边界与代价怎么写
 *
 * 注入纪律（沿用 drama-skills 的核心约束，也是我们自己的 token 纪律）：
 *   **只注入一张主题材整卡**；辅题材各摘 1-2 条；调性与装置卡本身就很短，可全给。
 *   两套题材打法并行铺满，既撑爆推理输入，也让模型不知道主要矛盾归谁。
 */
import type { DramaGenreTags } from '../types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import type { PromptTemplateType } from '../store/promptTemplates';
import {
  listCardsOfKind,
  matchGenreCard,
  type GenreCardKind,
} from '../store/templates/genreCards';
import { createLogger } from '../store/logger';

const logger = createLogger('DramaGenreTags');

/** 辅题材最多取几条（每条是主卡里的一行） */
const SUB_GENRE_EXCERPT_LINES = 2;
/** 辅题材最多几个 */
const MAX_SUB_GENRES = 2;

export function hasGenreTags(tags?: DramaGenreTags): boolean {
  if (!tags) return false;
  return Boolean(
    tags.genre
    || tags.subGenres?.length
    || tags.tones?.length
    || tags.premiseDevices?.length,
  );
}

/** 卡片正文（去掉溯源注释与 frontmatter，只留可注入的条目）。 */
async function readCardBody(name: string): Promise<string> {
  const templateId = `genre_card_${name}` as PromptTemplateType;
  try {
    const resolved = await resolvePromptTemplate(templateId, {});
    return stripCardFrontMatter(resolved.prompt);
  } catch (err) {
    logger.warn('风格标签卡解析失败，跳过该卡', {
      templateId,
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

/** 剥掉 HTML 溯源注释和 YAML frontmatter；用户改写模板后同样适用。 */
export function stripCardFrontMatter(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*---[\s\S]*?---\s*/, '')
    .trim();
}

/** 辅题材只摘前 N 条要点，避免两套打法并行铺满。 */
function excerptLines(body: string, max: number): string {
  return body
    .split('\n')
    .filter(line => line.trim().startsWith('-'))
    .slice(0, max)
    .join('\n');
}

/** 归一化用户输入 / LLM 输出的标签到卡名；命中不了的原样丢弃并留日志。 */
export function normalizeGenreTags(raw: DramaGenreTags | undefined): DramaGenreTags {
  if (!raw) return {};
  const pick = (value: string | undefined, kind: GenreCardKind) => {
    if (!value) return undefined;
    const card = matchGenreCard(value, kind);
    if (!card) logger.warn('标签未命中任何卡片，已丢弃', { value, kind });
    return card?.name;
  };
  const pickAll = (values: string[] | undefined, kind: GenreCardKind, limit?: number) => {
    const names = (values || [])
      .map(value => pick(value, kind))
      .filter((name): name is string => Boolean(name));
    const unique = [...new Set(names)];
    return limit ? unique.slice(0, limit) : unique;
  };
  const genre = pick(raw.genre, 'genre');
  return {
    genre,
    // 辅题材不能跟主题材重复，否则同一张卡会被注入两次
    subGenres: pickAll(raw.subGenres, 'genre', MAX_SUB_GENRES).filter(name => name !== genre),
    tones: pickAll(raw.tones, 'tone'),
    premiseDevices: pickAll(raw.premiseDevices, 'device'),
    reason: raw.reason,
    analyzedAt: raw.analyzedAt,
  };
}

/**
 * 构建「风格标签」推理约束段。没有任何有效标签时返回空串（调用方按不注入处理）。
 */
export async function buildGenreToneDirective(tags?: DramaGenreTags): Promise<string> {
  const normalized = normalizeGenreTags(tags);
  if (!hasGenreTags(normalized)) return '';

  const sections: Record<'genreSection' | 'toneSection' | 'deviceSection', string> = {
    genreSection: '',
    toneSection: '',
    deviceSection: '',
  };

  if (normalized.genre) {
    const body = await readCardBody(normalized.genre);
    if (body) sections.genreSection = `## 主题材：${normalized.genre}\n${body}\n`;
  }
  for (const sub of normalized.subGenres || []) {
    const body = await readCardBody(sub);
    const excerpt = excerptLines(body, SUB_GENRE_EXCERPT_LINES);
    if (excerpt) {
      sections.genreSection += `\n## 辅题材：${sub}（只借这几条，主要矛盾仍归主题材）\n${excerpt}\n`;
    }
  }

  const toneBodies: string[] = [];
  for (const tone of normalized.tones || []) {
    const body = await readCardBody(tone);
    if (body) toneBodies.push(`## 调性：${tone}\n${body}`);
  }
  if (toneBodies.length) sections.toneSection = `\n${toneBodies.join('\n\n')}\n`;

  const deviceBodies: string[] = [];
  for (const device of normalized.premiseDevices || []) {
    const body = await readCardBody(device);
    if (body) deviceBodies.push(`## 前提装置：${device}\n${body}`);
  }
  if (deviceBodies.length) sections.deviceSection = `\n${deviceBodies.join('\n\n')}\n`;

  try {
    const resolved = await resolvePromptTemplate('shot_directive_genre_tone', sections);
    return resolved.prompt.trim();
  } catch (err) {
    logger.warn('风格标签约束段解析失败，本次跳过', {
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

/** 给分析模板用的可选项清单（顿号分隔，跟着卡片注册表走，不写死）。 */
export function buildGenreOptionList(kind: GenreCardKind): string {
  return listCardsOfKind(kind)
    .map(card => (card.aliases.length ? `${card.name}（${card.aliases.slice(0, 4).join('/')}）` : card.name))
    .join('、');
}
