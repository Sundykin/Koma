/**
 * Prompt 模板管理
 * 默认模板和自定义模板支持
 */
import { electronService } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from './storageConfig';
import { loadSettings, saveSettings } from './globalStore';
import { STORAGE_KEYS } from '../constants/storageKeys';
import type { AppSettings } from '../types';
import { VIDEO_REASONING_TEMPLATE_CONTENT } from './templates/videoReasoning';

// Prompt 模板类型
export type PromptTemplateType =
  // 全局约束模板（自动注入到 TTI/ITV 模板，对应 prompts/整体提示词.txt）
  | 'global_positive_prefix'      // 前置正向（通用一致性 + 高质量约束）
  | 'global_positive_suffix'      // 后置正向（人物/场景稳定 + 视频首帧一致性）
  | 'global_negative_suffix'      // 后置负向（畸形 / drift / 字幕水印禁项）
  | 'global_video_constraints'    // 视频规约（仅注入到视频类模板）
  // 系统提示模板（System Prompt）
  | 'shot_prompt_system'       // 分镜提示词生成的系统提示
  | 'shot_breakdown_system'    // 分镜拆解的系统提示
  | 'script_analysis_system'   // 剧本解析的系统提示
  // LLM 任务模板
  | 'random_script_generation' // 随机剧本生成（一步完成）
  | 'script_generation'        // 剧本生成
  | 'script_polish'            // 剧本润色
  | 'shot_breakdown'           // 分镜拆解
  | 'shot_image_prompt_generation' // 分镜图片提示词生成
  | 'shot_video_6s_multi'          // 分镜视频提示词 · 多参模式 · 6 秒
  | 'shot_video_10s_multi'         // 分镜视频提示词 · 多参模式 · 10 秒
  | 'shot_video_15s_multi'         // 分镜视频提示词 · 多参模式 · 15 秒
  | 'shot_video_20s_multi'         // 分镜视频提示词 · 多参模式 · 20 秒
  | 'shot_video_6s_firstframe'     // 分镜视频提示词 · 首帧延展模式 · 6 秒
  | 'shot_video_10s_firstframe'    // 分镜视频提示词 · 首帧延展模式 · 10 秒
  | 'shot_video_16s_firstframe'    // 分镜视频提示词 · 首帧延展模式 · 16 秒
  | 'shot_video_20s_firstframe'    // 分镜视频提示词 · 首帧延展模式 · 20 秒
  | 'grid_shot_prompt_generation'  // 九宫格分镜提示词生成（将单个分镜扩展为9个连续画面）
  | 'character_extraction'     // 角色提取
  | 'scene_extraction'         // 场景提取
  | 'prop_extraction'          // 道具提取
  | 'tweet_script_generation'  // 推文文案生成（剧本 → 整段连续推文旁白）
  | 'tweet_shot_breakdown'     // 推文文案分镜化（推文旁白 + 分镜列表 → 每分镜 1-3 句解说台词）
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

// Prompt 模板分类
//
// 用于在 PromptStudio UI 分组展示，以及给"用户新建自定义模板"提供受控选项。
// 每个分类都有明确的运行时职责：
//
// - global         全局约束：被 resolvePromptTemplate 自动注入到 TTI / ITV 模板，
//                  不会被业务代码直接 resolve；用户编辑这些模板可全站生效。
// - system         系统提示：作为 role:system 与对应业务模板配对调用（如 shot_prompt_system）。
// - script         剧本生成 / 润色：random / script / polish 类。
// - analysis       剧本/分镜结构化分析：shot_breakdown（输出 JSON 分镜列表）。
// - extraction     角色 / 场景 / 道具提取：从剧本提取实体清单。
// - tweet          推文文案：剧本→旁白脚本、旁白→分镜化解说。
// - inference-image  图片提示词推理：分镜图（含九宫格）的 image prompt 生成。
// - inference-video  视频提示词推理：分镜视频的 video prompt 生成
//                  （按时长 × multi-ref / first-frame 模式 5 模板）。
// - tti            文生图直拼：定妆照、场景图、道具图、分镜图、九宫格图等
//                  直接喂给 TTI 模型的提示词组装模板。
// - itv            图生视频直拼：分镜视频、角色/道具动态视频，直接喂 ITV 模型。
export type PromptTemplateCategory =
  | 'global'
  | 'system'
  | 'script'
  | 'analysis'
  | 'extraction'
  | 'tweet'
  | 'inference-image'
  | 'inference-video'
  | 'tti'
  | 'itv';

/** 分类元数据：UI 分组标题 + 简短描述（i18n 暂走中文，后续可改 key） */
export const PROMPT_CATEGORY_META: Record<PromptTemplateCategory, { label: string; description: string; order: number }> = {
  global:           { label: '全局约束',     description: '自动注入到 TTI / ITV 模板，编辑后全站生效',           order: 0 },
  system:           { label: '系统提示',     description: 'role:system 内容，配合业务模板调用',                  order: 1 },
  script:           { label: '剧本生成',     description: '随机生成 / 命题生成 / 润色',                          order: 2 },
  analysis:         { label: '剧本分析',     description: '分镜拆解等结构化分析（输出 JSON）',                   order: 3 },
  extraction:       { label: '实体提取',     description: '从剧本提取角色 / 场景 / 道具清单',                    order: 4 },
  tweet:            { label: '推文文案',     description: '剧本 → 旁白；旁白 → 分镜化解说',                      order: 5 },
  'inference-image':{ label: '图片提示词推理', description: '分镜静态画面提示词（含九宫格）',                    order: 6 },
  'inference-video':{ label: '视频提示词推理', description: '分镜视频提示词（按时长 × 多参 / 首帧 5 模板）',      order: 7 },
  tti:              { label: 'TTI 直拼',     description: '文生图模型的直接输入提示词（定妆 / 场景图等）',       order: 8 },
  itv:              { label: 'ITV 直拼',     description: '图生视频模型的直接输入提示词（分镜视频等）',          order: 9 },
};

