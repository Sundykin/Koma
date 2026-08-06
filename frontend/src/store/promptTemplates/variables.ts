/**
 * Prompt 模板变量体系：通用变量定义 / 全局注入映射 / 变量构建助手
 * （从 store/promptTemplates.ts 拆出）
 */
import type { PromptTemplateType, PromptTemplateVariable } from './types';

export const COMMON_VARIABLE_DEFINITIONS: Record<string, Omit<PromptTemplateVariable, 'name'>> = {
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
    example: '雨夜墓地: @scene_001',
    required: true,
  },
  propRefs: {
    label: '道具引用表',
    description: '可插入到提示词中的道具引用清单，格式为道具名到 @prop_ID 的映射。',
    format: '多行文本',
    example: '铁盆: @prop_001',
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
  projectNarrativeMode: {
    label: '项目叙事模式',
    description: '项目设置中的叙事模式：剧情模式或解说模式。',
    format: '短语',
    example: '剧情模式',
    required: false,
  },
  dialogueModeDirective: {
    label: '台词模式约束',
    description: '运行时根据项目叙事模式生成的台词改写约束。',
    format: '多行文本',
    example: '【项目叙事模式：剧情模式】...',
    required: false,
  },
  imageMode: {
    label: '图片模式',
    description: '当前分镜的图片生成模式，值为 normal、grid-4、grid-9 或 storyboard。',
    format: '枚举字符串',
    example: 'storyboard',
    required: true,
  },
  projectTitle: {
    label: '项目名称',
    description: '当前项目标题，用于故事板【项目标题】区。由项目元数据注入，不能由模型自行改写为其它片名。',
    format: '短文本',
    example: '叶赎修仙异闻录',
    required: true,
  },
  projectSubtitle: {
    label: '项目副标题',
    description: '故事板标题区副标题，默认使用“短片分镜设计”。',
    format: '短文本',
    example: '短片分镜设计',
    required: true,
  },
  shootingFormat: {
    label: '拍摄形式',
    description: '故事板标题区的拍摄形式。默认“单机位”，后续如项目支持多机位可由运行时传入。',
    format: '短文本',
    example: '单机位',
    required: true,
  },
  projectType: {
    label: '项目类型',
    description: '当前项目的题材类型，来自 ProjectMeta.genre，用于故事板【项目标题】区的“类型”。',
    format: '短文本',
    example: '修仙玄幻',
    required: true,
  },
  shotDurationSeconds: {
    label: '分镜时长',
    description: '当前分镜的时长，来自 Shot.duration；故事板【项目标题】区必须使用这个值，而不是项目总时长。',
    format: '秒数字符串',
    example: '15',
    required: true,
  },
  storyboardConstraints: {
    label: '故事板限制条件',
    description: '故事板【项目标题】区的限制条件，如镜头节奏、角色数、场景数。',
    format: '短文本',
    example: '镜头数量由剧情节奏决定 / 2 个角色 / 1 个场景',
    required: true,
  },
  referenceTable: {
    label: '视觉参考集合',
    description: '运行时构造的视觉参考集合。视频模板使用 references 索引表；故事板等可编辑提示词模板只应使用语义 mention，禁止提前输出 @Image N。',
    format: '多行文本',
    example: '@char_abc 顾行',
    required: false,
  },
  storyboardContinuityNotice: {
    label: '故事板连续性说明',
    description: '故事板模式下对上一故事板/当前故事板锚点的继承说明。',
    format: '多行文本',
    example: '上一故事板参考：@previous_storyboard_anchor ...',
    required: false,
  },
  storyboardPrompt: {
    label: '故事板推理结果',
    description: '故事板提示词推理模板输出的结构化电影故事板方案。',
    format: '多行文本',
    example: '故事板类型：电影级制作方案板...',
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
    example: '剧情：顾行走到墓前停下\n已生成提示词：中景，顾行 @Image 1 缓慢走至墓碑前 @Image 3...',
    required: false,
  },
  prevShot1Info: {
    label: '上 1 分镜信息（多参模式专用）',
    description: '相邻向前第 1 个分镜的剧情 + 已生成的视频提示词；不存在则填"无"',
    format: '多行文本',
    example: '剧情：他蹲下点燃纸钱\n已生成提示词：近景，顾行 @Image 1 蹲身将纸钱投入铁盆 @Image 4...',
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
export const INTRINSIC_GLOBAL_VARIABLE_NAMES = new Set([
  'globalPositivePrefix',
  'globalPositiveSuffix',
  'globalNegativeSuffix',
  'globalVideoConstraints',
]);

// 全局变量名 → 对应模板类型的映射（resolvePromptTemplate 据此拉取注入内容）
export const GLOBAL_INJECTION_MAP: Record<string, PromptTemplateType> = {
  globalPositivePrefix: 'global_positive_prefix',
  globalPositiveSuffix: 'global_positive_suffix',
  globalNegativeSuffix: 'global_negative_suffix',
  globalVideoConstraints: 'global_video_constraints',
};

// 全局模板类型自身不参与注入（避免递归）
export const GLOBAL_TEMPLATE_TYPES = new Set<PromptTemplateType>([
  'global_positive_prefix',
  'global_positive_suffix',
  'global_negative_suffix',
  'global_video_constraints',
]);

export function variable(
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

export function getVariableNames(variables: PromptTemplateVariable[]): string[] {
  return variables.map(variableItem => variableItem.name);
}

export function getRequiredVariableNames(variables: PromptTemplateVariable[]): string[] {
  return variables.filter(variableItem => variableItem.required !== false).map(variableItem => variableItem.name);
}
