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
  | 'random_script_generation' // 随机剧本生成（一步完成）
  | 'script_generation'        // 剧本生成
  | 'script_polish'            // 剧本润色
  | 'shot_breakdown'           // 分镜拆解
  | 'shot_prompt_generation'   // 分镜提示词生成（通用）
  | 'shot_image_prompt_generation' // 分镜图片提示词生成
  | 'shot_video_prompt_generation' // 分镜视频提示词生成
  | 'grid_shot_prompt_generation'  // 九宫格分镜提示词生成（将单个分镜扩展为9个连续画面）
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
  | 'tti_grid_shot_image'      // 九宫格分镜图片（3×3网格）
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
  variables: PromptTemplateVariable[];
  isCustom: boolean;    // 是否自定义
}

export interface PromptTemplateVariable {
  name: string;
  label: string;
  description: string;
  format: string;
  example?: string;
  required?: boolean;
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

const COMMON_VARIABLE_DEFINITIONS: Record<string, Omit<PromptTemplateVariable, 'name'>> = {
  duration: {
    label: '目标时长',
    description: '剧本目标时长，供随机剧本或剧本生成模板控制篇幅。',
    format: '分钟数字字符串',
    example: '3',
    required: true,
  },
  idea: {
    label: '创意',
    description: '用户提供的故事创意、概念或一句话灵感。',
    format: '自然语言短段落',
    example: '一个在旧城区夜巡的入殓师意外发现亡者会留下声音',
    required: true,
  },
  style: {
    label: '风格',
    description: '题材或叙事风格标签。',
    format: '短语或枚举字符串',
    example: '悬疑、治愈、黑色幽默',
    required: true,
  },
  script: {
    label: '剧本文本',
    description: '完整剧本文本，用于提取、拆解或润色。',
    format: '完整自然语言文本',
    example: '场景一：雨夜，顾行蹲在后院焚烧纸钱……',
    required: true,
  },
  requirements: {
    label: '润色要求',
    description: '用户补充的润色要求或限制。',
    format: '自然语言短段落',
    example: '强化节奏，保留人物关系，不要改动结局',
    required: true,
  },
  scriptContent: {
    label: '分镜素材',
    description: '分镜对应的原始剧本内容，仅作为视觉提炼素材，不应被原样复述。',
    format: '自然语言短段落',
    example: '顾行在后院把纸钱投入火盆，火光映亮脸侧',
    required: true,
  },
  characters: {
    label: '角色信息',
    description: '当前任务涉及的角色名或角色视觉信息列表。',
    format: '逗号分隔字符串或多行列表',
    example: '顾行, 老周',
    required: true,
  },
  scenes: {
    label: '场景信息',
    description: '当前任务涉及的场景列表或场景信息。',
    format: '逗号分隔字符串或 JSON 字符串',
    example: '殡葬用品店后院, 雨夜墓地',
    required: true,
  },
  props: {
    label: '道具信息',
    description: '当前任务涉及的道具列表或道具信息。',
    format: '逗号分隔字符串或 JSON 字符串',
    example: '纸钱, 铁盆, 墓碑',
    required: true,
  },
  emotion: {
    label: '情绪标签',
    description: '画面情绪标签，使用时应转化为可见的表情、姿态、光线或色调特征。',
    format: '短语',
    example: '平静、压抑、警觉',
    required: true,
  },
  stylePrefix: {
    label: '画风前缀',
    description: '项目或主题预设提供的视觉风格前缀。',
    format: '逗号分隔短语字符串',
    example: 'anime style, japanese animation, vibrant colors',
    required: true,
  },
  cameraOptions: {
    label: '可选运镜',
    description: '允许模型选择的运镜关键字列表。',
    format: '逗号分隔关键字',
    example: 'static shot, tracking shot, push in',
    required: true,
  },
  shotTypeOptions: {
    label: '可选景别',
    description: '允许模型选择的景别关键字列表。',
    format: '逗号分隔关键字',
    example: 'close-up, medium shot, wide shot',
    required: true,
  },
  characterRefs: {
    label: '角色引用表',
    description: '可插入到提示词中的角色引用清单，格式为角色名到 @角色ID 的映射。',
    format: '多行文本',
    example: '顾行: @char_001',
    required: true,
  },
  sceneRefs: {
    label: '场景引用表',
    description: '可插入到提示词中的场景引用清单，格式为场景名到 @scene_ID 的映射。',
    format: '多行文本',
    example: '雨夜墓地: @scene_scene_001',
    required: true,
  },
  propRefs: {
    label: '道具引用表',
    description: '可插入到提示词中的道具引用清单，格式为道具名到 @prop_ID 的映射。',
    format: '多行文本',
    example: '铁盆: @prop_prop_001',
    required: true,
  },
  shotTypeHint: {
    label: '景别提示',
    description: '当前分镜已经确定的景别提示，应优先遵守。',
    format: '短语',
    example: 'medium close-up',
    required: true,
  },
  cameraMovementHint: {
    label: '运镜提示',
    description: '当前分镜已经确定的运镜提示，应优先遵守。',
    format: '短语',
    example: 'slow tracking shot',
    required: true,
  },
  durationSeconds: {
    label: '镜头时长',
    description: '当前镜头的总时长，用于视频提示词的时间片段规划。',
    format: '秒数字符串',
    example: '4',
    required: true,
  },
  imageMode: {
    label: '图片模式',
    description: '当前分镜的图片生成模式，值为 normal 或 grid。',
    format: '枚举字符串',
    example: 'grid',
    required: true,
  },
  gridSequencePrompt: {
    label: '九宫格镜头拆解',
    description: '九宫格模式下已生成的 9 条连续镜头提示词，可作为视频提示词的分段依据。',
    format: '多行文本',
    example: '镜头01：...\n镜头02：...',
    required: true,
  },
  character: {
    label: '角色资料',
    description: '角色原始资料或角色卡信息。',
    format: '自然语言短段落或 JSON 片段',
    example: '顾行，男，二十多岁，面容清瘦，寡言',
    required: true,
  },
  context: {
    label: '上下文',
    description: '角色视觉设计时可参考的剧情上下文，输出时仍需只保留外观信息。',
    format: '自然语言短段落',
    example: '角色长期在旧城区夜间工作，服饰偏耐磨、防水',
    required: true,
  },
  scene: {
    label: '场景信息',
    description: '场景相关的输入信息。',
    format: '自然语言短段落',
    example: '雨夜墓地，墓碑稀疏排列，湿地反光',
    required: true,
  },
  plot: {
    label: '情节素材',
    description: '剧情素材，仅供提炼视觉事实，不应用于直接复述。',
    format: '自然语言短段落',
    example: '两人在墓前短暂停顿后继续对话',
    required: true,
  },
  appearance: {
    label: '角色外观',
    description: '角色客观外观、服装、材质、配色与体态描述。',
    format: '自然语言短段落，仅限可见外观',
    example: '瘦高体型，苍白肤色，黑色短发，深灰长风衣，防水皮靴',
    required: true,
  },
  description: {
    label: '视觉描述',
    description: '客观视觉描述，只写当前可见外观、动作、空间、材质、光照等事实。',
    format: '自然语言短段落',
    example: '湿润石板地面上立着铁盆，火光映亮人物侧脸，纸灰在雨雾中飘散',
    required: true,
  },
  location: {
    label: '空间位置',
    description: '场景的地理或空间位置描述。',
    format: '短语',
    example: '殡葬用品店后院',
    required: true,
  },
  time: {
    label: '时间状态',
    description: '画面中的时间状态，应转为可见光照或天色特征。',
    format: '短语或枚举',
    example: 'night',
    required: true,
  },
  mood: {
    label: '可见氛围',
    description: '画面氛围的可见化描述，应落到光线、色调、天气或空间状态。',
    format: '短语',
    example: 'low-key lighting, damp air, muted blue-gray palette',
    required: true,
  },
  type: {
    label: '类型',
    description: '对象的类型或类别说明。',
    format: '短语',
    example: 'ritual paper money',
    required: true,
  },
  cameraMovement: {
    label: '镜头运动',
    description: '最终视频提示词中的镜头运动描述。',
    format: '短语',
    example: 'slow dolly in',
    required: true,
  },
  characterName: {
    label: '角色名',
    description: '角色展示视频的主角名称。',
    format: '字符串',
    example: '顾行',
    required: true,
  },
  action: {
    label: '动作描述',
    description: '主体当前可见动作与动态表现。',
    format: '自然语言短段落',
    example: '微微抬头，衣摆轻晃，眼神平稳移动',
    required: true,
  },
  motion: {
    label: '运动描述',
    description: '道具或主体的运动方式。',
    format: '自然语言短段落',
    example: 'slow rotation, subtle tilt, surface highlights moving across edges',
    required: true,
  },
  motionTimeline: {
    label: '动作时间线',
    description: '按 `[start,end]秒` 组织的动作与镜头变化时间线。',
    format: '多段时间片段文本',
    example: '[0,1]秒：人物静止建立构图；[1,3]秒：手部缓慢抬起，镜头缓推',
    required: true,
  },
  shotDescription: {
    label: '分镜剧情概述',
    description: '当前分镜的剧情概述或画面主题，用于九宫格图片生成时的全局描述。',
    format: '自然语言短段落',
    example: '顾行在后院焚烧纸钱，火光映照出压抑的夜晚氛围',
    required: true,
  },
  gridPrompt: {
    label: '九宫格镜头描述',
    description: '已组装的 9 条连续画面描述（镜头01~镜头09），用于九宫格 TTI 图片生成。',
    format: '多行文本，每行以 镜头NN： 开头',
    example: '镜头01：远景，雨夜墓地全貌…\n镜头02：中景，人物走向墓碑…',
    required: true,
  },
  resolution: {
    label: '分辨率',
    description: '目标图片分辨率。',
    format: '短语',
    example: '8K',
    required: true,
  },
  aspectRatio: {
    label: '画幅比例',
    description: '目标图片画幅比例，九宫格中每个格子的画面比例应与整体一致。',
    format: '比例字符串',
    example: '16:9',
    required: true,
  },
};

function variable(
  name: string,
  overrides: Partial<Omit<PromptTemplateVariable, 'name'>> = {}
): PromptTemplateVariable {
  const fallback: Omit<PromptTemplateVariable, 'name'> = {
    label: name,
    description: `${name} 变量`,
    format: '字符串',
    required: true,
  };
  return {
    name,
    ...(COMMON_VARIABLE_DEFINITIONS[name] || fallback),
    ...overrides,
  };
}

function getVariableNames(variables: PromptTemplateVariable[]): string[] {
  return variables.map(variableItem => variableItem.name);
}

function getRequiredVariableNames(variables: PromptTemplateVariable[]): string[] {
  return variables.filter(variableItem => variableItem.required !== false).map(variableItem => variableItem.name);
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
2. 如果需要引用资产，使用显式的 @mentions 形式：
   - 角色：@char_角色ID
   - 场景：@scene_场景ID
   - 道具：@prop_道具ID
3. 包含运镜描述和景别描述（视频提示词时）
4. 描述要具体、生动，但只写客观可见事实（外观、动作、光线、环境），不要复述剧情或背景设定
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
    variables: [variable('duration')],
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
    variables: [variable('idea'), variable('style'), variable('duration')],
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

硬性要求：
1. 只返回润色后的完整剧本正文
2. 不要返回任何前言、后记、说明、总结或解释
3. 不要使用 Markdown 标题、粗体、分隔线、代码块
4. 不要补充“以下是润色版”之类提示语
5. 不要改动角色名、集数、场次编号的语义结构
`,
    variables: [variable('script'), variable('requirements')],
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

【重要】characters、scenes、props 字段必须使用上方"已知角色/场景/道具"列表中的原始名称，不要自行编造或修改名称。如果剧本中出现了不在列表中的角色/场景/道具，则不填入对应字段。

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
      "dialogue": "角色名（情绪）：\\"台词内容\\"",
      "characters": ["已知角色名称"],
      "emotion": "情绪标签",
      "props": ["已知道具名称"],
      "scenes": ["已知场景名称"]
    }
  ]
}
\`\`\`
`,
    variables: [variable('script'), variable('characters'), variable('scenes'), variable('props')],
    isCustom: false,
  },

