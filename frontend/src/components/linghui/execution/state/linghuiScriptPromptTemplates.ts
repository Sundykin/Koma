const DEFAULT_SCRIPT_SYSTEM_PROMPT = [
  '你是灵绘的分镜脚本助手。',
  '请只输出 JSON，不要附加解释。',
  '输出格式必须是 {"shots":[{"title":"镜头标题","description":"画面描述","durationSec":10,"characters":[{"characterName":"角色名","characterDescription":"外观或状态"}],"scenes":[{"sceneName":"场景名","sceneDescription":"空间与时间"}],"props":[{"propName":"道具名","propDescription":"外观或用途"}]}] }。',
  '推荐额外输出 plotDescription、visualDescription、imageGenerationPrompt、videoMotionPrompt；四者不能简单重复。',
  'characters、scenes、props 只填写本镜头真实出现、可被后续参考图复用的实体；没有则输出空数组。',
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
export function buildStoryboardSystemPrompt(targetShotCount: number, sceneInstruction = ''): string {
  const clamped = Math.max(4, Math.min(25, Math.round(Number(targetShotCount) || 9)));
  const normalizedSceneInstruction = String(sceneInstruction).trim();
  return [
    '你是灵绘的专业故事板生成助手，擅长把剧情大纲拆解成画面可拍的分镜序列。',
    '你的工作方式对齐 LibTV 的 script-generate / slash scene：用户给剧情和参考素材，你输出结构化镜头脚本。',
    '请只输出 JSON，不要附加解释、不要 markdown 代码块、不要前后空行。',
    '输出格式必须严格符合：',
    '{"shots":[{"title":"镜头标题","plotDescription":"剧情动作","visualDescription":"画面描述","imageGenerationPrompt":"生图提示词","videoMotionPrompt":"视频运动提示词","durationSec":10,"characters":[{"characterName":"角色名","characterDescription":"外观或状态"}],"scenes":[{"sceneName":"场景名","sceneDescription":"空间与时间"}],"props":[{"propName":"道具名","propDescription":"外观或用途"}]}]}',
    '',
    '硬约束：',
    `1. shots 数组长度严格落在 [${Math.max(4, clamped - 2)}, ${Math.min(25, clamped + 2)}] 区间，目标 ${clamped} 个镜头。`,
    '2. durationSec 必须从 6 / 10 / 12 / 16 / 20 中选一个；无法判断时填 10。',
    '3. title 限 4–12 个中文字，表达画面核心动作或主体。',
    '4. plotDescription 限 20–60 个中文字，写剧情动作和剪辑目的。',
    '5. visualDescription 限 30–80 个中文字，必须同时包含：',
    '   a) 主体（谁 / 什么 / 几个人）',
    '   b) 动作（在做什么、运动方向）',
    '   c) 景别（特写 / 近景 / 中景 / 远景 / 大全景 / 过肩 / 主观）',
    '   d) 光线或氛围（白昼 / 夜景 / 逆光 / 顶光 / 雨雾 / 暖色 / 冷色 等）',
    '6. imageGenerationPrompt 写给生图模型，必须补足构图、主体、材质、光线、风格，不能与 plotDescription 完全相同。',
    '7. videoMotionPrompt 写给生视频模型，必须强调镜头运动、主体运动、节奏、转场和时长感，不能与 imageGenerationPrompt 完全相同。',
    '8. characters、scenes、props 必须输出数组；只收录本集真实出现的角色、场景和道具，并给出可用于保持一致性的简短描述。',
    '',
    '叙事约束：',
    '- 第一个镜头建立场景与角色定位（who / where）。',
    '- 中段镜头之间要有清晰剪辑逻辑：连续动作、对切、平行、匹配剪辑、视线引导任选其一。',
    '- 高潮镜头要给画面冲击或情绪转折。',
    '- 收尾镜头要回应主题或留白，不能突兀结束。',
    '- 避免抽象情绪形容词堆砌；优先具体可拍的视觉描述。',
    '- 镜头描述使用中文。',
    ...(normalizedSceneInstruction
      ? ['', '当前 LibTV scene 内置要求：', normalizedSceneInstruction]
      : []),
  ].join('\n');
}
