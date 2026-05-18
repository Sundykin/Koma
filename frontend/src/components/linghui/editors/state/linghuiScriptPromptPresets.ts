export interface LinghuiScriptPromptPreset {
  key: string;
  label: string;
  description: string;
  promptSnippet: string;
  systemPromptSnippet?: string;
}

export const LINGHUI_SCRIPT_PROMPT_PRESETS: LinghuiScriptPromptPreset[] = [
  {
    key: 'story-beats',
    label: '剧情分镜',
    description: '按起承转合拆出可拍镜头。',
    promptSnippet: [
      '把这段剧情拆成结构化分镜脚本。',
      '镜头之间要有清晰的起因、推进、转折和余韵；每个镜头都要写明主体、动作、景别、机位、光线和情绪。',
    ].join('\n'),
  },
  {
    key: 'multi-camera',
    label: '多机位',
    description: '围绕同一事件生成不同机位。',
    promptSnippet: [
      '围绕同一个剧情事件生成多机位分镜。',
      '镜头需要覆盖远景、全景、中景、近景、特写、俯拍、仰拍、侧面、过肩或主观视角，保持人物和空间关系连续。',
    ].join('\n'),
  },
  {
    key: 'product-film',
    label: '产品短片',
    description: '适合商品展示和广告镜头。',
    promptSnippet: [
      '生成一组产品广告短片分镜。',
      '镜头需要突出产品材质、结构、使用场景、细节特写和结尾记忆点；光线干净，节奏利落。',
    ].join('\n'),
    systemPromptSnippet: '输出应偏商业广告分镜，避免抽象口号，优先描述能直接生成画面的镜头。',
  },
  {
    key: 'emotional-montage',
    label: '情绪蒙太奇',
    description: '用动作和环境递进情绪。',
    promptSnippet: [
      '把用户剧情整理成情绪蒙太奇分镜。',
      '用环境变化、细节物件、人物微表情和动作节奏推进情绪，镜头之间要有匹配剪辑或视线引导。',
    ].join('\n'),
  },
];

export function mergeLinghuiScriptPresetPrompt(currentPrompt: string, preset: LinghuiScriptPromptPreset): string {
  const current = currentPrompt.trim();
  if (!current) return preset.promptSnippet;
  if (current.includes(preset.promptSnippet)) return current;
  return `${preset.promptSnippet}\n\n用户补充：\n${current}`;
}

export function mergeLinghuiScriptPresetSystemPrompt(currentSystemPrompt: string, preset: LinghuiScriptPromptPreset): string {
  const snippet = preset.systemPromptSnippet?.trim();
  const current = currentSystemPrompt.trim();
  if (!snippet) return current;
  if (!current) return snippet;
  if (current.includes(snippet)) return current;
  return `${current}\n\n${snippet}`;
}