// Prompt 模板接口
export interface PromptTemplate {
  id: PromptTemplateType;
  name: string;
  /** 分类，用于 PromptStudio 分组展示与用户新建自定义模板时选择 */
  category: PromptTemplateCategory;
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
    description: '当前镜头的总时长，用于视频提示词的时间片段规划。允许值随当前选择的视频渠道（{{durationConstraint}}）变化。',
    format: '秒数字符串',
    example: '10',
    required: true,
  },
  durationConstraint: {
    label: '时长约束描述',
    description: '运行时根据当前选择的 ITV 视频渠道生成的时长约束句（如"只能填写 6、12、16、20 之一" / "必须在 4–16 秒范围内"）。由调用方注入，无需在用户编辑模板时填写。',
    format: '自然语言短句',
    example: '只能填写 6、12、16、20 之一',
    required: false,
  },
  durationDefault: {
    label: '默认时长',
    description: '运行时根据当前 ITV 视频渠道给出的推荐默认时长（秒）。无法判断时使用。',
    format: '秒数字符串',
    example: '10',
    required: false,
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
  // ========== 全局约束注入变量（来自 global_* 模板，由 resolvePromptTemplate 自动注入） ==========
  globalPositivePrefix: {
    label: '全局前置正向（自动注入）',
    description: '从 global_positive_prefix 模板自动注入；模板中可在画面描述前追加该占位符。',
    format: '段落',
    required: false,
  },
  globalPositiveSuffix: {
    label: '全局后置正向（自动注入）',
    description: '从 global_positive_suffix 模板自动注入；适合放在画面描述末尾强化一致性。',
    format: '段落',
    required: false,
  },
  globalNegativeSuffix: {
    label: '全局后置负向（自动注入）',
    description: '从 global_negative_suffix 模板自动注入；适合放在 negative prompt 区域。',
    format: '段落',
    required: false,
  },
  globalVideoConstraints: {
    label: '全局视频规约（自动注入）',
    description: '从 global_video_constraints 模板自动注入；仅视频类提示词应使用。',
    format: '段落',
    required: false,
  },
  // ========== 推文文案变量 ==========
  tweetScript: {
    label: '推文旁白脚本',
    description: '剧集级整段连续推文旁白脚本，作为分镜级推文台词的切分输入。',
    format: '多段口语化短句文本',
    example: '深夜，他推开店门——纸钱被火苗吞噬，那一刻……他听见亡者的声音。',
    required: true,
  },
  shotsList: {
    label: '分镜列表',
    description: '本剧集的全部分镜清单，按顺序编号 + 剧本原文，用于把推文旁白切分到每个分镜。',
    format: '多行文本（每行一镜：编号 / scriptContent / 时长）',
    example: '#1 顾行蹲在后院焚烧纸钱，火光映亮脸侧 (6s)\n#2 火盆中纸灰飞起，他凑近倾听 (10s)',
    required: true,
  },
  plotSummary: {
    label: '故事情节摘要',
    description: '剧情主线摘要（关键事件 / 核心冲突 / 角色关系），辅助提取阶段补足上下文；无则可省略。',
    format: '自然语言短段落',
    example: '入殓师顾行在夜班整理遗物时听到亡者声音，与女主角合作追查死者生前未完成的执念。',
    required: false,
  },
  // ========== 视频推理上下文衔接变量（多参模式 + 首帧模式） ==========
  prevShot2Info: {
    label: '上 2 分镜信息（多参模式专用）',
    description: '相邻向前第 2 个分镜的剧情 + 已生成的视频提示词；不存在则填"无"',
    format: '多行文本',
    example: '剧情：顾行走到墓前停下\n已生成提示词：中景，顾行 @图片1 缓慢走至墓碑前 @图片3...',
    required: false,
  },
  prevShot1Info: {
    label: '上 1 分镜信息（多参模式专用）',
    description: '相邻向前第 1 个分镜的剧情 + 已生成的视频提示词；不存在则填"无"',
    format: '多行文本',
    example: '剧情：他蹲下点燃纸钱\n已生成提示词：近景，顾行 @图片1 蹲身将纸钱投入铁盆 @图片4...',
    required: false,
  },
  prevShotInfo: {
    label: '上 1 分镜信息（首帧模式专用）',
    description: '首帧模式专用：上一相邻分镜末帧需要继承的状态（人物站位 / 朝向 / 视线 / 持物 / 光影 / 背景）；不存在则填"无"',
    format: '多行文本',
    example: '人物在画面右侧侧身站立，左手握符纸，光从画面左前方斜入，背景是斑驳的红砖墙',
    required: false,
  },
  nextShotInfo: {
    label: '下 1 分镜信息',
    description: '相邻向后第 1 个分镜的剧情；尚未推理时不带提示词；不存在则填"无"',
    format: '多行文本',
    example: '剧情：纸钱燃尽，他凑近铁盆听到一声叹息',
    required: false,
  },
};

// 内建变量名集合：这些变量由 resolvePromptTemplate 内部从 global_* 模板自动注入，
// 模板里可以直接使用 {{globalXxx}} 占位符而无需在自身 variables 列表中声明
const INTRINSIC_GLOBAL_VARIABLE_NAMES = new Set([
  'globalPositivePrefix',
  'globalPositiveSuffix',
  'globalNegativeSuffix',
  'globalVideoConstraints',
]);

// 全局变量名 → 对应模板类型的映射（resolvePromptTemplate 据此拉取注入内容）
const GLOBAL_INJECTION_MAP: Record<string, PromptTemplateType> = {
  globalPositivePrefix: 'global_positive_prefix',
  globalPositiveSuffix: 'global_positive_suffix',
  globalNegativeSuffix: 'global_negative_suffix',
  globalVideoConstraints: 'global_video_constraints',
};

