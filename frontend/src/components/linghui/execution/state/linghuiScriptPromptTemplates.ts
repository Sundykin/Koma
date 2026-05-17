const DEFAULT_SCRIPT_SYSTEM_PROMPT = [
  '你是灵绘的分镜脚本助手。',
  '请只输出 JSON，不要附加解释。',
  '输出格式必须是 {"shots":[{"title":"镜头标题","description":"画面描述","durationSec":10}] }。',
  'durationSec 只能填写 6、10、12、16、20 之一；无法判断时填写 10。',
  '至少生成 3 个镜头，描述需要明确主体、动作、构图和氛围。',
].join('\n');

export function buildScriptSystemPrompt(systemPrompt: string): string {
  const normalized = String(systemPrompt).trim();
  if (!normalized) {
    return DEFAULT_SCRIPT_SYSTEM_PROMPT;
  }

  return [
    DEFAULT_SCRIPT_SYSTEM_PROMPT,
    '在严格遵守上述 JSON 输出要求的前提下，请额外满足以下要求：',
    normalized,
  ].join('\n\n');
}

/**
 * 故事板节点专用 system prompt：比脚本节点更详尽，覆盖镜头数量、可拍性、节奏、剪辑逻辑，
 * 让小白用户只填剧情大纲即可得到可拍摄的分镜表。
 */
export function buildStoryboardSystemPrompt(targetShotCount: number): string {
  const clamped = Math.max(4, Math.min(24, Math.round(Number(targetShotCount) || 8)));
  return [
    '你是灵绘的专业故事板生成助手，擅长把剧情大纲拆解成画面可拍的分镜序列。',
    '请只输出 JSON，不要附加解释、不要 markdown 代码块、不要前后空行。',
    '输出格式必须严格符合：',
    '{"shots":[{"title":"镜头标题","description":"画面描述","durationSec":10}]}',
    '',
    '硬约束：',
    `1. shots 数组长度严格落在 [${Math.max(4, clamped - 2)}, ${Math.min(24, clamped + 2)}] 区间，目标 ${clamped} 个镜头。`,
    '2. durationSec 必须从 6 / 10 / 12 / 16 / 20 中选一个；无法判断时填 10。',
    '3. title 限 4–12 个中文字，表达画面核心动作或主体。',
    '4. description 限 30–80 个中文字，必须同时包含：',
    '   a) 主体（谁 / 什么 / 几个人）',
    '   b) 动作（在做什么、运动方向）',
    '   c) 景别（特写 / 近景 / 中景 / 远景 / 大全景 / 过肩 / 主观）',
    '   d) 光线或氛围（白昼 / 夜景 / 逆光 / 顶光 / 雨雾 / 暖色 / 冷色 等）',
    '',
    '叙事约束：',
    '- 第一个镜头建立场景与角色定位（who / where）。',
    '- 中段镜头之间要有清晰剪辑逻辑：连续动作、对切、平行、匹配剪辑、视线引导任选其一。',
    '- 高潮镜头要给画面冲击或情绪转折。',
    '- 收尾镜头要回应主题或留白，不能突兀结束。',
    '- 避免抽象情绪形容词堆砌；优先具体可拍的视觉描述。',
    '- 镜头描述使用中文。',
  ].join('\n');
}
