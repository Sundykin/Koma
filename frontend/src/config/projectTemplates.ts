/**
 * 项目模板配置
 * 预置模板帮助用户快速开始创作
 */

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  mode: 'drama' | 'narration';
  theme: string;
  episodes: number;
  sampleScript?: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'short-drama',
    name: '短剧',
    description: '适合 1-5 分钟的短剧创作，包含对话和场景切换',
    icon: '🎬',
    mode: 'drama',
    theme: 'realistic',
    episodes: 3,
    sampleScript: `## 第一场 咖啡馆

**小明**：（推门进入）你好，请问这里有空位吗？

**小红**：（抬头微笑）这里可以坐。

旁白：两个陌生人的故事，就从这杯咖啡开始。`,
  },
  {
    id: 'narration-explainer',
    name: '解说视频',
    description: '适合知识科普、产品介绍等旁白驱动的视频',
    icon: '🎙️',
    mode: 'narration',
    theme: 'realistic',
    episodes: 1,
    sampleScript: `在这个快速发展的时代，AI 正在改变我们创作内容的方式。

今天，我们来聊聊 AI 视频生成技术的最新进展。

首先，让我们看看文生图技术是如何工作的...`,
  },
  {
    id: 'ad-commercial',
    name: '广告短片',
    description: '适合产品广告、品牌宣传片，节奏紧凑',
    icon: '📺',
    mode: 'narration',
    theme: 'realistic',
    episodes: 1,
    sampleScript: `画面：产品特写，光影流转

旁白：每一个细节，都经过精心打磨。

画面：使用场景展示

旁白：让科技融入生活，让创意触手可及。`,
  },
  {
    id: 'anime-story',
    name: '动漫故事',
    description: '日式动漫风格的短篇故事',
    icon: '🌸',
    mode: 'drama',
    theme: 'anime',
    episodes: 2,
  },
  {
    id: 'wuxia-drama',
    name: '武侠短剧',
    description: '古风武侠题材，江湖恩怨',
    icon: '⚔️',
    mode: 'drama',
    theme: 'wuxia',
    episodes: 3,
  },
  {
    id: 'blank',
    name: '空白项目',
    description: '从零开始，自由创作',
    icon: '📝',
    mode: 'drama',
    theme: 'realistic',
    episodes: 1,
  },
];

export function getTemplate(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find(t => t.id === id);
}