// 全局模板类型自身不参与注入（避免递归）
const GLOBAL_TEMPLATE_TYPES = new Set<PromptTemplateType>([
  'global_positive_prefix',
  'global_positive_suffix',
  'global_negative_suffix',
  'global_video_constraints',
]);

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
  // ========== 全局约束模板（自动注入到 TTI / ITV 模板） ==========

  global_positive_prefix: {
    id: 'global_positive_prefix',
    category: 'global',
    name: '全局前置正向约束',
    description: '通用一致性 + 高质量约束，会被 TTI/ITV 模板里的 {{globalPositivePrefix}} 占位符自动注入',
    template: `严格遵循当前输入提示词与参考图，不自由发挥，不新增文案外人物、场景、物件、动作、台词。保持人物身份一致、画风一致、构图稳定、比例真实、细节清晰、8k 高质量、sharp focus, high detail, clean composition, consistent style, accurate anatomy.`,
    variables: [],
    isCustom: false,
  },

  global_positive_suffix: {
    id: 'global_positive_suffix',
    category: 'global',
    name: '全局后置正向约束',
    description: '人物 / 场景稳定 + 视频首帧一致性约束，会被 {{globalPositiveSuffix}} 占位符自动注入',
    template: `优先保证人物稳定、站位稳定、朝向稳定、服装稳定、发型稳定、场景稳定、道具稳定。若为单图生视频任务，必须保持首帧一致性、镜头稳定、动作自然、避免人物乱跑、避免无依据运镜、避免无依据动作强化。无字幕，无中文文字，无水印，无 logo。`,
    variables: [],
    isCustom: false,
  },

  global_negative_suffix: {
    id: 'global_negative_suffix',
    category: 'global',
    name: '全局后置负向约束',
    description: '畸形 / drift / 字幕水印禁项，会被 {{globalNegativeSuffix}} 占位符自动注入；通常拼到 negative prompt 区域',
    template: `low quality, blurry, out of focus, worst quality, normal quality, lowres, jpeg artifacts, text, subtitle, watermark, logo, signature, username, extra people, extra character, duplicate person, wrong character, face drift, hairstyle drift, costume drift, accessory drift, prop drift, scene drift, bad anatomy, deformed body, malformed limbs, extra arms, extra legs, extra hands, extra fingers, missing fingers, fused fingers, broken hands, broken face, distorted eyes, cross-eyed, wrong proportions, bad perspective, cropped body, floating body, disconnected limbs, mutation, messy composition`,
    variables: [],
    isCustom: false,
  },

  global_video_constraints: {
    id: 'global_video_constraints',
    category: 'global',
    name: '全局视频规约',
    description: '视频生成专用规约（前 0.15 秒废帧、首帧一致性、动作约束等），会被视频类模板里的 {{globalVideoConstraints}} 占位符自动注入',
    template: `视频前 0.15 秒为废帧，严格遵循当前输入提示词与参考图，不自由发挥，不新增文案外人物、场景、物件、动作、台词。优先保证人物身份一致、站位稳定、朝向稳定、服装稳定、发型稳定、场景稳定、道具稳定、画风一致、比例真实、细节清晰。若为单图生视频任务，必须保持首帧一致性、镜头稳定、动作自然，禁止人物乱跑、禁止无依据运镜、禁止无依据大幅动作、禁止无依据景别变化。high detail, sharp focus, clean composition, consistent style, accurate anatomy. 无字幕，无中文文字，无水印，无 logo。`,
    variables: [],
    isCustom: false,
  },

  // ========== 系统提示模板 ==========

  shot_prompt_system: {
    id: 'shot_prompt_system',
    category: 'system',
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
    category: 'system',
    name: '分镜拆解系统提示',
    description: '分镜拆解时的系统角色定义',
    template: `你是一个专业的影视分镜师。你的任务是根据剧本内容，结合给定的角色、场景和道具，生成分镜结构。

每个分镜应该包含：
- scriptContent: 对应的剧本原文
- shotType: 景别（close-up特写/medium中景/wide全景/extreme-wide大全景）
- cameraMovement: 运镜方式（static固定/pan摇镜/zoom-in推镜/tracking跟随/handheld手持）
- duration: 预估时长（秒），{{durationConstraint}}，无法判断时填写 {{durationDefault}} 秒
- characters: 出现的角色名列表
- dialogue: 角色台词，格式为"角色名（情绪）：台词内容"
- emotion: 画面情绪氛围
- props: 出现的道具名列表

【情绪词列表】
高兴、愤怒、悲伤、恐惧、反感、低落、惊讶、自然、急切、平静、激动、呵斥、关心、严肃

【完整覆盖硬性规则】
1. 必须按剧本原文顺序从头到尾拆解，不能跳段、不能只挑“重要情节”、不能摘要式合并中间动作。
2. 每个原文句子/动作/环境变化/视线变化/停顿/台词都必须归入某一个 shot.scriptContent；没有画面变化但承接关系重要的句子也要保留在相邻分镜中。
3. shot.scriptContent 必须优先复制原文连续片段，允许带少量相邻上下文，但禁止改写成概括句；禁止把多个相距较远的原文段落揉成一个摘要。
4. 当同一段里出现“新动作 / 新视线目标 / 新道具状态 / 新场景空间 / 新说话人 / 情绪转折 / 时间推进”时，应优先拆成新的分镜，不要为了减少数量而合并。
5. 如果剧本文本很长，也必须继续输出完整 shots 数组直到覆盖末尾；宁可分镜多，也不要丢失细节。
6. 输出前自检：把所有 shot.scriptContent 连起来，应能覆盖原剧本的主干顺序；若发现遗漏，必须补齐后再返回。

注意：不需要生成画面描述(description)提示词，这将在后续步骤生成。`,
    variables: [variable('durationConstraint'), variable('durationDefault')],
    isCustom: false,
  },

  script_analysis_system: {
    id: 'script_analysis_system',
    category: 'system',
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
    category: 'script',
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
    category: 'script',
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
    category: 'script',
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
    category: 'analysis',
    name: '分镜拆解',
    description: '将剧本拆解为分镜结构（不含提示词）',
    template: `你是一位专业的分镜师。请将以下剧本拆解为分镜列表。

【时长要求】
每个镜头的 duration {{durationConstraint}}；无法判断时填写 {{durationDefault}}。

【情绪词列表】
高兴、愤怒、悲伤、恐惧、反感、低落、惊讶、自然、急切、平静、激动、呵斥、关心、严肃

已知角色：{{characters}}
已知场景：{{scenes}}
已知道具：{{props}}

【重要】characters、scenes、props 字段必须使用上方"已知角色/场景/道具"列表中的原始名称，不要自行编造或修改名称。如果剧本中出现了不在列表中的角色/场景/道具，则不填入对应字段。

剧本：
{{script}}

【拆解原则】
1. 必须按剧本原文顺序从头到尾覆盖，不得跳过中间段落，不得只抽取“大事件”。
2. 每个原文句子/动作/环境变化/视线变化/停顿/台词都必须归入某个分镜的 scriptContent；不要把细节当成可省略的摘要素材。
3. scriptContent 必须优先复制原文连续片段，禁止改写成概括句；禁止把相距较远的原文段落揉成一个镜头。
4. 出现新动作、新视线目标、新道具状态、新空间、新说话人、情绪转折或时间推进时，优先拆成新分镜；宁可多分镜，也不要丢细节。
5. 输出前自检：所有 shot.scriptContent 按顺序拼接后，应覆盖原剧本主干直到末尾。

请以 JSON 格式输出分镜列表：

\`\`\`json
{
  "shots": [
    {
      "scriptContent": "对应的剧本原文片段",
      "shotType": "close-up/medium/wide/extreme-wide",
      "cameraMovement": "static/pan/zoom-in/tracking/handheld",
      "duration": 10,
      "dialogue": "角色名（情绪）：“台词内容”",
      "characters": ["已知角色名称"],
      "emotion": "情绪标签",
      "props": ["已知道具名称"],
      "scenes": ["已知场景名称"]
    }
  ]
}
\`\`\`
`,
    variables: [
      variable('script'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('durationConstraint'),
      variable('durationDefault'),
    ],
    isCustom: false,
  },

  shot_image_prompt_generation: {
    id: 'shot_image_prompt_generation',
    category: 'inference-image',
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

  // ========== 视频推理 · 多参模式（含 @角色/@场景/@道具 映射，依赖映射基准库） ==========

  shot_video_6s_multi: {
    id: 'shot_video_6s_multi',
    category: 'inference-video',
    name: '视频推理 · 多参 · 6 秒',
    description: '多参照模式 6 秒分镜：含 @角色/@场景/@道具 映射；上下文衔接段使用 prevShot2Info / prevShot1Info / nextShotInfo',
    template: VIDEO_REASONING_TEMPLATE_CONTENT.shot_video_6s_multi,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('prevShot2Info', { required: false }),
      variable('prevShot1Info', { required: false }),
      variable('nextShotInfo', { required: false }),
    ],
    isCustom: false,
  },

  shot_video_10s_multi: {
    id: 'shot_video_10s_multi',
    category: 'inference-video',
    name: '视频推理 · 多参 · 10 秒',
    description: '多参照模式 10 秒分镜：含 @角色/@场景/@道具 映射；上下文衔接段使用 prevShot2Info / prevShot1Info / nextShotInfo',
    template: VIDEO_REASONING_TEMPLATE_CONTENT.shot_video_10s_multi,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('prevShot2Info', { required: false }),
      variable('prevShot1Info', { required: false }),
      variable('nextShotInfo', { required: false }),
    ],
    isCustom: false,
  },

  shot_video_15s_multi: {
    id: 'shot_video_15s_multi',
    category: 'inference-video',
    name: '视频推理 · 多参 · 15 秒',
    description: '多参照模式 15 秒分镜：含 @角色/@场景/@道具 映射；上下文衔接段使用 prevShot2Info / prevShot1Info / nextShotInfo',
    template: VIDEO_REASONING_TEMPLATE_CONTENT.shot_video_15s_multi,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('prevShot2Info', { required: false }),
      variable('prevShot1Info', { required: false }),
      variable('nextShotInfo', { required: false }),
    ],
    isCustom: false,
  },

  shot_video_20s_multi: {
    id: 'shot_video_20s_multi',
    category: 'inference-video',
    name: '视频推理 · 多参 · 20 秒',
    description: '多参照模式 20 秒分镜：含 @角色/@场景/@道具 映射；上下文衔接段使用 prevShot2Info / prevShot1Info / nextShotInfo',
    template: VIDEO_REASONING_TEMPLATE_CONTENT.shot_video_20s_multi,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('props'),
      variable('prevShot2Info', { required: false }),
      variable('prevShot1Info', { required: false }),
      variable('nextShotInfo', { required: false }),
    ],
    isCustom: false,
  },

  // ========== 视频推理 · 首帧延展模式（以单图为锚做微动延展，不带 @ 映射） ==========

  shot_video_6s_firstframe: {
    id: 'shot_video_6s_firstframe',
    category: 'inference-video',
    name: '视频推理 · 首帧 · 6 秒',
    description: '首帧延展模式 6 秒分镜：以单图为锚做微动延展；上下文衔接使用紧跨度的 prevShotInfo / nextShotInfo',
    template: VIDEO_REASONING_TEMPLATE_CONTENT.shot_video_6s_firstframe,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('prevShotInfo', { required: false }),
      variable('nextShotInfo', { required: false }),
    ],
    isCustom: false,
  },

  shot_video_10s_firstframe: {
    id: 'shot_video_10s_firstframe',
    category: 'inference-video',
    name: '视频推理 · 首帧 · 10 秒',
    description: '首帧延展模式 10 秒分镜：以单图为锚做微动延展；上下文衔接使用紧跨度的 prevShotInfo / nextShotInfo',
    template: VIDEO_REASONING_TEMPLATE_CONTENT.shot_video_10s_firstframe,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('prevShotInfo', { required: false }),
      variable('nextShotInfo', { required: false }),
    ],
    isCustom: false,
  },

  shot_video_16s_firstframe: {
    id: 'shot_video_16s_firstframe',
    category: 'inference-video',
    name: '视频推理 · 首帧 · 16 秒',
    description: '首帧延展模式 16 秒分镜：以单图为锚做微动延展；上下文衔接使用紧跨度的 prevShotInfo / nextShotInfo',
    template: VIDEO_REASONING_TEMPLATE_CONTENT.shot_video_16s_firstframe,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('prevShotInfo', { required: false }),
      variable('nextShotInfo', { required: false }),
    ],
    isCustom: false,
  },

  shot_video_20s_firstframe: {
    id: 'shot_video_20s_firstframe',
    category: 'inference-video',
    name: '视频推理 · 首帧 · 20 秒',
    description: '首帧延展模式 20 秒分镜：以单图为锚做微动延展；上下文衔接使用紧跨度的 prevShotInfo / nextShotInfo',
    template: VIDEO_REASONING_TEMPLATE_CONTENT.shot_video_20s_firstframe,
    variables: [
      variable('scriptContent'),
      variable('characters'),
      variable('scenes'),
      variable('prevShotInfo', { required: false }),
      variable('nextShotInfo', { required: false }),
    ],
    isCustom: false,
  },

  grid_shot_prompt_generation: {
    id: 'grid_shot_prompt_generation',
    category: 'inference-image',
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
    category: 'extraction',
    name: '角色提取',
    description: '从剧本中提取所有可单独识别的人物（含"我"），输出结构化资料用于后续 AI 文生图与角色基准库',
    template: `请根据提供的小说原文、推文文案、故事情节，提取文中出现过的所有"可单独识别的人物"，包括"我"，输出结构化资料用于后续 AI 文生图与角色基准库。

【输入数据】
小说原文：
{{script}}

推文文案（已精炼的整集解说旁白；可补足剧情主线信息；无则视作空）：
{{tweetScript}}

故事情节（剧情主线摘要；无则视作空）：
{{plotSummary}}

项目视觉风格定向（视觉风格关键词；用于在原文未明说时做合理可视化补全的风格收敛，不影响客观事实；无则忽略）：
{{stylePrefix}}

【字段要求】每个人物必须输出以下字段：
1. "name"：人物标准名（最稳定、最适合作为主名称的称呼）
2. "aliases"：人物全部代称，多个代称用英文逗号分隔；不得重复 name 本身；aliases 内部不得重复；如果没有代称，填空字符串 ""
3. "age"：年龄
   - 必须依据剧本线索（职业、身份、社会角色、对白语气、家庭关系、场景、年代背景）尽量给出具体年龄或区间
   - 可写形式示例："28岁"、"约30岁"、"40岁出头"、"10岁左右的少年"、"60岁以上的老人"
   - 仅当剧本完全没有任何线索可推断时才允许填"未知"，正常情况下禁止使用"未知"
4. "gender"：只能填写 "male"、"female"、"neutral"、"unknown"；性别无法 100% 确认时根据上下文选最合理的可视化性别，不要写 "unknown" 兜底
5. "role"：只能填写 "protagonist"、"antagonist"、"supporting"
6. "appearance"：纯客观可见外观，作为文生图的核心提示词；总长度 ≥ 60 字
   - **必须显式包含以下七要素**（缺一不可）：年龄段、性别、发色、发型、眼睛颜色、上身服装、下身服装
   - 在七要素之外还要尽量覆盖：脸部细节（脸型、眉型、眼型、鼻型、嘴唇、肤色）、体态（身高感、身材、姿势）、鞋履与配饰（眼镜、首饰、围巾、手套、武器/法器造型，均带材质）、衣物外可见的特征痕迹（疤痕、纹身、胎记）
   - 服装必须给出【颜色】+【款式】+【材质】三维（如：深灰色羊毛长风衣 / 白色棉质立领衬衫 / 蓝色牛仔修身长裤）
7. "description"：≤ 20 字的极简身份 / 职业标签，仅用于 LLM 上下文识别，禁止任何剧情、性格、心理、过往经历

【硬性规则】违反任一项都视为不合格：
1. **必须包含"我"这个人物**。即使原文未明确"我"的外貌，也要结合上下文给出最合理、最保守的可视化补全（性别、年龄段、身份气质都要落到画面元素上）。
2. 必须合并同一人物的不同叫法、代称、身份称呼到同一条记录里，不要重复输出同一个人物；多个名字时 name 选最核心、最稳定的，其余全部进 aliases。
3. 只提取"可单独识别的人物"。禁止输出泛指群体：众人 / 同学们 / 路人 / 村民们 / 所有人 等。
4. 若人物没有明确姓名但在文中可单独识别，使用文中最稳定的称呼作为 name（如：班主任、老板娘、司机、邻居阿姨）。
5. **每个人物的穿着必须尽量不重复**。原文未明确服装时，在不违背人物身份、时代、阶层、剧情氛围的前提下做合理且保守的差异化补全，确保不同人物在画面中可一眼区分。
6. 若提供了"项目视觉风格定向"，对原文未明说的视觉细节做补全时风格要向其收敛；但不得改变原文已明确的外观事实。

【appearance 红线规则】
1. 只描述视觉可见的客观特征。禁止性格、情绪、气质、命运、心理、思想等抽象词。
2. 服装材质禁止"职业套装"、"日常服"、"休闲装"等模糊词，必须给出具体材质（棉布 / 呢料 / 皮革 / 亚麻 / 丝绸 / 牛仔 / 工装布 / 针织 / 化纤 等）。
3. 禁止描述被衣物遮挡的身体特征（如胸口胎记、腰背纹身、内衣、私处），只写衣物外可见的痕迹。
4. 禁止"好看的 / 普通的 / 帅气的 / 美丽的 / 清秀的"等主观或模糊词汇。
5. 禁止职业 / 身份 / 社会关系叙述（如店主、老板、养父）；这些写到 description 字段。
6. 禁止超自然能力设定（如能看见鬼魂、通灵、被诅咒）。
7. 禁止经历背景事件（如火场被救、全家遇难、身世成谜）。
8. 必须使用中文描述；任何无法在画面中直接看到的内容一律剔除。
9. appearance 写法风格统一，建议结构："一个……岁左右的……人，……发色……发型，……眼睛，穿着……上装，下身穿……"

【输出要求】
- 只输出 JSON，可包裹在 \`\`\`json 代码块中；禁止输出任何解释、前言、备注、Markdown 标题。
- JSON 必须严格遵循下方示例的结构（顶层对象包含 \`characters\` 数组）。
- 不得出现重复人物、不得漏掉"我"、不得缺字段、不得输出无效 JSON。

\`\`\`json
{
  "characters": [
    {
      "name": "顾行",
      "aliases": "阿行,顾先生",
      "age": "28岁",
      "gender": "male",
      "role": "protagonist",
      "appearance": "一个28岁左右的年轻男人，黑色微卷短发，深棕色丹凤眼，窄长脸，挺直鼻梁，薄唇，小麦色肤；中等偏高瘦削身形，肩背挺拔；上身穿深灰色羊毛长风衣搭白色棉质立领衬衫，下身穿黑色斜纹布修身长裤，脚踩黑色牛皮短靴，左手腕戴一只银色金属机械表，左眉尾有一道浅淡旧疤。",
      "description": "年轻调查员"
    },
    {
      "name": "我",
      "aliases": "自己",
      "age": "20岁左右",
      "gender": "female",
      "role": "supporting",
      "appearance": "一个20岁左右的年轻女人，深棕色长发扎成低马尾，黑色眼睛，圆脸柔和五官，浅肤色；中等偏瘦体型；上身穿浅杏色棉质连帽外套搭白色针织内搭，下身穿蓝色牛仔修身长裤，脚踩白色帆布鞋。",
      "description": "第一人称叙述者"
    }
  ]
}
\`\`\`
`,
    variables: [
      variable('script'),
      variable('tweetScript', { required: false }),
      variable('plotSummary', { required: false }),
      variable('stylePrefix', { required: false }),
    ],
    isCustom: false,
  },

  scene_extraction: {
    id: 'scene_extraction',
    category: 'extraction',
    name: '场景提取',
    description: '从剧本中提取所有"主要场景"，输出结构化资料用于后续 AI 文生图与场景基准库',
    template: `请根据提供的小说原文、推文文案、故事情节，提取文中出现过的所有"主要场景"。

【输入数据】
小说原文：
{{script}}

推文文案（已精炼的整集解说旁白；可补足剧情主线信息；无则视作空）：
{{tweetScript}}

故事情节（剧情主线摘要；无则视作空）：
{{plotSummary}}

项目视觉风格定向（视觉风格关键词；用于在原文未明说时做合理可视化补全的风格收敛，不影响客观事实；无则忽略）：
{{stylePrefix}}

【字段要求】每个场景必须输出以下字段：
1. "name"：场景标准名称
   - 必须 ≥ 4 个字，且尽量清晰、稳定、适合后续做参考图命名
   - 例：学校校园外景 / 家中客厅内部 / 医院病房内部 / 废弃工厂仓库内部
2. "aliases"：场景全部代称，多个代称用英文逗号分隔；不得重复 name 本身；如果没有代称，填空字符串 ""
3. "description"：场景详细可视化描述（中文），按下面"description 写法规范"组织
4. "time"：可见时间状态，仅可为 "day" / "night" / "twilight"
5. "weather"：天气短语（如 晴 / 阴 / 小雨 / 暴雨 / 大雪 / 雾 等）；若不可判定填 ""
6. "mood"：可见氛围短语（落到光线 / 色调 / 空间状态 / 天气特征上的可见线索，禁止抽象评价词）
7. "keyElements"：场景内具有辨识度的可视化元素列表（字符串数组），3–6 项

【硬性规则】违反任一项都视为不合格：
1. 必须合并同一场景的不同叫法、别称、简称到同一条记录；不得重复输出同一个场景。
2. 只提取"主要场景"：对剧情推进有作用、被明确提及、可单独形成视觉画面。不要输出一闪而过、无法独立成景的泛化地点。
3. 同一地点在不同时间段或使用状态下本质仍是同一场景的，优先合并为一个场景。
4. 同一建筑内若有多个明显独立空间且能在剧情中单独成镜（客厅 / 卧室 / 病房 / 走廊），允许分别输出。
5. 若提供了"项目视觉风格定向"，对原文未明说的视觉细节做补全时风格要向其收敛；但不得改变原文已明确的空间事实。

【description 写法规范】
1. description 必须是完整自然语言句子，并尽量包含以下可视化信息：
   - 环境类型（室内 / 室外 / 场所属性）
   - 时间（白天 / 黄昏 / 夜晚 / 凌晨）
   - 氛围（落到可见光线、色调、天气特征上）
   - 空间结构（前景 / 中景 / 后景关系，房间布局，开口与通道）
   - 主要陈设
   - 主要材质
   - 光线特征（光源方向、强度、色温）
   - 可识别细节（招牌 / 标志 / 划痕 / 痕迹等可作为镜头记忆点的元素）
2. 必须以"场景可视化描述"为主，方便后续直接用于场景设定或生图参考。
3. **绝对禁止**出现以下任一项：
   - 人物姓名 / 人物代称 / 我 / 他 / 她 / 他们
   - 人物动作 / 人物情绪 / 对话内容
   - 抽象评价词（"很阴森"、"很豪华"、"很破旧"），必须落到具体画面元素上
4. 原文未把场景描写得很完整时，结合剧情语境、场景用途、时代背景、生活常识做合理保守的可视化补全；不得补出超出剧情常识的夸张设定。
5. 写法风格统一，优先采用"空间结构 + 地面 / 墙面 / 陈设 + 光线 / 氛围 + 可识别细节"的方式描述。

【室内场景特殊要求 — 为后续场景图透视全貌取景预留素材】
后续场景参考图会以"强透视 + 全貌取景"方式渲染，让下游视频模型不需要凭空想象未入画的部分。
因此对所有 description 中能判定为**室内**的场景，必须显式写明以下要素：
   a. 至少两面相邻墙体的位置与材质（如"左侧水泥墙、正面贴白色瓷砖的承重墙"）
   b. 地面材质与图案（如"灰色水磨石地面，带浅色拼缝"）
   c. 天花板状态（吊顶 / 露梁 / 裸顶管线 / 高度感）
   d. 全部主要开口的相对位置：门 / 窗 / 拱门 / 走廊入口（如"正面墙居中有一扇木门，右侧墙开两扇窄窗"）
   e. 房间整体布局轮廓（开间形状、深度方向、家具分布的相对位置）
若原文未明说，按场景用途与时代背景做合理保守补全；不得为了缩短描述而省略墙体 / 地面 / 天花板 / 开口任一项。
室外场景不强制以上 a–e 项，但仍需写清地面、主要建筑立面、纵深方向上的可见物，便于建立透视纵深。

【输出要求】
- 只输出 JSON，可包裹在 \`\`\`json 代码块中；禁止输出任何解释、前言、备注、Markdown 标题。
- JSON 必须严格遵循下方示例的结构（顶层对象包含 \`scenes\` 数组）。
- 不得出现重复场景、不得缺字段、不得输出无效 JSON。

\`\`\`json
{
  "scenes": [
    {
      "name": "学校校园外景",
      "aliases": "校园,教学楼",
      "description": "一处带有教学楼和操场的校园外部空间，时间为白天，整体氛围开阔而日常。主楼是红砖结构的教学楼，前方连接着宽阔的水泥地和塑胶跑道，操场边缘种着成排树木，地面开阔，视野完整，具有明显的校园公共区域特征。",
      "time": "day",
      "weather": "晴",
      "mood": "开阔、日常、自然光均匀",
      "keyElements": ["红砖教学楼", "塑胶跑道", "成排树木", "水泥广场"]
    },
    {
      "name": "家中客厅内部",
      "aliases": "家里,客厅",
      "description": "一间长方形的普通住宅客厅内部，时间偏傍晚，氛围安静而生活化。开间略呈横向，深度方向通向居室内侧。左侧为整面浅米色乳胶漆墙，墙上挂一幅小尺寸装饰画；正面墙体为浅灰色乳胶漆，墙面居中摆一台低矮的胡桃木电视柜，右上方开一扇方形落地窗，窗外可见暖色傍晚天光；右侧墙体为同色乳胶漆，靠墙位置设一组米色布艺三人沙发，沙发后通向走廊的拱形门洞位于右后角。地面铺设浅栎木色实木地板，带细密拼缝。顶部为简洁白色平吊顶，中央嵌一盏圆形吸顶暖光灯，灯光向四周扩散在墙面留下柔和过渡。中央区域摆放低矮深木色茶几，茶几与沙发、电视柜共同构成紧凑的居家生活动线。",
      "time": "twilight",
      "weather": "",
      "mood": "暖色调灯光、安静、居家",
      "keyElements": ["浅栎木地板", "米色布艺沙发", "胡桃木电视柜", "白色平吊顶圆形吸顶灯", "正面墙落地窗", "右后角拱形门洞"]
    }
  ]
}
\`\`\`
`,
    variables: [
      variable('script'),
      variable('tweetScript', { required: false }),
      variable('plotSummary', { required: false }),
      variable('stylePrefix', { required: false }),
    ],
    isCustom: false,
  },

  prop_extraction: {
    id: 'prop_extraction',
    category: 'extraction',
    name: '道具提取',
    description: '从剧本中提取所有"主要道具"，输出结构化资料用于后续 AI 文生图与道具基准库',
    template: `请根据提供的小说原文、推文文案、故事情节，提取文中出现过的所有"主要道具"。

【输入数据】
小说原文：
{{script}}

推文文案（已精炼的整集解说旁白；可补足剧情主线信息；无则视作空）：
{{tweetScript}}

故事情节（剧情主线摘要；无则视作空）：
{{plotSummary}}

项目视觉风格定向（视觉风格关键词；用于在原文未明说时做合理可视化补全的风格收敛，不影响客观事实；无则忽略）：
{{stylePrefix}}

【字段要求】每个道具必须输出以下字段：
1. "name"：道具标准名称，2 个字以上，清晰、稳定、适合后续做参考图命名（如：银色机械怀表 / 黑色长柄雨伞 / 桐木骨灰盒 / 旧式翻盖手机 / 朱砂符纸）
2. "aliases"：道具全部代称，多个代称用英文逗号分隔；不得重复 name 本身；如果没有代称，填空字符串 ""
3. "description"：道具详细可视化描述（中文），按下面"description 写法规范"组织
4. "importance"：道具在剧情中的重要性，仅可为 "high" / "medium" / "low"
   - high：贯穿主线、决定结局、反复出现的关键信物 / 武器 / 证物
   - medium：在 1–2 个核心情节点起作用的道具
   - low：场景中出现但仅做点缀、辅助说明的道具
5. "scenes"：该道具出现过的场景标准名列表（字符串数组，应与场景提取的 name 字段对齐）；若无法确定填空数组 []

【提取范围 — 主要道具】满足下列任一条件即纳入：
- 会与角色发生交互（被拿起、使用、交换、佩戴、丢弃、藏匿）
- 推动剧情发展（信物、关键证物、线索、武器、法宝、钥匙、信件、手机、契约、药剂等）
- 反复出现且具有可识别外观的可移动物

【严禁提取】下列类别归属场景或角色描述，不进入 props：
- 环境陈设：沙发、椅子、床、柜子、桌子、灯具、门、窗、墙壁、地板、天花板、管道、固定设施、建筑结构
- 角色服装与造型组成部分：上衣、裤子、鞋、围巾、首饰、发饰、帽子、眼镜（**例外：剧情明确把它作为关键信物使用时可保留为道具**）
- 宠物 / 随身生物 / 灵兽（属角色范畴）
- 食物 / 饮料一闪而过的消耗品（除非剧情围绕它展开）
- 一闪而过、无法独立成镜的泛化物体

【硬性规则】违反任一项都视为不合格：
1. 必须合并同一道具的不同叫法、别称、简称到同一条记录；不得重复输出同一个道具。
2. 同一道具在不同章节有外观变化（如崭新 → 烧毁），优先合并为一个道具，并在 description 里点出最具辨识度的稳定外观；不要拆成多个重复道具。
3. 同一类别下若有多件外观差异明显的同类物（如两把不同的剑、两封不同的信），允许分别输出，但必须给出独立 name 和差异化 description。
4. 若提供了"项目视觉风格定向"，对原文未明说的视觉细节做补全时风格要向其收敛；但不得改变原文已明确的客观外观。
5. \`scenes\` 数组中的场景名应使用与场景提取一致的标准名；若该道具未在任何已明确的场景中出现，填 []。

【description 写法规范】
1. description 必须是完整自然语言句子，并按以下结构尽量包含可视化信息：
   - 形状
   - 主要材质
   - 结构特征（开合方式、组成部件、连接关系）
   - 主要颜色
   - 表面纹理 / 磨损 / 污渍
   - 尺寸感（手掌大小 / 半人高 / 可单手握持 等相对尺度）
   - 可识别细节（刻字、图案、瑕疵、标签）
2. 必须以"道具可视化描述"为主，方便后续直接用于道具设定或生图参考。
3. **绝对禁止**出现以下任一项：
   - 人物姓名 / 人物代称 / 我 / 他 / 她 / 他们
   - 人物动作（"被某人拿在手中"、"挥舞"等）/ 人物情绪 / 对话内容
   - 道具在剧情中的象征意义 / 推动了什么事件
4. 原文未把道具描写得很完整时，结合道具用途、时代背景、剧情语境、生活常识做合理保守的可视化补全；不得补出超出剧情常识的夸张设定。
5. 写法风格统一，优先采用"形状 + 材质 + 结构 + 颜色 + 表面细节 + 尺寸感"的方式描述。

【输出要求】
- 只输出 JSON，可包裹在 \`\`\`json 代码块中；禁止输出任何解释、前言、备注、Markdown 标题。
- JSON 必须严格遵循下方示例的结构（顶层对象包含 \`props\` 数组）。
- 不得出现重复道具、不得缺字段、不得输出无效 JSON。

\`\`\`json
{
  "props": [
    {
      "name": "银色机械怀表",
      "aliases": "怀表,旧表",
      "description": "一只可单手握持的圆形机械怀表，外壳为做旧抛光的银色金属，正面有可向上翻开的弧形表盖，盖面刻有细密的几何花纹，连接一根短链；表盘为奶白色，黑色罗马字标，时分针为深蓝色，玻璃表面有一道斜向的细微划痕。",
      "importance": "high",
      "scenes": ["殡葬用品店后院", "家中客厅内部"]
    },
    {
      "name": "桐木骨灰盒",
      "aliases": "骨灰盒,木盒",
      "description": "一只双手可端起的长方形桐木盒，整体为浅黄褐色木质纹理，表面打磨平整带有暗淡哑光质感，盒盖与盒身通过两枚黄铜小锁扣闭合，前侧贴有一张泛黄的白色长条纸标签，四角带有轻微磕碰留下的浅色擦痕。",
      "importance": "medium",
      "scenes": ["殡葬用品店后院"]
    }
  ]
}
\`\`\`
`,
    variables: [
      variable('script'),
      variable('tweetScript', { required: false }),
      variable('plotSummary', { required: false }),
      variable('stylePrefix', { required: false }),
    ],
    isCustom: false,
  },

  tweet_script_generation: {
    id: 'tweet_script_generation',
    category: 'tweet',
    name: '推文文案生成（剧本级）',
    description: '把整集剧本提炼为连续推文旁白脚本，用于解说配音/字幕；删水文、抓爽点、口语化、首句钩子。',
    template: `你是一名顶级的小说推文 / 漫剧解说编剧。请把下面这一集的剧本，改写成一段适合直接做配音解说的【连续推文文案旁白】。

【输入剧本】
{{script}}

【硬性要求】
1. 输出必须是一段连续的、可以直接拿去做 TTS 配音的中文旁白脚本，按"句号 / 问号 / 感叹号 / 省略号"自然分句；不要使用 Markdown 标题、序号、人名标签或场景标签。
2. 每句长度控制在 8–22 字，整体节奏紧凑、口语化、有画面感；按 1.3–1.5 倍语速朗读时，每句约 2–4 秒。
3. 删除原文里的环境铺垫、人物心理慢镜头、与主线无关的"水文"，只保留：
   - 推动剧情的核心动作
   - 决定性的台词转折
   - 强情绪点（爽 / 虐 / 反转 / 悬念）
4. **首句必须是强钩子**：用一个反差、悬念或冲突瞬间把人钩住，类似"卧槽"瞬间，禁止用平铺直叙的环境句开头。
5. 全程使用第三人称解说视角，不要直接朗读角色对话；如果一定要带台词，必须用"他/她说："+ 极短台词的形式融进旁白。
6. 节奏要有张弛，关键转折前可用省略号或短句制造停顿；禁止连续使用相同句式。
7. 严禁出现"接下来"、"然后我们看到"、"画面切换到"这类元解说语言；旁白要像在讲故事，不是在描述画面。
8. 结尾必须留悬念或情绪冲击，不要把这集的所有结果一次说尽。

【风格参照】
- 强情感词谨慎使用："爽 / 紧张 / 高能 / 离谱 / 反转"等，仅在转折点出现，不堆叠
- 禁止任何形式的标签前缀（"【高能】"、"#爽点 #反转"）
- 输出整体长度建议在 200–600 字，按 6–25 句切分

【输出格式】
直接输出一段纯文本旁白，每句一行（用换行分隔）。不要包裹代码块，不要解释，不要列出大纲。
`,
    variables: [variable('script')],
    isCustom: false,
  },

  tweet_shot_breakdown: {
    id: 'tweet_shot_breakdown',
    category: 'tweet',
    name: '推文文案分镜化',
    description: '把整集推文旁白按分镜切分，输出每个分镜对应的 1-3 句解说台词。',
    template: `你是一名小说推文 / 漫剧的剪辑助理。下面给你一段已经写好的【整集推文旁白】和【这一集的分镜清单】。请把旁白按时间顺序切分到每个分镜，每个分镜得到 1–3 句最贴合该分镜画面与情绪的解说台词。

【整集推文旁白】
{{tweetScript}}

【分镜清单】
{{shotsList}}

【硬性要求】
1. 严格按分镜顺序输出，分镜数量必须与输入清单一致，不许遗漏、不许并合、不许多输出。
2. 每个分镜分配 1–3 句旁白；每句仍保持 8–22 字、口语化、有画面感。
3. 切分依据：以分镜的 \`scriptContent\` 表达的核心动作 / 情绪 / 转折为锚，把旁白里和这一镜最贴合的句子分给它。允许对原旁白做轻微改写（同义改写、断句、合并），但不得引入旁白原文里没有的剧情、人物、动作、台词。
4. **节奏匹配时长**：分镜时长（duration 秒）越短，分配的句数越少；6 秒分镜原则上 1 句，10 秒分镜 1–2 句，15 秒及以上分镜 2–3 句。按每秒约 4–5 字、语速 1.3–1.5 倍折算总字数上限。
5. 整集首尾衔接顺畅：第一个分镜的旁白要承接整集开场钩子；最后一个分镜的旁白要保留悬念 / 情绪冲击。
6. 严禁解说类元语言（"接下来"、"画面切换到"等），保持纯讲故事旁白。
7. 不要在输出里复述剧本原文或分镜清单；只输出每个分镜对应的旁白文本。

【输出格式】
严格按下面的 JSON 数组格式输出，可包裹在 \`\`\`json 代码块中；除 JSON 本体外不输出任何解释、备注、前缀。

\`\`\`json
[
  { "shotIndex": 1, "tweetCopy": "深夜，他推开店门。" },
  { "shotIndex": 2, "tweetCopy": "纸钱燃起，他凑近倾听……" }
]
\`\`\`

字段定义：
- \`shotIndex\`：分镜清单里的编号（从 1 开始），与输入顺序严格对应
- \`tweetCopy\`：分给该分镜的旁白文本，多句之间用一个空格连接成一行
`,
    variables: [variable('tweetScript'), variable('shotsList')],
    isCustom: false,
  },

  // ========== TTI 图片生成模板 ==========

  tti_character_costume: {
    id: 'tti_character_costume',
    category: 'tti',
    name: '角色定妆照（三视图）',
    description: '生成角色三视图定妆照',
    // 把人物 demographic + appearance 前置，让 TTI 模型先锁定主体身份与可见特征，
    // 再施加技术约束（三视图布局、纯色背景、配光、跨视图一致性）。
    template: '{{stylePrefix}}, character turnaround sheet of a {{demographic}}, {{appearance}}, full body standing reference, neutral A-pose, three poses in one image: front view | three-quarter side view | back view, identical character identity / face / hair / skin / clothing / accessories repeated across all three views, plain pure white seamless background, soft even studio lighting, no cast shadows on background, clear silhouette, all clothing layers visible, objective visible appearance only, no props, no environment, no narrative, no text, no extra characters',
    variables: [
      variable('stylePrefix'),
      variable('demographic', {
        description: '角色 gender + age 合成的英文人物短语，例如 "young adult male, 28 years old"；buildCharacterCostumeTemplateVariables 自动生成。',
      }),
      variable('appearance', {
        description: '角色当前用于生图的客观外观描述（脸/发/体态/服装/配饰/可见痕迹），只允许画面可见信息。',
      }),
      variable('gender', {
        description: '兼容字段：原 gender 短语，已被 demographic 取代；保留给历史自定义模板。',
        required: false,
      }),
      variable('age', {
        description: '兼容字段：原 age 短语，已被 demographic 取代；保留给历史自定义模板。',
        required: false,
      }),
    ],
    isCustom: false,
  },

  tti_scene_preview: {
    id: 'tti_scene_preview',
    category: 'tti',
    name: '场景预览图',
    description: '生成场景参考图：强透视全貌取景；室内必须显式露出至少两面墙 + 地面 + 天花板，让下游视频模型不需要凭空想象未拍到的空间。',
    // 设计目标：把场景图当作"空间锚定"参考图给后续 ITV 视频模型用。
    // - 透视技法（perspective drawing technique）需要被显式声明，避免出现没有纵深、像贴图一样的平面图。
    // - 室内必须给出全貌：corner vantage / two-point perspective + wide-angle 让两面墙 + 地面 + 天花板都进画面，
    //   连同所有门 / 窗 / 通道；任何被裁切的墙都会让视频模型在生视频时自由发挥，造成空间漂移。
    // - 外景给出 full establishing shot + 强透视线，建立纵深和清晰的可视边界。
    template: '{{stylePrefix}}, environment concept art reference plate, no people, no character, no character action, full establishing shot, wide-angle lens, strong perspective drawing technique with clearly visible perspective lines (orthogonal lines / vanishing points), complete spatial layout fully revealed in frame, objective environmental details only, {{description}}, location: {{location}}, visible time cues: {{time}}, visible atmosphere cues: {{mood}}, for INTERIOR locations: corner vantage using two-point perspective from a slightly raised eye-level, at least two full adjacent walls visible together with the floor and the ceiling, all major openings (doors, windows, archways, corridors) included in frame, room footprint fully readable, no cropped walls, no missing ceiling, no missing floor; for EXTERIOR locations: wide establishing view with one-point or two-point perspective revealing the full ground plane, key façades and the surrounding spatial extent; sharp depth cues (foreground / midground / background), architectural and material details, accurate proportions, no off-screen guesswork, cinematic composition, 4k high detail',
    variables: [
      variable('stylePrefix'),
      variable('description', {
        description: '场景中的客观环境细节，只描述空间、建筑、地面、植被、天气痕迹、陈设等可见内容；室内必须含可见的墙面 / 地面 / 天花板与门窗位置，以便下游视频模型不需要凭空想象不可见区域。禁止出现人物、角色名、人物动作和对白。',
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
    category: 'tti',
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
    category: 'tti',
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
    category: 'tti',
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
    category: 'itv',
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
    category: 'itv',
    name: '角色动态视频',
    description: '生成角色动态展示视频',
    template: '{{characterName}} {{action}}, {{stylePrefix}}, smooth animation, character showcase, professional quality',
    variables: [variable('characterName'), variable('action'), variable('stylePrefix')],
    isCustom: false,
  },

  itv_prop_motion: {
    id: 'itv_prop_motion',
    category: 'itv',
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
  type: string,
  templateText: string
): PromptTemplateValidationResult {
  // 默认模板：按其声明的 variables 校验
  // 自定义模板（type 不在 DEFAULT_TEMPLATES 中）：不做严格白名单校验，视为合法
  const defaultTemplate = (DEFAULT_TEMPLATES as Record<string, PromptTemplate>)[type];
  if (!defaultTemplate) {
    return { isValid: true, unknownVariables: [], missingRequiredVariables: [] };
  }
  const allowedVariables = getVariableNames(defaultTemplate.variables);
  const requiredVariables = getRequiredVariableNames(defaultTemplate.variables);
  const usedVariables = extractTemplateVariables(templateText);
  // 内建全局注入变量（globalPositivePrefix 等）允许在任何模板中直接使用，
  // 不要求模板自身在 variables 列表声明
  const unknownVariables = usedVariables.filter(
    variable => !allowedVariables.includes(variable) && !INTRINSIC_GLOBAL_VARIABLE_NAMES.has(variable)
  );
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
 * 加载所有模板（默认 + override 覆盖 + 用户新增的 custom 自定义）
 *
 * 三层优先级（覆盖顺序，后者覆盖前者）：
 *   1. DEFAULT_TEMPLATES               内置默认模板
 *   2. settings.promptTemplates        默认模板的 override（同 id 改写 template 字段）
 *   3. settings.customPromptTemplates  用户手动新建的全新模板（id 不在 union 中）
 *
 * 返回的 Record 键类型放宽为 string，以容纳 custom 模板的任意 id。
 */
export async function loadPromptTemplates(): Promise<Record<string, PromptTemplate>> {
  const templates: Record<string, PromptTemplate> = { ...DEFAULT_TEMPLATES };

  // override 层：仅修改默认模板的 template 内容，类型仍是 PromptTemplateType
  const overrides = await loadPromptTemplateOverrides();
  for (const [key, value] of Object.entries(overrides)) {
    if (!value) continue;
    const templateKey = key as PromptTemplateType;
    if (!templates[templateKey]) continue; // 旧 override 引用了已删除的默认模板，跳过
    templates[templateKey] = {
      ...templates[templateKey],
      template: value.template,
      isCustom: true,
    };
  }

  // custom 层：用户新增的全新模板
  const customs = await loadCustomPromptTemplates();
  for (const cp of customs) {
    if (templates[cp.id]) {
      // 防御：custom id 与默认 id 冲突时不覆盖默认模板
      console.warn(`[PromptTemplate] 自定义模板 id "${cp.id}" 与默认模板冲突，已忽略 custom`);
      continue;
    }
    templates[cp.id] = {
      id: cp.id as PromptTemplateType, // 实际上是 custom id，类型上借用 union（不影响运行）
      name: cp.name,
      category: cp.category as PromptTemplateCategory,
      description: cp.description,
      template: cp.template,
      variables: (cp.variables || []).map(v => ({
        name: v.name,
        ...(COMMON_VARIABLE_DEFINITIONS[v.name] || {
          label: v.name,
          description: `${v.name} 变量`,
          format: '字符串',
          required: v.required ?? true,
        }),
        required: v.required ?? true,
      })),
      isCustom: true,
    };
  }

  return templates;
}

/**
 * 获取单个模板（支持默认模板 + 自定义模板的任意 id）
 */
export async function getPromptTemplate(type: string): Promise<PromptTemplate> {
  const templates = await loadPromptTemplates();
  return templates[type];
}

/**
 * 保存"覆盖默认模板"的内容（仅改写 template 字段，类型仍是默认 union）
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

// ========== 用户自定义新模板（全新 id，不属于 union） ==========

export interface CreateCustomTemplateInput {
  id: string;                  // 全新 id；不能与默认模板 / 已有 custom id 冲突
  name: string;
  category: PromptTemplateCategory;
  description: string;
  template: string;
  variables?: Array<{ name: string; required?: boolean }>;
}

const CUSTOM_ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

/** 加载所有用户自定义新模板 */
export async function loadCustomPromptTemplates(): Promise<NonNullable<AppSettings['customPromptTemplates']>> {
  const settings = await loadSettings();
  return Array.isArray(settings.customPromptTemplates) ? settings.customPromptTemplates : [];
}

/** 新建用户自定义模板 */
export async function createCustomPromptTemplate(input: CreateCustomTemplateInput): Promise<void> {
  if (!CUSTOM_ID_PATTERN.test(input.id)) {
    throw new Error('自定义模板 id 必须是 3-64 位的小写字母 / 数字 / 下划线，且以字母开头');
  }
  if ((Object.keys(DEFAULT_TEMPLATES) as string[]).includes(input.id)) {
    throw new Error(`id "${input.id}" 与内置模板冲突，请换一个`);
  }
  const settings = await loadSettings();
  const list = Array.isArray(settings.customPromptTemplates) ? [...settings.customPromptTemplates] : [];
  if (list.some(t => t.id === input.id)) {
    throw new Error(`id "${input.id}" 已存在`);
  }
  const now = Date.now();
  list.push({
    id: input.id,
    name: input.name,
    category: input.category,
    description: input.description,
    template: input.template,
    variables: input.variables,
    createdAt: now,
    updatedAt: now,
  });
  await saveSettings({ ...settings, customPromptTemplates: list });
}

/** 更新用户自定义模板（按 id 全量替换字段，不存在则报错） */
export async function updateCustomPromptTemplate(
  id: string,
  patch: Partial<Omit<CreateCustomTemplateInput, 'id'>>,
): Promise<void> {
  const settings = await loadSettings();
  const list = Array.isArray(settings.customPromptTemplates) ? [...settings.customPromptTemplates] : [];
  const idx = list.findIndex(t => t.id === id);
  if (idx < 0) throw new Error(`自定义模板 "${id}" 不存在`);
  list[idx] = {
    ...list[idx],
    ...patch,
    updatedAt: Date.now(),
  };
  await saveSettings({ ...settings, customPromptTemplates: list });
}

/** 删除用户自定义模板 */
export async function deleteCustomPromptTemplate(id: string): Promise<void> {
  const settings = await loadSettings();
  const list = Array.isArray(settings.customPromptTemplates) ? settings.customPromptTemplates : [];
  const next = list.filter(t => t.id !== id);
  await saveSettings({ ...settings, customPromptTemplates: next });
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

/**
 * 默认模板 ID 集合（用于 UI 区分"用户自定义新建"与"用户改写默认"）
 */
export function getDefaultTemplateIds(): readonly string[] {
  return Object.keys(DEFAULT_TEMPLATES);
}

/** 判断给定 id 是否为默认模板 */
export function isDefaultTemplateId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEFAULT_TEMPLATES, id);
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

/**
 * 收集需要自动注入到当前模板的全局约束变量。
 *
 * 仅当目标模板里实际出现 {{globalXxx}} 占位符时才会拉取对应 global_* 模板内容，
 * 避免对不需要全局约束的模板（例如纯系统提示）造成无谓负担。
 *
 * 调用方传入的同名变量会覆盖自动注入的内容（手动优先）。
 */
async function collectGlobalInjections(
  template: PromptTemplate,
  callerVariables: Record<string, string>,
  templates: Record<PromptTemplateType, PromptTemplate>
): Promise<Record<string, string>> {
  if (GLOBAL_TEMPLATE_TYPES.has(template.id)) {
    return {};
  }
  const injections: Record<string, string> = {};
  const placeholders = new Set(extractTemplateVariables(template.template));
  for (const [varName, sourceType] of Object.entries(GLOBAL_INJECTION_MAP)) {
    if (Object.prototype.hasOwnProperty.call(callerVariables, varName)) {
      // 调用方显式传值时尊重调用方
      continue;
    }
    if (!placeholders.has(varName)) {
      continue;
    }
    const sourceTemplate = templates[sourceType];
    if (sourceTemplate) {
      injections[varName] = sourceTemplate.template.trim();
    }
  }
  return injections;
}

// 让函数能接受 PromptTemplateType 字面量（默认模板）和任意 string（自定义模板）id，
// 同时保留对 PromptTemplateType 字面量的类型受检（避免拼错默认模板名）。
export type PromptTemplateId = PromptTemplateType | (string & {});

export async function resolvePromptTemplate(
  type: PromptTemplateId,
  variables: Record<string, string>
): Promise<ResolvedPromptTemplate> {
  const allTemplates = await loadPromptTemplates();
  const template = allTemplates[type];
  if (!template) {
    throw new Error(`提示词模板 "${type}" 不存在（既非默认模板，也未在自定义模板中定义）`);
  }
  const variableNames = getVariableNames(template.variables);
  const requiredVariableNames = getRequiredVariableNames(template.variables);

  // 自动注入全局约束（仅在模板包含对应占位符时生效）
  const globalInjections = await collectGlobalInjections(template, variables, allTemplates);
  const mergedVariables = { ...globalInjections, ...variables };

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

  // 过滤掉模板未声明的多余变量（内建全局变量除外）；仅警告，不阻断
  const unknownVariables = Object.keys(mergedVariables).filter(
    variable => !variableNames.includes(variable) && !INTRINSIC_GLOBAL_VARIABLE_NAMES.has(variable)
  );
  if (unknownVariables.length > 0) {
    console.warn(`[PromptTemplate] 模板 ${type} 收到未声明变量（已忽略）: ${unknownVariables.join(', ')}`);
  }
  const filteredVariables = Object.fromEntries(
    Object.entries(mergedVariables).filter(
      ([key]) => variableNames.includes(key) || INTRINSIC_GLOBAL_VARIABLE_NAMES.has(key)
    )
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
