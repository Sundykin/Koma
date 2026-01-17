/**
 * 主题预设配置
 * 用于项目风格选择，影响 LLM 创作和 TTI 生成
 */
import type { ThemePreset } from '../types';

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

export function getThemePreset(themeId: string): ThemePreset | undefined {
  return THEME_PRESETS.find(t => t.id === themeId);
}

export function getThemeStylePrefix(themeId?: string, customStylePrompt?: string): string {
  if (!themeId || themeId === 'custom') {
    return customStylePrompt ? `${customStylePrompt}, ` : '';
  }
  const theme = getThemePreset(themeId);
  return theme?.ttiStylePrefix || '';
}

export function getThemeLLMSuffix(themeId?: string, customStylePrompt?: string): string {
  if (!themeId || themeId === 'custom') {
    return customStylePrompt || '';
  }
  const theme = getThemePreset(themeId);
  return theme?.llmPromptSuffix || '';
}
