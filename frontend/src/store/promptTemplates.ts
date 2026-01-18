/**
 * Prompt 模板管理
 * 默认模板和自定义模板支持
 */
import { electronService } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from './storageConfig';

// Prompt 模板类型
export type PromptTemplateType =
  | 'script_generation'      // 剧本生成
  | 'script_polish'          // 剧本润色
  | 'shot_breakdown'         // 分镜拆解
  | 'character_extraction'   // 角色提取
  | 'scene_extraction'       // 场景提取
  | 'prop_extraction'        // 道具提取
  | 'tti_prompt'             // TTI Prompt 生成
  | 'dialogue_generation'    // 对话生成
  // TTI 图片生成模板
  | 'tti_character_costume'  // 角色定妆照（三视图）
  | 'tti_scene_preview'      // 场景预览图
  | 'tti_prop_reference'     // 道具参考图
  | 'tti_shot_image';        // 分镜图片

// Prompt 模板接口
export interface PromptTemplate {
  id: PromptTemplateType;
  name: string;
  description: string;
  template: string;
  variables: string[];  // 模板变量列表 (如 {{idea}}, {{style}})
  isCustom: boolean;    // 是否自定义
}

// ========== 默认模板 ==========

const DEFAULT_TEMPLATES: Record<PromptTemplateType, PromptTemplate> = {
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
    description: '将剧本拆解为分镜列表',
    template: `你是一个专业的分镜师，请将以下剧本拆解为分镜列表。

已知角色：{{characters}}
已知场景：{{scenes}}
已知道具：{{props}}

剧本：
{{script}}

要求：
1. 按剧情顺序拆解为若干分镜
2. 每个分镜应该是一个完整的画面
3. 为每个分镜生成AI图片生成用的prompt（英文，详细描述画面内容、角色姿态、场景细节、光影氛围）
4. 合理分配镜头类型和运镜方式（static/pan/zoom-in/tracking）
5. 建议时长通常为2-5秒
6. 关联相关角色和道具

请以 JSON 格式输出分镜列表：

\`\`\`json
{
  "shots": [
    {
      "scriptContent": "对应的剧本原文片段",
      "shotType": "close-up/medium/wide/extreme-wide",
      "cameraMovement": "static/pan/zoom-in/tracking",
      "duration": 3,
      "description": "画面描述，用于 AI 生图（英文）",
      "dialogue": "对话或旁白内容",
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

  character_extraction: {
    id: 'character_extraction',
    name: '角色提取',
    description: '从剧本中提取角色信息',
    template: `分析以下剧本，提取所有角色信息。

剧本：
{{script}}

请以 JSON 格式输出角色列表：

\`\`\`json
{
  "characters": [
    {
      "name": "角色名称",
      "description": "角色外貌和性格描述，用于 AI 生图保持一致性",
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
      "description": "场景详细描述，用于 AI 生图保持一致性",
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
      "description": "道具详细描述",
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

  tti_prompt: {
    id: 'tti_prompt',
    name: 'TTI Prompt 生成',
    description: '为分镜生成 AI 绘图 Prompt',
    template: `根据以下分镜信息，生成适合 AI 绘图的英文 Prompt。

分镜描述：{{description}}
角色信息：{{characters}}
场景信息：{{scene}}
风格要求：{{style}}

要求：
1. 使用英文输出
2. Prompt 应详细描述画面构图、光线、色调
3. 包含必要的风格标签（如 cinematic, masterpiece 等）
4. 控制在 200 词以内

请直接输出 Prompt，无需其他说明。
`,
    variables: ['description', 'characters', 'scene', 'style'],
    isCustom: false,
  },

  dialogue_generation: {
    id: 'dialogue_generation',
    name: '对话生成',
    description: '为分镜生成角色对话',
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
};

// ========== 存储路径 ==========

async function getTemplatesPath(): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/prompt-templates.json`;
}

// ========== 模板管理函数 ==========

/**
 * 加载所有模板（默认 + 自定义）
 */
export async function loadPromptTemplates(): Promise<Record<PromptTemplateType, PromptTemplate>> {
  // 从默认模板开始
  const templates = { ...DEFAULT_TEMPLATES };

  if (!electronService.isElectron()) {
    // 浏览器环境
    try {
      const data = localStorage.getItem('koma_prompt_templates');
      if (data) {
        const custom = JSON.parse(data) as Partial<Record<PromptTemplateType, PromptTemplate>>;
        for (const [key, value] of Object.entries(custom)) {
          if (value) {
            templates[key as PromptTemplateType] = { ...value, isCustom: true };
          }
        }
      }
    } catch {
      // ignore
    }
    return templates;
  }

  // Electron 环境
  try {
    const path = await getTemplatesPath();
    const exists = await electronService.fs.exists(path);
    if (exists) {
      const data = await electronService.fs.readFile(path);
      const custom = JSON.parse(data) as Partial<Record<PromptTemplateType, PromptTemplate>>;
      for (const [key, value] of Object.entries(custom)) {
        if (value) {
          templates[key as PromptTemplateType] = { ...value, isCustom: true };
        }
      }
    }
  } catch {
    // ignore
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
  const customTemplate = { ...template, isCustom: true };

  if (!electronService.isElectron()) {
    const data = localStorage.getItem('koma_prompt_templates');
    const existing = data ? JSON.parse(data) : {};
    existing[template.id] = customTemplate;
    localStorage.setItem('koma_prompt_templates', JSON.stringify(existing));
    return;
  }

  const path = await getTemplatesPath();
  let existing: Record<string, PromptTemplate> = {};
  try {
    const exists = await electronService.fs.exists(path);
    if (exists) {
      const data = await electronService.fs.readFile(path);
      existing = JSON.parse(data);
    }
  } catch {
    // ignore
  }

  existing[template.id] = customTemplate;
  await electronService.fs.writeFile(path, JSON.stringify(existing, null, 2));
}

/**
 * 重置模板为默认
 */
export async function resetTemplate(type: PromptTemplateType): Promise<PromptTemplate> {
  if (!electronService.isElectron()) {
    const data = localStorage.getItem('koma_prompt_templates');
    if (data) {
      const existing = JSON.parse(data);
      delete existing[type];
      localStorage.setItem('koma_prompt_templates', JSON.stringify(existing));
    }
    return DEFAULT_TEMPLATES[type];
  }

  const path = await getTemplatesPath();
  try {
    const exists = await electronService.fs.exists(path);
    if (exists) {
      const data = await electronService.fs.readFile(path);
      const existing = JSON.parse(data);
      delete existing[type];
      await electronService.fs.writeFile(path, JSON.stringify(existing, null, 2));
    }
  } catch {
    // ignore
  }

  return DEFAULT_TEMPLATES[type];
}

/**
 * 重置所有模板为默认
 */
export async function resetAllTemplates(): Promise<void> {
  if (!electronService.isElectron()) {
    localStorage.removeItem('koma_prompt_templates');
    return;
  }

  const path = await getTemplatesPath();
  try {
    await electronService.fs.remove(path);
  } catch {
    // ignore
  }
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

/**
 * 填充模板变量
 */
export function fillTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}

export default {
  loadPromptTemplates,
  getPromptTemplate,
  saveCustomTemplate,
  resetTemplate,
  resetAllTemplates,
  getDefaultTemplate,
  getAllDefaultTemplates,
  fillTemplate,
};
