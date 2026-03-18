/**
 * 主题预设配置
 * 用于项目风格选择，影响 LLM 创作和 TTI 生成
 */
import type { Project, ProjectStyleSnapshot, ThemePreset } from '../types';
import { getCustomThemePresets } from '../store/globalStore';

// Re-export for convenience
export type { ThemePreset } from '../types';
export type ThemePresetSourceType = 'builtin' | 'custom';

export interface ThemePresetCatalogItem extends ThemePreset {
  sourceType: ThemePresetSourceType;
  sourcePresetId: string;
}

export const DEFAULT_THEME_PRESET_ID = 'realistic';

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    description: '霓虹灯光、高科技低生活、未来都市',
    ttiStylePrefix: 'cyberpunk style, neon lights, futuristic city, high-tech low-life, glowing signs, rain-soaked streets, ',
    llmPromptSuffix: '场景设定在未来赛博朋克都市，充满霓虹灯和高科技元素。',
  },
  {
    id: 'wuxia',
    name: '古风武侠',
    description: '中国古代、江湖侠客、水墨山水',
    ttiStylePrefix: 'chinese wuxia style, ancient china, martial arts, ink painting aesthetic, traditional architecture, ',
    llmPromptSuffix: '场景设定在古代中国江湖，充满武侠气息。',
  },
  {
    id: 'anime',
    name: '日式动漫',
    description: '日本动漫风格、明亮色彩、可爱角色',
    ttiStylePrefix: 'anime style, japanese animation, vibrant colors, detailed characters, expressive faces, ',
    llmPromptSuffix: '以日式动漫风格呈现，角色表情生动。',
  },
  {
    id: 'western-comic',
    name: '欧美漫画',
    description: '美漫风格、粗犷线条、超级英雄',
    ttiStylePrefix: 'western comic style, bold lines, dynamic poses, superhero aesthetic, dramatic lighting, ',
    llmPromptSuffix: '以欧美漫画风格呈现，画面富有张力。',
  },
  {
    id: 'ink-wash',
    name: '水墨国风',
    description: '传统水墨画、留白意境、诗意山水',
    ttiStylePrefix: 'chinese ink wash painting style, traditional shuimo, minimalist, poetic landscape, elegant brushwork, ',
    llmPromptSuffix: '以传统水墨画风格呈现，注重意境和留白。',
  },
  {
    id: 'realistic',
    name: '写实风格',
    description: '真实感、电影质感、细腻光影',
    ttiStylePrefix: 'photorealistic, cinematic lighting, detailed textures, film grain, professional photography, ',
    llmPromptSuffix: '以写实电影风格呈现，注重细节和光影。',
  },
  {
    id: 'pixel-art',
    name: '像素艺术',
    description: '复古像素风、8-bit/16-bit游戏',
    ttiStylePrefix: 'pixel art style, retro game aesthetic, 16-bit graphics, nostalgic, vibrant pixel colors, ',
    llmPromptSuffix: '以复古像素游戏风格呈现。',
  },
  {
    id: 'custom',
    name: '自定义',
    description: '使用自定义风格描述',
    ttiStylePrefix: '',
    llmPromptSuffix: '',
  },
];

function isLegacyCustomPreset(themeId?: string): boolean {
  return !themeId || themeId === 'custom';
}

function toCatalogItem(preset: ThemePreset, sourceType: ThemePresetSourceType): ThemePresetCatalogItem {
  return {
    ...preset,
    sourceType,
    sourcePresetId: preset.id,
  };
}

export function getBuiltinThemePresets(): ThemePresetCatalogItem[] {
  return THEME_PRESETS
    .filter((preset) => preset.id !== 'custom')
    .map((preset) => toCatalogItem(preset, 'builtin'));
}

export function getThemePreset(themeId: string): ThemePresetCatalogItem | undefined {
  return getBuiltinThemePresets().find((preset) => preset.id === themeId);
}

