export interface LinghuiAgentPromptPreset {
  key: string;
  label: string;
  description: string;
  promptSnippet: string;
  systemPromptSnippet?: string;
  maxIterations?: number;
}

export const LINGHUI_AGENT_PROMPT_PRESETS: LinghuiAgentPromptPreset[] = [
  {
    key: 'media-audit',
    label: '素材分析',
    description: '整理上游素材的主体、风格和可用方向。',
    promptSnippet: '分析我引用的素材，提炼主体、场景、风格、光线、情绪和可继续生成的方向。输出为清晰的中文要点。',
    systemPromptSnippet: '你是灵绘素材分析助手。优先基于上游引用内容回答，不编造看不到的信息。',
    maxIterations: 4,
  },
  {
    key: 'creative-plan',
    label: '生成方案',
    description: '把想法拆成可执行的灵绘节点流程。',
    promptSnippet: '根据我的目标设计一套灵绘创作流程，说明需要哪些节点、每个节点的输入输出、关键提示词和执行顺序。',
    systemPromptSnippet: '你是灵绘流程策划助手。输出要能直接指导用户在画布上搭节点。',
    maxIterations: 6,
  },
  {
    key: 'story-check',
    label: '分镜检查',
    description: '检查剧情/分镜是否连贯可拍。',
    promptSnippet: '检查我引用的剧情或分镜，指出叙事连贯性、镜头变化、主体一致性、节奏和可生成性问题，并给出修改建议。',
    systemPromptSnippet: '你是分镜审阅助手。优先发现会影响后续生图/生视频的问题。',
    maxIterations: 5,
  },
  {
    key: 'prompt-polish',
    label: '提示词优化',
    description: '把零散想法改成可生成提示词。',
    promptSnippet: '把我的想法整理成适合生图/生视频的提示词，保留核心主体和风格，补足构图、机位、光影、材质和情绪。',
    systemPromptSnippet: '你是提示词整理助手。输出先给最终提示词，再给简短修改理由。',
    maxIterations: 4,
  },
];

export function mergeLinghuiAgentPresetPrompt(currentPrompt: string, preset: LinghuiAgentPromptPreset): string {
  const current = currentPrompt.trim();
  if (!current) return preset.promptSnippet;
  if (current.includes(preset.promptSnippet)) return current;
  return `${preset.promptSnippet}\n\n用户补充：\n${current}`;
}

export function mergeLinghuiAgentPresetSystemPrompt(currentSystemPrompt: string, preset: LinghuiAgentPromptPreset): string {
  const snippet = preset.systemPromptSnippet?.trim();
  const current = currentSystemPrompt.trim();
  if (!snippet) return current;
  if (!current) return snippet;
  if (current.includes(snippet)) return current;
  return `${current}\n\n${snippet}`;
}
