/**
 * Prompt 模板管理
 * 默认模板和自定义模板支持
 */
import { electronService } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from './storageConfig';
import { loadSettings, saveSettings } from './globalStore';
import { STORAGE_KEYS } from '../constants/storageKeys';
import type { AppSettings } from '../types';

// Prompt 模板类型
export type PromptTemplateType =
  // 系统提示模板（System Prompt）
  | 'shot_prompt_system'       // 分镜提示词生成的系统提示
  | 'shot_breakdown_system'    // 分镜拆解的系统提示
  | 'script_analysis_system'   // 剧本解析的系统提示
  // LLM 任务模板
  | 'random_idea_generation'   // 随机创意生成（已废弃，保留兼容）
  | 'random_script_generation' // 随机剧本生成（一步完成）
  | 'script_generation'        // 剧本生成
  | 'script_polish'            // 剧本润色
  | 'shot_breakdown'           // 分镜拆解
  | 'shot_prompt_generation'   // 分镜提示词生成（通用）
  | 'shot_image_prompt_generation' // 分镜图片提示词生成
  | 'shot_video_prompt_generation' // 分镜视频提示词生成
  | 'character_extraction'     // 角色提取
  | 'character_design'         // 角色视觉设计
  | 'scene_extraction'         // 场景提取
  | 'prop_extraction'          // 道具提取
  | 'dialogue_generation'      // 对话生成（保留备用）
  // TTI 图片生成模板
  | 'tti_character_costume'    // 角色定妆照（三视图）
  | 'tti_scene_preview'        // 场景预览图
  | 'tti_prop_reference'       // 道具参考图
  | 'tti_shot_image'           // 分镜图片
  // ITV 视频生成模板
  | 'itv_shot_video'           // 分镜视频
  | 'itv_character_motion'     // 角色动态视频
  | 'itv_prop_motion';         // 道具动态视频

// Prompt 模板接口
export interface PromptTemplate {
  id: PromptTemplateType;
  name: string;
  description: string;
  template: string;
  variables: string[];  // 模板变量列表 (如 {{idea}}, {{style}})
  isCustom: boolean;    // 是否自定义
}

export interface PromptTemplateOverride {
  template: string;
  updatedAt: number;
}

export interface PromptTemplateValidationResult {
  isValid: boolean;
  unknownVariables: string[];
  missingRequiredVariables: string[];
}

export interface ResolvedPromptTemplate {
  template: PromptTemplate;
  prompt: string;
  source: 'default' | 'custom';
}

// ========== 默认模板 ==========