export async function getAllThemePresets(): Promise<ThemePresetCatalogItem[]> {
  const customPresets = await getCustomThemePresets();
  const customCatalog = customPresets.map((preset) => toCatalogItem(preset, 'custom'));
  return [...customCatalog, ...getBuiltinThemePresets()];
}

export async function getThemePresetAsync(themeId: string): Promise<ThemePresetCatalogItem | undefined> {
  if (isLegacyCustomPreset(themeId)) {
    return undefined;
  }

  const catalog = await getAllThemePresets();
  return catalog.find((preset) => preset.id === themeId);
}

export async function resolveThemePreset(
  themeId: string = DEFAULT_THEME_PRESET_ID
): Promise<ThemePresetCatalogItem> {
  const preset = await getThemePresetAsync(themeId);
  if (preset) {
    return preset;
  }

  const fallbackPreset = getThemePreset(DEFAULT_THEME_PRESET_ID);
  if (!fallbackPreset) {
    throw new Error(`Default theme preset not found: ${DEFAULT_THEME_PRESET_ID}`);
  }
  return fallbackPreset;
}

export async function createProjectStyleSnapshot(
  themeId: string = DEFAULT_THEME_PRESET_ID
): Promise<ProjectStyleSnapshot> {
  const preset = await resolveThemePreset(themeId);
  const createdAt = Date.now();

  return {
    id: `${preset.sourceType}:${preset.id}:${createdAt}`,
    name: preset.name,
    description: preset.description,
    ttiStylePrefix: preset.ttiStylePrefix,
    llmPromptSuffix: preset.llmPromptSuffix,
    sourceType: preset.sourceType,
    sourcePresetId: preset.sourcePresetId,
    createdAt,
  };
}

export function resolveProjectStyleSnapshot(project?: Pick<Project, 'styleSnapshot'> | null): ProjectStyleSnapshot | undefined {
  return project?.styleSnapshot;
}

export function getStylePrefixFromSnapshot(styleSnapshot?: ProjectStyleSnapshot | null): string {
  return styleSnapshot?.ttiStylePrefix || '';
}

export function getLLMStyleSuffixFromSnapshot(styleSnapshot?: ProjectStyleSnapshot | null): string {
  return styleSnapshot?.llmPromptSuffix || '';
}

export function buildLLMStyleInstruction(styleSnapshot?: ProjectStyleSnapshot | null): string {
  return getLLMStyleSuffixFromSnapshot(styleSnapshot).trim();
}

export function getThemeStylePrefix(themeId?: string, customStylePrompt?: string): string {
  if (isLegacyCustomPreset(themeId)) {
    return customStylePrompt ? `${customStylePrompt}, ` : '';
  }
  const theme = getThemePreset(themeId);
  return theme?.ttiStylePrefix || '';
}

export function getThemeLLMSuffix(themeId?: string, customStylePrompt?: string): string {
  if (isLegacyCustomPreset(themeId)) {
    return customStylePrompt || '';
  }
  const theme = getThemePreset(themeId);
  return theme?.llmPromptSuffix || '';
}

/**
 * 异步获取风格前缀（支持自定义预设）
 */
export async function getThemeStylePrefixAsync(themeId?: string, customStylePrompt?: string): Promise<string> {
  if (isLegacyCustomPreset(themeId)) {
    return customStylePrompt ? `${customStylePrompt}, ` : '';
  }
  const theme = await getThemePresetAsync(themeId);
  return theme?.ttiStylePrefix || '';
}

/**
 * 异步获取 LLM 后缀（支持自定义预设）
 */
export async function getThemeLLMSuffixAsync(themeId?: string, customStylePrompt?: string): Promise<string> {
  if (isLegacyCustomPreset(themeId)) {
    return customStylePrompt || '';
  }
  const theme = await getThemePresetAsync(themeId);
  return theme?.llmPromptSuffix || '';
}