  shot_prompt_generation: {
    id: 'shot_prompt_generation',
    name: '分镜提示词生成',
    description: '为分镜生成视频/图片提示词',
    template: `根据以下分镜信息生成一条可用于视频或图片模型的中文提示词。

剧本内容：{{scriptContent}}
出场角色：{{characters}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}
推荐运镜：{{cameraMovementHint}}
推荐景别：{{shotTypeHint}}

要求：
1. 使用中文输出
2. 为每个角色添加 @角色ID 引用格式（角色引用列表见下方）
3. 只保留当前镜头直接可观察到的画面信息，不要复述剧情，不要写心理活动或因果解释
4. 优先使用推荐运镜和推荐景别；如需微调，只能从以下关键字中选择：运镜 {{cameraOptions}}；景别 {{shotTypeOptions}}
5. 描述人物外观、姿态、动作、空间关系、构图、光线和环境细节
6. 输出应像拍摄指令，不要写小说句子，不要写“正在经历什么故事”

可用角色引用：
{{characterRefs}}

输出格式：直接输出提示词，无需其他说明
`,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('emotion'),
      variable('stylePrefix'),
      variable('cameraMovementHint'),
      variable('shotTypeHint'),
      variable('cameraOptions'),
      variable('shotTypeOptions'),
      variable('characterRefs'),
    ],
    isCustom: false,
  },

  shot_image_prompt_generation: {
    id: 'shot_image_prompt_generation',
    name: '分镜图片提示词生成',
    description: '为分镜生成静态图片提示词',
    template: `根据以下分镜信息生成一条静态分镜图片提示词。

剧本内容：{{scriptContent}}
出场角色：{{characters}}
出现场景：{{scenes}}
出场道具：{{props}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}
推荐景别：{{shotTypeHint}}

要求：
1. 使用中文输出
2. 为每个角色添加 @char_角色ID 引用格式（角色引用列表见下方）
3. 为每个场景添加 @scene_场景ID 引用格式（场景引用列表见下方）
4. 为每个道具添加 @prop_道具ID 引用格式（道具引用列表见下方）
5. 只描述当前静止画面中可见的客观事实，不要复述剧情，不要描述人物内心，不要解释事件原因
6. 画面内容必须聚焦于角色外观、服装、姿态、手部动作、道具状态、空间关系、构图和光线
7. 优先使用推荐景别；如需微调，只能从以下景别关键字中选择：{{shotTypeOptions}}
8. 把“情绪氛围”转成可见线索，如表情、肢体张力、天气、色调、明暗对比
9. 输出一段连续中文提示词，不要分点，不要加前言

可用角色引用：
{{characterRefs}}

可用场景引用：
{{sceneRefs}}

可用道具引用：
{{propRefs}}

输出格式：直接输出提示词，无需其他说明
`,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('emotion'),
      variable('stylePrefix'),
      variable('shotTypeHint'),
      variable('shotTypeOptions'),
      variable('characterRefs'),
      variable('sceneRefs'),
      variable('propRefs'),
    ],
    isCustom: false,
  },

  shot_video_prompt_generation: {
    id: 'shot_video_prompt_generation',
    name: '分镜视频提示词生成',
    description: '为分镜生成动态视频提示词',
    template: `根据以下分镜信息生成一条动态分镜视频提示词。

剧本内容：{{scriptContent}}
出场角色：{{characters}}
出现场景：{{scenes}}
出场道具：{{props}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}
图片模式：{{imageMode}}
九宫格镜头拆解：{{gridSequencePrompt}}
镜头总时长：{{durationSeconds}} 秒
推荐运镜：{{cameraMovementHint}}
推荐景别：{{shotTypeHint}}

要求：
1. 使用中文输出
2. 为每个角色添加 @char_角色ID 引用格式（角色引用列表见下方）
3. 为每个场景添加 @scene_场景ID 引用格式（场景引用列表见下方）
4. 为每个道具添加 @prop_道具ID 引用格式（道具引用列表见下方）
5. 只能描述镜头内直接可观察到的动作、表情变化、镜头运动与环境动态，不要复述剧情，不要写心理活动，不要写因果解释
6. 若图片模式为 \`normal\`，输出必须包含连续的时间片段，格式严格为 \`[start,end]秒：描述\`
7. 若图片模式为 \`normal\`，时间片段总长度必须覆盖整个镜头时长 {{durationSeconds}} 秒
8. 若图片模式为 \`grid\`，必须基于“九宫格镜头拆解”写成连续 9 段 sequence，每一段对应一个分镜推进节点，角色外观、服装、场景与光线保持统一，不要输出时间片段
9. 若图片模式为 \`grid\`，输出格式严格为：
The video plays out in a continuous 9-part sequence:
1. [景别/视角]: [描述]
2. [景别/视角]: [描述]
3. [景别/视角]: [描述]
4. [景别/视角]: [描述]
5. [景别/视角]: [描述]
6. [景别/视角]: [描述]
7. [景别/视角]: [描述]
8. [景别/视角]: [描述]
9. [景别/视角]: [描述]
10. 优先使用推荐运镜和推荐景别；如需微调，只能从以下关键字中选择：运镜 {{cameraOptions}}；景别 {{shotTypeOptions}}
11. 每个片段都要写清楚人物动作、镜头运动、环境变化和画面节奏
12. 输出只保留提示词正文，不要加解释，不要加标题

可用角色引用：
{{characterRefs}}

可用场景引用：
{{sceneRefs}}

可用道具引用：
{{propRefs}}

输出格式：直接输出提示词，无需其他说明
`,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('emotion'),
      variable('stylePrefix'),
      variable('imageMode'),
      variable('gridSequencePrompt'),
      variable('durationSeconds'),
      variable('cameraMovementHint'),
      variable('shotTypeHint'),
      variable('cameraOptions'),
      variable('shotTypeOptions'),
      variable('characterRefs'),
      variable('sceneRefs'),
      variable('propRefs'),
    ],
    isCustom: false,
  },

  grid_shot_prompt_generation: {
    id: 'grid_shot_prompt_generation',
    name: '九宫格分镜提示词生成',
    description: '将单个分镜扩展为9个连续画面的提示词',
    template: `根据以下分镜信息，将该分镜的剧情内容扩展为一组具有清晰叙事推进关系的 3×3 九宫格分镜提示词文本，共 9 个连续镜头。

剧本内容：{{scriptContent}}
出场角色：{{characters}}
出现场景：{{scenes}}
出场道具：{{props}}
情绪氛围：{{emotion}}
风格前缀：{{stylePrefix}}

要求：
1. 全部镜头发生在同一场景与同一时间轴内，九个画面之间必须存在明确的前后承接关系，形成连续的动作、视线或情绪推进，而不是彼此孤立的画面拼接
2. 分镜采用电影镜头语言自由发挥：在整体叙事推进中自然涵盖远景、中景、近景与特写等不同景别，并根据剧情需要灵活使用正视、侧视、背视、过肩、内反打、轻微俯仰等视角变化
3. 镜头景别与角度不与编号固定绑定，而是由剧情发展自动选择最合适的表现方式，使九个镜头整体读起来具备真实影视分镜的流动感
4. 在全部九个分镜中，人物的外观、服装、体型比例、面部特征保持一致，整体色彩倾向与光照条件统一，仅允许人物动作、姿态以及镜头远近和角度发生变化
5. 为每个角色添加 @char_角色ID 引用格式（角色引用列表见下方）
6. 为每个场景添加 @scene_场景ID 引用格式（场景引用列表见下方）
7. 为每个道具添加 @prop_道具ID 引用格式（道具引用列表见下方）
8. 只描述客观可见事实（外观、动作、光线、环境），不要复述剧情，不要描述人物内心
9. 把"情绪氛围"转成可见线索，如表情、肢体张力、天气、色调、明暗对比

可用角色引用：
{{characterRefs}}

可用场景引用：
{{sceneRefs}}

可用道具引用：
{{propRefs}}

输出格式（严格按此格式输出，不要有前言或解释）：
镜头01：[描述]
镜头02：[描述]
镜头03：[描述]
镜头04：[描述]
镜头05：[描述]
镜头06：[描述]
镜头07：[描述]
镜头08：[描述]
镜头09：[描述]
`,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('emotion'),
      variable('stylePrefix'),
      variable('characterRefs'),
      variable('sceneRefs'),
      variable('propRefs'),
    ],
    isCustom: false,
  },

  character_extraction: {
    id: 'character_extraction',
    name: '角色提取',
    description: '从剧本中提取角色信息',
    template: `分析以下剧本，提取所有角色信息。

【核心任务】
分析剧本文本，提取所有角色的结构化资料与视觉形象方案。必须提取剧本中出现的所有人物角色，无论是主角、配角还是仅有少量描述的次要角色。

【字段要求】
1. “name”：角色名称
2. “age”：年龄，能判断时必须填写；无法判断时填写 "未知"
3. “gender”：只能填写 "male"、"female"、"neutral"、"unknown"
4. “role”：只能填写 "protagonist"、"antagonist"、"supporting"
5. “appearance”：只写客观可见外观，包括脸型、瞳色、发型发色、服装配饰、体态、材质与配色
6. “description”：只写角色识别信息或人物小传，不得替代 “appearance” 承担视觉描述职责

【appearance 红线规则】
1. 服装描述需包含【颜色】、【款式】、【材质】三个维度
2. 严禁使用性格、情绪、气质、命运等抽象词汇
3. 严禁使用"好看的"、"普通的"等模糊词
4. 输出为中文描述

【appearance 禁止内容（必须剔除）】
- 职业/身份/社会关系（如：店主、老板、养父、继承）
- 超自然/能力/设定（如：能看见鬼魂、通灵、诅咒）
- 经历/背景/事件（如：火场被救、全家遇难、身世成谜）

剧本：
{{script}}

请以 JSON 格式输出角色列表：

\`\`\`json
{
  "characters": [
    {
      "name": "角色名称",
      "age": "28岁",
      "gender": "male",
      "role": "protagonist",
      "appearance": "窄长脸，深棕色瞳孔，黑色短发，深灰色长风衣，内搭白色衬衫，黑色长裤，皮质短靴，衣料略有雨水反光",
      "description": "年轻调查员，长期独自追查旧案"
    }
  ]
}
\`\`\`
`,
    variables: [variable('script')],
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
    variables: [variable('character'), variable('context')],
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

要求：
1. description 字段只写空间结构、建筑/自然元素、地面、陈设、天气痕迹、光线和色调
2. 不要写场景中发生了什么剧情，不要写人物关系，不要写事件因果
3. mood 字段应尽量写成可见氛围线索，而不是抽象评价
4. description 字段禁止出现人物、角色名、人物动作、对白和表情

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
    variables: [variable('script')],
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

提取范围（关键）：
- 只提取"会与角色发生交互"的道具：法宝、武器、手持物品、可携带/可使用/可交换的工具、信物等。
- 严禁提取环境类物品：沙发、椅子、床、柜子、桌子、灯具、门、窗、墙壁、地板、天花板、
  管道、固定设施、建筑结构，以及其它基本不会在剧情中被移动或使用的陈设。这类元素属于
  场景（scene）描述，不进入 props。
- 角色身上的服装、首饰、发饰等造型组成部分不作为独立道具（归角色外观）。
- 宠物/随身生物不作为道具。

description 字段要求：
1. 只写形状、材质、结构、颜色、磨损、尺寸感和表面细节。
2. 不要写道具在剧情中的象征意义，不要复述它推动了什么事件。
3. 禁止出现人物、角色名、手持/使用动作、对白和表情。

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
    variables: [variable('script')],
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
    variables: [variable('scene'), variable('characters'), variable('plot'), variable('style')],
    isCustom: false,
  },

  // ========== TTI 图片生成模板 ==========

  tti_character_costume: {
    id: 'tti_character_costume',
    name: '角色定妆照（三视图）',
    description: '生成角色三视图定妆照',
    template: '{{stylePrefix}}, character turnaround sheet, white background, front view | side view | back view, three poses in one image, full body standing reference, neutral stance, clear silhouette, clothing layers visible, objective appearance details only, {{gender}} {{age}} {{appearance}}',
    variables: [
      variable('stylePrefix'),
      variable('gender', {
        description: '角色性别英文标签（male/female/androgynous），自动从 Character.gender 映射。未知或空值会跳过。',
      }),
      variable('age', {
        description: '角色年龄的英文描述。纯数字会转为 "N years old"；"未知" 等占位值会跳过。',
      }),
      variable('appearance', {
        description: '角色当前用于生图的客观外观描述，只能包含脸部、发型、服装、材质、配色、体态等可见信息。',
      }),
    ],
    isCustom: false,
  },

  tti_scene_preview: {
    id: 'tti_scene_preview',
    name: '场景预览图',
    description: '生成场景参考图',
    template: '{{stylePrefix}}, environment concept art, no people, no character action, establishing shot, wide frame, objective environmental details only, {{description}}, location: {{location}}, visible time cues: {{time}}, visible atmosphere cues: {{mood}}, layered depth, architectural and material details, cinematic composition',
    variables: [
      variable('stylePrefix'),
      variable('description', {
        description: '场景中的客观环境细节，只描述空间、建筑、地面、植被、天气痕迹、陈设等可见内容，禁止出现人物、角色名、人物动作和对白。',
      }),
      variable('location'),
      variable('time', {
        description: '用于表现时间状态的可见线索，如 night、twilight、overcast daylight。',
      }),
      variable('mood', {
        description: '场景氛围的可见线索，只能写光线、色调、湿度、雾气、空气状态等物理表现。',
      }),
    ],
    isCustom: false,
  },

  tti_prop_reference: {
    id: 'tti_prop_reference',
    name: '道具参考图',
    description: '生成道具参考图',
    template: '{{stylePrefix}}, prop design sheet, no people, no hands, no character action, centered composition, plain background, studio lighting, objective product view only, {{type}}, {{description}}, clear material edges, surface texture details, clean presentation',
    variables: [
      variable('stylePrefix'),
      variable('description', {
        description: '道具的客观外观描述，只描述形状、结构、材质、磨损、颜色和表面细节，禁止出现人物、角色名和人物动作。',
      }),
      variable('type'),
    ],
    isCustom: false,
  },

  tti_shot_image: {
    id: 'tti_shot_image',
    name: '分镜图片',
    description: '生成分镜预览图',
    template: '{{stylePrefix}}, {{shotType}}, objective still frame, {{description}}, visible emotion cues: {{emotion}}, cinematic lighting, layered composition, detailed environment, high quality, 4k',
    variables: [
      variable('stylePrefix'),
      variable('description', {
        description: '当前镜头的客观可见事实，应包含人物外观、姿态、动作瞬间、空间关系、道具状态与环境细节。',
      }),
      variable('shotType', {
        label: '镜头景别',
        description: '当前静帧使用的景别或机位短语。',
        format: '短语',
        example: 'medium close-up, eye-level',
      }),
      variable('emotion', {
        description: '情绪的可见线索，应转化为表情、肢体张力、光照或色调特征。',
      }),
    ],
    isCustom: false,
  },

  tti_grid_shot_image: {
    id: 'tti_grid_shot_image',
    name: '九宫格分镜图片',
    description: '生成 3×3 九宫格网格分镜图',
    template: `{{stylePrefix}}, 根据{{shotDescription}}, 生成一张具有凝聚力的 3×3 网格图像, 包含在同一环境中的 9 个不同摄像机镜头, 严格保持人物/物体、服装和光线的一致性, 每个网格画面的比例保持为{{aspectRatio}}, {{resolution}}分辨率, {{aspectRatio}}画幅。

{{gridPrompt}}`,
    variables: [
      variable('stylePrefix'),
      variable('shotDescription'),
      variable('gridPrompt'),
      variable('resolution'),
      variable('aspectRatio'),
    ],
    isCustom: false,
  },

  // ========== ITV 视频生成模板 ==========

  itv_shot_video: {
    id: 'itv_shot_video',
    name: '分镜视频',
    description: '生成分镜动态视频',
    template: '{{stylePrefix}}, objective motion picture prompt, {{description}}, shot scale: {{shotType}}, camera movement: {{cameraMovement}}, total duration {{durationSeconds}} seconds, {{motionTimeline}}, cinematic continuity, high quality video',
    variables: [
      variable('stylePrefix'),
      variable('description', {
        description: '视频镜头中的主体、环境和动作基础状态，只包含当前镜头可见事实。',
      }),
      variable('shotType', {
        label: '镜头景别',
        description: '视频镜头使用的景别短语。',
        format: '短语',
        example: 'wide shot',
      }),
      variable('cameraMovement'),
      variable('durationSeconds'),
      variable('motionTimeline'),
    ],
    isCustom: false,
  },

  itv_character_motion: {
    id: 'itv_character_motion',
    name: '角色动态视频',
    description: '生成角色动态展示视频',
    template: '{{characterName}} {{action}}, {{stylePrefix}}, smooth animation, character showcase, professional quality',
    variables: [variable('characterName'), variable('action'), variable('stylePrefix')],
    isCustom: false,
  },

  itv_prop_motion: {
    id: 'itv_prop_motion',
    name: '道具动态视频',
    description: '生成道具动态展示视频',
    template: '{{stylePrefix}}, {{description}}, {{motion}}, professional product animation, smooth camera movement, high quality video',
    variables: [variable('stylePrefix'), variable('description'), variable('motion')],
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
  const allowedVariables = getVariableNames(DEFAULT_TEMPLATES[type]?.variables || []);
  const requiredVariables = getRequiredVariableNames(DEFAULT_TEMPLATES[type]?.variables || []);
  const usedVariables = extractTemplateVariables(templateText);
  const unknownVariables = usedVariables.filter(variable => !allowedVariables.includes(variable));
  const missingRequiredVariables = requiredVariables.filter(variable => !usedVariables.includes(variable));

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
  const variableNames = getVariableNames(template.variables);
  const requiredVariableNames = getRequiredVariableNames(template.variables);

  // 运行时仅警告模板校验问题，不阻断执行
  const validation = buildValidationResult(type, template.template);
  if (!validation.isValid) {
    const warnings: string[] = [];
    if (validation.unknownVariables.length > 0) {
      warnings.push(`模板中存在未声明变量: ${validation.unknownVariables.join(', ')}`);
    }
    if (validation.missingRequiredVariables.length > 0) {
      warnings.push(`模板中缺少变量占位符: ${validation.missingRequiredVariables.join(', ')}`);
    }
    console.warn(`[PromptTemplate] 模板 ${type} 校验警告: ${warnings.join('；')}`);
  }

  // 过滤掉模板未声明的多余变量（仅警告，不阻断）
  const unknownVariables = Object.keys(variables).filter(variable => !variableNames.includes(variable));
  if (unknownVariables.length > 0) {
    console.warn(`[PromptTemplate] 模板 ${type} 收到未声明变量（已忽略）: ${unknownVariables.join(', ')}`);
  }
  const filteredVariables = Object.fromEntries(
    Object.entries(variables).filter(([key]) => variableNames.includes(key))
  );

  const missingVariables = requiredVariableNames.filter((variable) => {
    if (!Object.prototype.hasOwnProperty.call(filteredVariables, variable)) {
      return true;
    }
    return typeof filteredVariables[variable] !== 'string';
  });
  if (missingVariables.length > 0) {
    throw new Error(`模板 ${type} 缺少运行时变量: ${missingVariables.join(', ')}`);
  }

  const prompt = fillTemplate(template.template, filteredVariables);
  const unresolvedVariables = extractTemplateVariables(prompt);
  let finalPrompt = prompt;
  if (unresolvedVariables.length > 0) {
    console.warn(`[PromptTemplate] 模板 ${type} 仍有未替换变量（已清除）: ${unresolvedVariables.join(', ')}`);
    // 清除未替换的 {{ variable }} 占位符，避免阻断生成流程
    finalPrompt = prompt.replace(/\{\{\s*\w+\s*\}\}/g, '');
  }

  return {
    template,
    prompt: finalPrompt,
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