const DEFAULT_TEMPLATES: Record<PromptTemplateType, PromptTemplate> = {
  // ========== 系统提示模板 ==========

  shot_prompt_system: {
    id: 'shot_prompt_system',
    name: '分镜提示词系统提示',
    description: '生成分镜提示词时的系统角色定义',
    template: `你是一个专业的视频提示词生成专家。你的任务是为视频生成模型编写高质量的中文提示词。

要求：
1. 提示词使用中文描述
2. 如果有角色引用，使用 @角色ID 格式（如 @abc123）
3. 包含运镜描述和景别描述
4. 描述要具体、生动，包含动作、光影、氛围
5. 直接输出提示词，不要有任何前缀或解释`,
    variables: [],
    isCustom: false,
  },

  shot_breakdown_system: {
    id: 'shot_breakdown_system',
    name: '分镜拆解系统提示',
    description: '分镜拆解时的系统角色定义',
    template: `你是一个专业的影视分镜师。你的任务是根据剧本内容，结合给定的角色、场景和道具，生成分镜结构。

每个分镜应该包含：
- scriptContent: 对应的剧本原文
- shotType: 景别（close-up特写/medium中景/wide全景/extreme-wide大全景）
- cameraMovement: 运镜方式（static固定/pan摇镜/zoom-in推镜/tracking跟随/handheld手持）
- duration: 预估时长（秒），控制在10秒以内
- characters: 出现的角色名列表
- dialogue: 角色台词，格式为"角色名（情绪）：台词内容"
- emotion: 画面情绪氛围
- props: 出现的道具名列表

【情绪词列表】
高兴、愤怒、悲伤、恐惧、反感、低落、惊讶、自然、急切、平静、激动、呵斥、关心、严肃

注意：不需要生成画面描述(description)提示词，这将在后续步骤生成。
请确保分镜覆盖剧本的所有重要内容。`,
    variables: [],
    isCustom: false,
  },

  script_analysis_system: {
    id: 'script_analysis_system',
    name: '剧本解析系统提示',
    description: '剧本解析时的系统角色定义',
    template: `你是一个专业的影视编剧和分镜师。你的任务是分析用户提供的剧本，提取关键信息。
请严格按照要求的 JSON 格式输出，不要输出任何其他内容。`,
    variables: [],
    isCustom: false,
  },

  // ========== LLM 任务模板 ==========

  random_idea_generation: {
    id: 'random_idea_generation',
    name: '随机创意生成（已废弃）',
    description: '生成随机的剧本创意（已废弃，请使用 random_script_generation）',
    template: `你是一个创意编剧。请随机生成一个短视频剧本创意。

要求：
1. 创意要新颖有趣，适合短视频形式（1-5分钟）
2. 包含明确的主题、类型和情感基调
3. 简要描述核心冲突或亮点
4. 每次生成都要有变化，不要重复

请以 JSON 格式输出：
\`\`\`json
{
  "topic": "故事主题/概念（一句话）",
  "style": "风格类型（如：治愈、搞笑、悬疑、科幻等）",
  "keyElements": ["关键元素1", "关键元素2", "关键元素3"],
  "logline": "一句话剧情简介"
}
\`\`\``,
    variables: [],
    isCustom: false,
  },

  random_script_generation: {
    id: 'random_script_generation',
    name: '随机剧本生成',
    description: '一步生成完整的随机剧本',
    template: `你是一个专业的编剧，请随机创作一个短视频剧本。

【创作要求】
1. 随机选择一个新颖有趣的主题和风格（如：治愈、搞笑、悬疑、科幻、爱情、职场等）
2. 时长约 {{duration}} 分钟
3. 剧本包含场景描述、角色对话、动作指示
4. 情节紧凑，有明确的开端、发展、高潮、结局
5. 对话自然生动，符合角色性格
6. 每次创作都要有变化，不要重复

【输出格式】
首先用注释标注创意元数据，然后输出完整剧本：

<!--
主题：[故事主题]
风格：[风格类型]
关键元素：[元素1, 元素2, 元素3]
一句话简介：[剧情简介]
-->

## [剧本标题]

### 场景 1：[场景名称]
[场景描述]

**角色A**：对话内容
（动作指示）

**角色B**：对话内容
...

### 场景 2：...
`,
    variables: ['duration'],
    isCustom: false,
  },

  script_generation: {
    id: 'script_generation',
    name: '剧本生成',
    description: '从创意/灵感生成完整剧本',
    template: `你是一个专业的编剧，请根据以下创意生成一个短视频剧本。

创意：{{idea}}
风格：{{style}}
时长：约 {{duration}} 分钟

要求：
1. 剧本包含场景描述、角色对话、动作指示
2. 情节紧凑，有明确的开端、发展、高潮、结局
3. 对话自然生动，符合角色性格
4. 场景转换流畅，视觉感强

请按以下格式输出：

## 剧本标题

### 场景 1：[场景名称]
[场景描述]

**角色A**：对话内容
（动作指示）

**角色B**：对话内容
...

### 场景 2：...
`,
    variables: ['idea', 'style', 'duration'],
    isCustom: false,
  },

  script_polish: {
    id: 'script_polish',
    name: '剧本润色',
    description: '优化现有剧本的语言和结构',
    template: `你是一个专业的剧本编辑，请润色以下剧本。

原剧本：
{{script}}

润色要求：
- {{requirements}}

请保持原有的故事结构，优化语言表达，使对话更加生动自然，场景描述更加具体形象。
`,
    variables: ['script', 'requirements'],
    isCustom: false,
  },

  shot_breakdown: {
    id: 'shot_breakdown',
    name: '分镜拆解',
    description: '将剧本拆解为分镜结构（不含提示词）',
    template: `你是一位专业的分镜师。请将以下剧本拆解为分镜列表。

【时长要求】
每个镜头控制在10秒以内。

【情绪词列表】
高兴、愤怒、悲伤、恐惧、反感、低落、惊讶、自然、急切、平静、激动、呵斥、关心、严肃

已知角色：{{characters}}
已知场景：{{scenes}}
已知道具：{{props}}

剧本：
{{script}}

请以 JSON 格式输出分镜列表：

\`\`\`json
{
  "shots": [
    {
      "scriptContent": "对应的剧本原文片段",
      "shotType": "close-up/medium/wide/extreme-wide",
      "cameraMovement": "static/pan/zoom-in/tracking/handheld",
      "duration": 5,
      "dialogue": "角色名（情绪）：\"台词内容\"",
      "characters": ["出场角色名称"],
      "emotion": "情绪标签",
      "props": ["出现的道具"]
    }
  ]
}
\`\`\`
`,
    variables: ['script', 'characters', 'scenes', 'props'],
    isCustom: false,
  },

  shot_prompt_generation: {
    id: 'shot_prompt_generation',
    name: '分镜提示词生成',
    description: '为分镜生成视频/图片提示词',
    template: `根据以下分镜信息生成视频/图片生成提示词。

剧本内容：{{scriptContent}}
出场角色：{{characters}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}

要求：
1. 使用中文输出
2. 为每个角色添加 @角色ID 引用格式（角色引用列表见下方）
3. 使用以下运镜关键字之一：{{cameraOptions}}
4. 使用以下景别关键字之一：{{shotTypeOptions}}
5. 描述画面动作、光影、氛围
6. 包含详尽的画面描述、景别与运镜设计

可用角色引用：
{{characterRefs}}

输出格式：直接输出提示词，无需其他说明
`,
    variables: ['scriptContent', 'characters', 'emotion', 'stylePrefix', 'cameraOptions', 'shotTypeOptions', 'characterRefs'],
    isCustom: false,
  },

  shot_image_prompt_generation: {
    id: 'shot_image_prompt_generation',
    name: '分镜图片提示词生成',
    description: '为分镜生成静态图片提示词',
    template: `根据以下分镜信息生成图片生成提示词。

剧本内容：{{scriptContent}}
出场角色：{{characters}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}

要求：
1. 使用中文输出
2. 为每个角色添加 @角色ID 引用格式（角色引用列表见下方）
3. 使用以下景别关键字之一：{{shotTypeOptions}}
4. 重点描述画面构图、人物姿态、光影效果
5. 强调静态画面的视觉冲击力和情绪表达
6. 包含背景环境、色调氛围描述

可用角色引用：
{{characterRefs}}

输出格式：直接输出提示词，无需其他说明
`,
    variables: ['scriptContent', 'characters', 'emotion', 'stylePrefix', 'shotTypeOptions', 'characterRefs'],
    isCustom: false,
  },

  shot_video_prompt_generation: {
    id: 'shot_video_prompt_generation',
    name: '分镜视频提示词生成',
    description: '为分镜生成动态视频提示词',
    template: `根据以下分镜信息生成视频生成提示词。

剧本内容：{{scriptContent}}
出场角色：{{characters}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}

要求：
1. 使用中文输出
2. 为每个角色添加 @角色ID 引用格式（角色引用列表见下方）
3. 使用以下运镜关键字之一：{{cameraOptions}}
4. 使用以下景别关键字之一：{{shotTypeOptions}}
5. 重点描述动作流程、运动轨迹、镜头变化
6. 强调动态连贯性和时间节奏
7. 包含转场效果和动态氛围描述

可用角色引用：
{{characterRefs}}

输出格式：直接输出提示词，无需其他说明
`,
    variables: ['scriptContent', 'characters', 'emotion', 'stylePrefix', 'cameraOptions', 'shotTypeOptions', 'characterRefs'],
    isCustom: false,
  },

  character_extraction: {
    id: 'character_extraction',
    name: '角色提取',
    description: '从剧本中提取角色信息',
    template: `分析以下剧本，提取所有角色信息。

【核心任务】
分析剧本文本，为所有角色设计视觉形象方案。必须提取剧本中出现的所有人物角色，无论是主角、配角还是仅有少量描述的次要角色。

【描述要求】
1. 外貌描述必须是纯粹的视觉元素：脸型、瞳色、发型发色、服装配饰
2. 服装描述需包含【颜色】、【款式】、【材质】三个维度
3. 严禁使用性格、情绪、气质等抽象词汇
4. 严禁使用"好看的"、"普通的"等模糊词
5. 输出为中文描述

剧本：
{{script}}

请以 JSON 格式输出角色列表：

\`\`\`json
{
  "characters": [
    {
      "name": "角色名称",
      "description": "角色人物小传",
      "role": "main/supporting/minor",
      "traits": ["特征1", "特征2"],
      "voiceType": "声音类型建议（如：温柔女声、沉稳男声）"
    }
  ]
}
\`\`\`
`,
    variables: ['script'],
    isCustom: false,
  },

  character_design: {
    id: 'character_design',
    name: '角色视觉设计',
    description: '为角色设计视觉形象（参考专业设计师方案）',
    template: `你是一名顶尖的角色概念设计师，专为小说进行视觉化开发。

【核心任务】
为角色设计视觉形象方案，建立基准形象（日常/标志性穿着），并补充特殊场景下的着装。

【红线规则】
1. 严禁任何形式的暴露或性暗示着装
2. 严禁非视觉元素（性格、情绪等抽象词汇）
3. 严禁动作与环境描述，仅描述外观本身

【描述模板】
姓名(性别)年龄，[脸型]，[眼型/瞳色]，[发型]，[发色]，[服装与配饰描述]。

【服装描述要求】
必须包含【颜色】、【款式】、【材质】三个维度。
禁止使用"职业套装"、"休闲服"等模糊词汇。

角色信息：{{character}}
剧本上下文：{{context}}

请输出该角色的视觉形象描述，格式如下：
基准形象：[完整的外观描述]
场景1（如有）：[该场景下的服装变化]
`,
    variables: ['character', 'context'],
    isCustom: false,
  },

  scene_extraction: {
    id: 'scene_extraction',
    name: '场景提取',
    description: '从剧本中提取场景信息',
    template: `分析以下剧本，提取所有场景信息。

剧本：
{{script}}

请以 JSON 格式输出场景列表：

\`\`\`json
{
  "scenes": [
    {
      "name": "场景名称",
      "description": "场景详细描述，用于 AI 生图保持一致性，中文描述",
      "time": "时间（白天/夜晚/黄昏等）",
      "weather": "天气",
      "mood": "氛围（温馨/紧张/神秘等）",
      "keyElements": ["关键元素1", "关键元素2"]
    }
  ]
}
\`\`\`
`,
    variables: ['script'],
    isCustom: false,
  },

  prop_extraction: {
    id: 'prop_extraction',
    name: '道具提取',
    description: '从剧本中提取道具信息',
    template: `分析以下剧本，提取所有重要道具信息。

剧本：
{{script}}

请以 JSON 格式输出道具列表：

\`\`\`json
{
  "props": [
    {
      "name": "道具名称",
      "description": "道具详细描述，中文描述",
      "importance": "high/medium/low",
      "scenes": ["出现的场景列表"]
    }
  ]
}
\`\`\`
`,
    variables: ['script'],
    isCustom: false,
  },

  dialogue_generation: {
    id: 'dialogue_generation',
    name: '对话生成',
    description: '为分镜生成角色对话（保留备用）',
    template: `根据以下场景和角色信息，生成自然的对话。

场景描述：{{scene}}
参与角色：{{characters}}
情节要求：{{plot}}
风格：{{style}}

要求：
1. 对话符合角色性格
2. 语言自然，适合配音
3. 推动剧情发展

请以以下格式输出：

**角色名**：对话内容
（情绪/动作提示）
`,
    variables: ['scene', 'characters', 'plot', 'style'],
    isCustom: false,
  },

  // ========== TTI 图片生成模板 ==========

  tti_character_costume: {
    id: 'tti_character_costume',
    name: '角色定妆照（三视图）',
    description: '生成角色三视图定妆照',
    template: '{{stylePrefix}}, character turnaround sheet, white background, front view | side view | back view, three poses in one image, character design reference sheet, full body, standing pose, {{appearance}}',
    variables: ['stylePrefix', 'appearance'],
    isCustom: false,
  },

  tti_scene_preview: {
    id: 'tti_scene_preview',
    name: '场景预览图',
    description: '生成场景参考图',
    template: '{{stylePrefix}}, environment concept art, wide shot, establishing shot, {{description}}, {{location}}, {{time}}, {{mood}} atmosphere, detailed background, cinematic composition',
    variables: ['stylePrefix', 'description', 'location', 'time', 'mood'],
    isCustom: false,
  },

  tti_prop_reference: {
    id: 'tti_prop_reference',
    name: '道具参考图',
    description: '生成道具参考图',
    template: '{{stylePrefix}}, prop design, item illustration, centered composition, white background, studio lighting, {{description}}, {{type}} item, detailed rendering, clean presentation',
    variables: ['stylePrefix', 'description', 'type'],
    isCustom: false,
  },

  tti_shot_image: {
    id: 'tti_shot_image',
    name: '分镜图片',
    description: '生成分镜预览图',
    template: '{{stylePrefix}}, {{description}}, {{shotType}}, {{emotion}} mood, cinematic lighting, high quality, 4k, detailed',
    variables: ['stylePrefix', 'description', 'shotType', 'emotion'],
    isCustom: false,
  },

  // ========== ITV 视频生成模板 ==========

  itv_shot_video: {
    id: 'itv_shot_video',
    name: '分镜视频',
    description: '生成分镜动态视频',
    template: '{{stylePrefix}}{{description}}, {{cameraMovement}}, smooth motion, cinematic, high quality video',
    variables: ['stylePrefix', 'description', 'cameraMovement'],
    isCustom: false,
  },

  itv_character_motion: {
    id: 'itv_character_motion',
    name: '角色动态视频',
    description: '生成角色动态展示视频',
    template: '{{characterName}} {{action}}, {{stylePrefix}}, smooth animation, character showcase, professional quality',
    variables: ['characterName', 'action', 'stylePrefix'],
    isCustom: false,
  },

  itv_prop_motion: {
    id: 'itv_prop_motion',
    name: '道具动态视频',
    description: '生成道具动态展示视频',
    template: '{{stylePrefix}}, {{description}}, {{motion}}, professional product animation, smooth camera movement, high quality video',
    variables: ['stylePrefix', 'description', 'motion'],
    isCustom: false,
  },
};

