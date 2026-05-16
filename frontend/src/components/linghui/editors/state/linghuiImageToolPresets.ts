import type {
  LinghuiImageNodeProperties,
  LinghuiImageToolKey,
} from '../../../../types/linghui';

/**
 * LibTV 图片节点工具 preset 配置：每个工具点击后弹出二级菜单，列出 2-3 个常用预设。
 * 选 preset 后通过 `onApplyImageToolPreset(preset)` 派生 image-to-image 节点 + 自动连线 + 自动运行。
 *
 * 这套 preset 在 LibTV 是云端配置 + 真实模型链路；灵绘按 prompt 模板 + 默认参数模拟同样行为，
 * 用户可见入口和触发反馈完全一致。
 */
export interface LinghuiImageToolPresetDef {
  label: string;
  description: string;
  promptSnippet: string;
  properties?: Partial<LinghuiImageNodeProperties>;
  /** 'crop' 类型走本地 FFmpeg 裁剪，不派生 AI 任务。 */
  localAction?: 'crop';
}

export interface LinghuiImageToolDef {
  title: string;
  description: string;
  presets: LinghuiImageToolPresetDef[];
}

export const LINGHUI_IMAGE_TOOL_PRESETS: Record<LinghuiImageToolKey, LinghuiImageToolDef> = {
  focus: {
    title: '聚焦',
    description: '标记图片中的局部区域，下一次生成会优先修复、补全或重绘这个区域。',
    presets: [],
  },
  mark: {
    title: '标记',
    description: '在图片上点选主体或细节焦点，并把标记点写入下一次生成提示。',
    presets: [],
  },
  upscale: {
    title: '高清放大',
    description: '用本地 FFmpeg 对当前图片做 2x 或 4x 高清放大，并派生新的图片节点。',
    presets: [],
  },
  'multi-angle': {
    title: '多角度',
    description: '适合角色、商品或场景设定图，一次拉出多个稳定视角。',
    presets: [
      {
        label: '角色四视图',
        description: '正、侧、背、3/4 视角的角色设定图。',
        promptSnippet: '角色四视图设定图，正面、左侧、背面、三分之四视角，服装、发型与材质一致，背景简洁。',
        properties: { gridType: '2x2', batchCount: 4, aspectRatio: '3:4' },
      },
      {
        label: '商品多面展示',
        description: '适合电商或工业设计的结构表达。',
        promptSnippet: '同一商品的多面展示图，突出材质、结构和细节，角度清晰且统一。',
        properties: { gridType: '2x2', batchCount: 4, aspectRatio: '1:1' },
      },
    ],
  },
  outpaint: {
    title: '扩图',
    description: '把现有构图延展成海报、横幅或竖版画面。',
    presets: [
      {
        label: '横向扩图',
        description: '扩成横版场景，补足环境空间。',
        promptSnippet: '横向扩图，补足主体两侧环境、前后景关系和纵深层次，保持主体位置稳定。',
        properties: { aspectRatio: '16:9', resolution: '2K' },
      },
      {
        label: '竖向扩图',
        description: '扩成竖版人物/海报，补足上下空间。',
        promptSnippet: '竖向扩图，补足主体上下环境与天空/地面，保持主体位置与比例。',
        properties: { aspectRatio: '9:16', resolution: '2K' },
      },
      {
        label: '海报延展',
        description: '增强留白和标题区，适合封面设计。',
        promptSnippet: '海报式扩图，保留主体视觉焦点，预留标题空间和排版留白，背景细节丰富但不喧宾夺主。',
        properties: { aspectRatio: '4:3', resolution: '2K' },
      },
    ],
  },
  relight: {
    title: '打光',
    description: 'LibTV 风格电影级打光预设：诺兰冷灰 / 伦勃朗光 / 黄金时刻 / 赛博朋克 等。',
    presets: [
      {
        label: '电影补光',
        description: '强调主光、边缘光和皮肤层次。',
        promptSnippet: '电影级补光，主体面部和轮廓光干净，皮肤与材质细节保留，层次分明。',
        properties: { resolution: '2K' },
      },
      {
        label: '诺兰冷灰',
        description: '让画面质感变成诺兰同款冷灰色调。',
        promptSnippet: '诺兰同款冷灰色调，去饱和、对比强烈，主体面部与服装保留质感，整体氛围沉稳。',
        properties: { resolution: '2K' },
      },
      {
        label: '伦勃朗光',
        description: '戏剧人像，三角形脸颊光。',
        promptSnippet: '伦勃朗光人像打光，主光从一侧 45° 打下，形成脸颊三角光，背景暗调，主体立体。',
        properties: { resolution: '2K' },
      },
      {
        label: '黄金时刻',
        description: '日落前温暖侧光。',
        promptSnippet: '黄金时刻打光，温暖侧光，长阴影，主体边缘有金色光晕，背景偏暖橘。',
        properties: { resolution: '2K' },
      },
      {
        label: '霓虹夜景',
        description: '赛博朋克高对比氛围光。',
        promptSnippet: '霓虹夜景光效，冷暖对比明显（青色 / 品红），反光与氛围雾层次丰富，主体仍然清晰。',
        properties: { resolution: '2K' },
      },
      {
        label: '柯达胶片',
        description: '复古胶片质感 + 暖色调。',
        promptSnippet: '柯达胶片质感，复古颗粒、轻度暖色偏黄、阴影泛绿，整体怀旧但不脏。',
        properties: { resolution: '2K' },
      },
    ],
  },
  repaint: {
    title: '重绘',
    description: '把当前节点切到局部修复、替换和细节统一方向。',
    presets: [
      {
        label: '修复细节',
        description: '优先修手部、五官和边缘。',
        promptSnippet: '细节修复，优化手部、五官、发丝和服装边缘，整体风格保持一致。',
      },
      {
        label: '替换背景',
        description: '保留主体，重绘背景氛围。',
        promptSnippet: '保留主体身份与姿态，仅重绘背景环境与氛围元素，增强故事感与空间层次。',
      },
      {
        label: '风格迁移',
        description: '保留主体，换整体风格。',
        promptSnippet: '保留主体身份与姿态，仅迁移整体风格（材质、笔触、色调），不破坏构图。',
      },
    ],
  },
  erase: {
    title: '擦除',
    description: '移除画面中的干扰元素，生成独立擦除任务节点。',
    presets: [
      {
        label: '智能擦除',
        description: '自动识别并清理瑕疵、水印或多余物体。',
        promptSnippet: '智能擦除画面中的多余物体、瑕疵、杂乱元素或水印痕迹，背景纹理自然补全，主体结构保持稳定。',
        properties: { resolution: '2K' },
      },
      {
        label: '框选擦除',
        description: '按已有聚焦/标记意图清理指定区域。',
        promptSnippet: '框选擦除指定区域中的干扰元素，并根据周围背景、光影和纹理自然补全，不改变主体身份与构图重心。',
        properties: { resolution: '2K' },
      },
    ],
  },
  'remove-bg': {
    title: '抠图',
    description: '生成主体干净、背景可替换的图片任务节点。',
    presets: [
      {
        label: '主体抠图',
        description: '保留主体边缘细节，移除背景。',
        promptSnippet: '主体抠图，保留人物/物体轮廓、发丝、透明材质和边缘细节，背景变为干净纯色或透明风格，主体不变形。',
        properties: { aspectRatio: '1:1', resolution: '2K' },
      },
      {
        label: '商品白底',
        description: '适合电商图和素材整理。',
        promptSnippet: '商品白底抠图，保留商品材质、阴影和真实比例，背景简洁干净，边缘锐利，适合素材库或电商展示。',
        properties: { aspectRatio: '1:1', resolution: '2K' },
      },
    ],
  },
  crop: {
    title: '裁剪',
    description: '按常用构图比例生成裁剪后的独立图片节点（本地 FFmpeg）。',
    presets: [
      {
        label: '方图裁剪',
        description: '裁成社媒/头像友好的 1:1。',
        promptSnippet: '将当前画面裁剪重构为 1:1 方图构图，主体居中清晰，边缘信息自然补足，画面不出现拉伸变形。',
        properties: { aspectRatio: '1:1', resolution: '2K' },
        localAction: 'crop',
      },
      {
        label: '竖版裁剪',
        description: '裁成短视频封面或人物海报。',
        promptSnippet: '将当前画面裁剪重构为 9:16 竖版构图，保留主体完整性和视觉焦点，上下空间自然补足。',
        properties: { aspectRatio: '9:16', resolution: '2K' },
        localAction: 'crop',
      },
      {
        label: '横版裁剪',
        description: '裁成横幅和视频首帧。',
        promptSnippet: '将当前画面裁剪重构为 16:9 横版构图，保留主体和关键环境关系，两侧空间自然延展。',
        properties: { aspectRatio: '16:9', resolution: '2K' },
        localAction: 'crop',
      },
    ],
  },
  mockup: {
    title: 'Mockup',
    description: '把当前主体放入展示样机、海报或产品场景。',
    presets: [
      {
        label: '海报样机',
        description: '生成可展示的品牌/角色海报 mockup。',
        promptSnippet: '将当前主体制作成高级海报 Mockup，加入真实纸张/屏幕/展架质感，光影自然，主体清晰，排版留白专业。',
        properties: { aspectRatio: '4:3', resolution: '2K' },
      },
      {
        label: '产品展示',
        description: '放入桌面、展台或商业展示场景。',
        promptSnippet: '将当前主体放入产品展示 Mockup 场景，包含真实材质台面、柔和商业灯光和可读的空间透视，主体外观保持一致。',
        properties: { aspectRatio: '16:9', resolution: '2K' },
      },
    ],
  },
  'edit-elements': {
    title: '编辑元素',
    description: '替换、添加或整理画面里的局部元素。',
    presets: [
      {
        label: '替换元素',
        description: '保留整体构图，只替换指定对象。',
        promptSnippet: '编辑画面元素：保留主体身份、构图和光影，仅替换或优化指定对象，使新元素与场景透视、材质和比例自然一致。',
        properties: { resolution: '2K' },
      },
      {
        label: '添加道具',
        description: '为主体补充自然互动道具。',
        promptSnippet: '在画面中添加与主体动作和剧情匹配的道具，保持手部关系、遮挡、光影和材质真实，不破坏原有构图。',
        properties: { resolution: '2K' },
      },
    ],
  },
  'edit-texts': {
    title: '编辑文本',
    description: '清理画面文字或生成更规整的可替换文字区域。',
    presets: [
      {
        label: '去除文字',
        description: '移除水印、字幕和画面文字。',
        promptSnippet: '移除画面中的文字、水印、字幕、logo 或标签痕迹，并自然补全背景纹理，不改变主体与关键画面内容。',
        properties: { resolution: '2K' },
      },
      {
        label: '留出版面',
        description: '整理出可后期加字的干净区域。',
        promptSnippet: '整理画面中的文字区域，保留干净可编辑的版面留白，让背景、光影和主体关系自然，避免生成不可读乱码文字。',
        properties: { resolution: '2K' },
      },
    ],
  },
  'grid-split': {
    title: '宫格切分',
    description: '把当前主图切成 4 / 9 / 16 / 25 宫格，再选中若干格子继续生成节点。',
    presets: [],
  },
};

/** "扩图 / 打光 / 重绘 / 擦除 / 抠图 / 裁剪 / Mockup / 元素 / 文字" 这类带 preset 的工具集合。 */
export const LINGHUI_IMAGE_TOOLS_WITH_PRESETS: LinghuiImageToolKey[] = [
  'outpaint',
  'relight',
  'repaint',
  'erase',
  'remove-bg',
  'crop',
  'mockup',
  'edit-elements',
  'edit-texts',
];