// ========== 存储路径 ==========

async function getTemplatesPath(): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/prompt-templates.json`;
}

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function extractTemplateVariables(templateText: string): string[] {
  const matches = Array.from(templateText.matchAll(PLACEHOLDER_REGEX), match => match[1]);
  return Array.from(new Set(matches)).sort();
}

function buildValidationResult(
  type: PromptTemplateType,
  templateText: string
): PromptTemplateValidationResult {
  const allowedVariables = DEFAULT_TEMPLATES[type]?.variables || [];
  const usedVariables = extractTemplateVariables(templateText);
  const unknownVariables = usedVariables.filter(variable => !allowedVariables.includes(variable));
  const missingRequiredVariables = allowedVariables.filter(variable => !usedVariables.includes(variable));

  return {
    isValid: unknownVariables.length === 0 && missingRequiredVariables.length === 0,
    unknownVariables,
    missingRequiredVariables,
  };
}

function normalizePromptTemplateOverride(value: unknown): PromptTemplateOverride | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as { template?: unknown; updatedAt?: unknown };
  if (typeof candidate.template !== 'string') {
    return undefined;
  }

  return {
    template: candidate.template,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
  };
}

function normalizeLegacyPromptTemplates(
  data: unknown
): Partial<Record<PromptTemplateType, PromptTemplateOverride>> {
  const normalized: Partial<Record<PromptTemplateType, PromptTemplateOverride>> = {};
  if (!data || typeof data !== 'object') {
    return normalized;
  }

  for (const [key, value] of Object.entries(data)) {
    if (!(key in DEFAULT_TEMPLATES)) {
      continue;
    }
    const normalizedValue = normalizePromptTemplateOverride(value);
    if (normalizedValue) {
      normalized[key as PromptTemplateType] = normalizedValue;
    }
  }

  return normalized;
}

function mergePromptTemplateOverrides(
  current: Partial<Record<PromptTemplateType, PromptTemplateOverride>>,
  incoming: Partial<Record<PromptTemplateType, PromptTemplateOverride>>
): Partial<Record<PromptTemplateType, PromptTemplateOverride>> {
  const merged = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (!value) {
      continue;
    }
    if (!merged[key as PromptTemplateType]) {
      merged[key as PromptTemplateType] = value;
    }
  }
  return merged;
}

async function persistPromptTemplateOverrides(
  settings: AppSettings,
  overrides: Partial<Record<PromptTemplateType, PromptTemplateOverride>>
): Promise<void> {
  await saveSettings({
    ...settings,
    promptTemplates: overrides,
  });
}

async function migrateLegacyPromptTemplates(
  settings?: AppSettings
): Promise<AppSettings> {
  const currentSettings = settings || await loadSettings();
  let overrides = normalizeLegacyPromptTemplates(currentSettings.promptTemplates);
  let shouldPersist = Object.keys(overrides).length !== Object.keys(currentSettings.promptTemplates || {}).length;

  if (!electronService.isElectron()) {
    try {
      const legacyData = localStorage.getItem(STORAGE_KEYS.PROMPT_TEMPLATES);
      if (legacyData) {
        const legacyOverrides = normalizeLegacyPromptTemplates(JSON.parse(legacyData));
        const mergedOverrides = mergePromptTemplateOverrides(overrides, legacyOverrides);
        if (JSON.stringify(mergedOverrides) !== JSON.stringify(overrides)) {
          overrides = mergedOverrides;
          shouldPersist = true;
        }
        localStorage.removeItem(STORAGE_KEYS.PROMPT_TEMPLATES);
      }
    } catch {
      // ignore
    }

    if (shouldPersist) {
      await persistPromptTemplateOverrides(currentSettings, overrides);
      return { ...currentSettings, promptTemplates: overrides };
    }

    return { ...currentSettings, promptTemplates: overrides };
  }

  try {
    const path = await getTemplatesPath();
    const exists = await electronService.fs.exists(path);
    if (exists) {
      const data = await electronService.fs.readFile(path);
      const legacyOverrides = normalizeLegacyPromptTemplates(JSON.parse(data));
      const mergedOverrides = mergePromptTemplateOverrides(overrides, legacyOverrides);
      if (JSON.stringify(mergedOverrides) !== JSON.stringify(overrides)) {
        overrides = mergedOverrides;
        shouldPersist = true;
      }

      if (shouldPersist) {
        await persistPromptTemplateOverrides(currentSettings, overrides);
      }

      await electronService.fs.remove(path);
      return { ...currentSettings, promptTemplates: overrides };
    }
  } catch {
    // ignore
  }

  if (shouldPersist) {
    await persistPromptTemplateOverrides(currentSettings, overrides);
  }

  return { ...currentSettings, promptTemplates: overrides };
}

async function loadPromptTemplateOverrides(): Promise<Partial<Record<PromptTemplateType, PromptTemplateOverride>>> {
  const settings = await migrateLegacyPromptTemplates();
  return normalizeLegacyPromptTemplates(settings.promptTemplates);
}

function assertTemplateValidation(
  type: PromptTemplateType,
  templateText: string
): void {
  const validation = buildValidationResult(type, templateText);
  if (!validation.isValid) {
    const errors: string[] = [];
    if (validation.unknownVariables.length > 0) {
      errors.push(`未知变量: ${validation.unknownVariables.join(', ')}`);
    }
    if (validation.missingRequiredVariables.length > 0) {
      errors.push(`缺失必需变量: ${validation.missingRequiredVariables.join(', ')}`);
    }
    throw new Error(errors.join('；'));
  }
}

// ========== 模板管理函数 ==========

/**
 * 加载所有模板（默认 + 自定义）
 */
export async function loadPromptTemplates(): Promise<Record<PromptTemplateType, PromptTemplate>> {
  // 从默认模板开始
  const templates = { ...DEFAULT_TEMPLATES };
  const overrides = await loadPromptTemplateOverrides();
  for (const [key, value] of Object.entries(overrides)) {
    if (!value) {
      continue;
    }
    const templateKey = key as PromptTemplateType;
    templates[templateKey] = {
      ...templates[templateKey],
      template: value.template,
      isCustom: true,
    };
  }

  return templates;
}

/**
 * 获取单个模板
 */
export async function getPromptTemplate(type: PromptTemplateType): Promise<PromptTemplate> {
  const templates = await loadPromptTemplates();
  return templates[type];
}

/**
 * 保存自定义模板
 */
export async function saveCustomTemplate(template: PromptTemplate): Promise<void> {
  assertTemplateValidation(template.id, template.template);
  const settings = await migrateLegacyPromptTemplates();
  const overrides = normalizeLegacyPromptTemplates(settings.promptTemplates);
  overrides[template.id] = {
    template: template.template,
    updatedAt: Date.now(),
  };
  await persistPromptTemplateOverrides(settings, overrides);
}

/**
 * 重置模板为默认
 */
export async function resetTemplate(type: PromptTemplateType): Promise<PromptTemplate> {
  const settings = await migrateLegacyPromptTemplates();
  const overrides = normalizeLegacyPromptTemplates(settings.promptTemplates);
  delete overrides[type];
  await persistPromptTemplateOverrides(settings, overrides);
  return DEFAULT_TEMPLATES[type];
}

/**
 * 重置所有模板为默认
 */
export async function resetAllTemplates(): Promise<void> {
  const settings = await migrateLegacyPromptTemplates();
  await persistPromptTemplateOverrides(settings, {});
}

/**
 * 获取默认模板
 */
export function getDefaultTemplate(type: PromptTemplateType): PromptTemplate {
  return DEFAULT_TEMPLATES[type];
}

/**
 * 获取所有默认模板
 */
export function getAllDefaultTemplates(): Record<PromptTemplateType, PromptTemplate> {
  return { ...DEFAULT_TEMPLATES };
}

export function validatePromptTemplateDraft(
  type: PromptTemplateType,
  templateText: string
): PromptTemplateValidationResult {
  return buildValidationResult(type, templateText);
}

/**
 * 填充模板变量
 */
export function fillTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), value);
  }
  return result;
}

export async function resolvePromptTemplate(
  type: PromptTemplateType,
  variables: Record<string, string>
): Promise<ResolvedPromptTemplate> {
  const template = await getPromptTemplate(type);
  assertTemplateValidation(type, template.template);

  const unknownVariables = Object.keys(variables).filter(variable => !template.variables.includes(variable));
  if (unknownVariables.length > 0) {
    throw new Error(`模板 ${type} 收到未知运行时变量: ${unknownVariables.join(', ')}`);
  }

  const missingVariables = template.variables.filter((variable) => {
    if (!Object.prototype.hasOwnProperty.call(variables, variable)) {
      return true;
    }
    return typeof variables[variable] !== 'string';
  });
  if (missingVariables.length > 0) {
    throw new Error(`模板 ${type} 缺少运行时变量: ${missingVariables.join(', ')}`);
  }

  const prompt = fillTemplate(template.template, variables);
  const unresolvedVariables = extractTemplateVariables(prompt);
  if (unresolvedVariables.length > 0) {
    throw new Error(`模板 ${type} 仍有未替换变量: ${unresolvedVariables.join(', ')}`);
  }

  return {
    template,
    prompt,
    source: template.isCustom ? 'custom' : 'default',
  };
}

export default {
  loadPromptTemplates,
  getPromptTemplate,
  saveCustomTemplate,
  resetTemplate,
  resetAllTemplates,
  getDefaultTemplate,
  getAllDefaultTemplates,
  validatePromptTemplateDraft,
  fillTemplate,
  resolvePromptTemplate,
};
