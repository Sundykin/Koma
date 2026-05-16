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

export interface LinghuiImageNineGridPresetDef extends LinghuiImageToolPresetDef {
  scene: string;
  gridType: 9 | 16 | 25;
}

const STORYBOARD_GRID_BASE_PROMPT = [
  '基于输入参考图和用户手动提示词，生成一张单张完整的宫格分镜图，而不是切分原图。',
  '必须保持参考图中的主体身份、服装、道具、场景风格和色彩气质一致。',
  '每个格子都是新的分镜画面，格子之间有清晰的时间推进、动作变化、镜头关系和情绪递进。',
  '画面只包含视觉内容和干净分隔线，不要生成可读文字、字幕、编号、logo、水印或说明标签。',
].join('\n');

export const LINGHUI_IMAGE_NINE_GRID_PRESETS: LinghuiImageNineGridPresetDef[] = [
  {
    scene: 'plot_deduction_nine_grid',
    gridType: 9,
    label: '剧情推演九宫格',
    description: '用内置剧情推演提示词生成 3×3 连贯分镜图。',
    promptSnippet: [
      STORYBOARD_GRID_BASE_PROMPT,
      '输出为 3×3 九宫格剧情推演分镜：从当前画面延展出 9 个连续剧情节点，包含起因、转折、推进、冲突和余韵。',
      '每格构图要有明显变化，人物/主体一致，动作和情绪逐格推进，适合用户继续做剧情推演。',
    ].join('\n'),
    properties: { aspectRatio: '1:1', resolution: '2K', batchCount: 1, gridType: 'none' },
  },
  {
    scene: 'multi_camera_nine_grid',
    gridType: 9,
    label: '多机位九宫格',
    description: '围绕同一剧情时刻生成 3×3 多机位镜头板。',
    promptSnippet: [
      STORYBOARD_GRID_BASE_PROMPT,
      '输出为 3×3 多机位九宫格：围绕同一个剧情时刻，生成远景、全景、中景、近景、特写、俯拍、仰拍、侧面、背面/越肩等不同机位。',
      '所有格子应属于同一场景和同一时间段，主体一致，光线和美术风格统一，镜头语言丰富。',
    ].join('\n'),
    properties: { aspectRatio: '1:1', resolution: '2K', batchCount: 1, gridType: 'none' },
  },
  {
    scene: 'coherent_storyboard_16',
    gridType: 16,
    label: '16宫格连贯分镜',
    description: '生成 4×4 更细密的连贯剧情分镜图。',
    promptSnippet: [
      STORYBOARD_GRID_BASE_PROMPT,
      '输出为 4×4 十六宫格连贯分镜：把用户设定的剧情拆成 16 个清楚的镜头节拍。',
      '节奏从建立场景、人物行动、冲突升级、关键反应到结尾悬念逐步推进，避免重复同一构图。',
    ].join('\n'),
    properties: { aspectRatio: '1:1', resolution: '2K', batchCount: 1, gridType: 'none' },
  },
  {
    scene: 'coherent_storyboard_25',
    gridType: 25,
    label: '25宫格连贯分镜',
    description: '生成 5×5 长段落剧情推演分镜图。',
    promptSnippet: [
      STORYBOARD_GRID_BASE_PROMPT,
      '输出为 5×5 二十五宫格连贯分镜：生成一个更完整的长段落剧情推演，包含环境建立、人物目标、行动推进、障碍、反转、高潮和收束。',
      '每格都应是可继续制作的分镜画面，镜头尺度、机位和表演有变化，整张图保持统一视觉风格。',
    ].join('\n'),
    properties: { aspectRatio: '1:1', resolution: '2K', batchCount: 1, gridType: 'none' },
  },
];

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
    description: 'LibTV 原始打光预设：过曝胶片 / 蓝色逆光 / 伦勃朗光 / 赛博朋克 / 落日迷幻等。',
    presets: [
      {
        label: '过曝胶片',
        description: 'LibTV preset id=6，亮度 100，柯达胶片质感。',
        promptSnippet: '柯达胶片质感',
        properties: {
          resolution: '2K',
          relight: { presetId: '6', direction: 'front', brightness: 100, lightColor: '#ffffff', rimLight: false, smartMode: true, prompt: '柯达胶片质感' },
        },
      },
      {
        label: '蓝色逆光',
        description: 'LibTV preset id=2，低位背光 + 蓝色主光。',
        promptSnippet: '蓝色逆光',
        properties: {
          resolution: '2K',
          relight: { presetId: '2', direction: 'low-back', brightness: 50, lightColor: '#2d34fa', rimLight: false, smartMode: true, prompt: '' },
        },
      },
      {
        label: '伦勃朗光',
        description: 'LibTV preset id=1，高位左前主光。',
        promptSnippet: '伦勃朗光',
        properties: {
          resolution: '2K',
          relight: { presetId: '1', direction: 'high-front-left', brightness: 50, lightColor: '#ffffff', rimLight: false, smartMode: true, prompt: '' },
        },
      },
      {
        label: '赛博朋克',
        description: 'LibTV preset id=4，银翼杀手风格。',
        promptSnippet: '让画面拥有《银翼杀手2045》同款打光，极简背景',
        properties: {
          resolution: '2K',
          relight: { presetId: '4', direction: 'front', brightness: 50, lightColor: '#ffffff', rimLight: false, smartMode: true, prompt: '让画面拥有《银翼杀手2045》同款打光，极简背景' },
        },
      },
      {
        label: '落日迷幻',
        description: 'LibTV preset id=3，带参考图。',
        promptSnippet: '落日迷幻打光',
        properties: {
          resolution: '2K',
          relight: {
            presetId: '3',
            direction: 'front',
            brightness: 50,
            lightColor: '#ffffff',
            rimLight: false,
            smartMode: true,
            prompt: '',
            referenceImage: 'https://libtv-res.liblib.art/upload-images/4e303b89c099425a93084d50cdcb10f4/d77a5a9cd6e8753451cb80191765d5b568bd0647.jpg?x-oss-process=image/resize,w_1400,m_lfit/format,webp',
          },
        },
      },
      {
        label: '神秘暗调',
        description: 'LibTV preset id=5，亮度 10，百叶窗暗调。',
        promptSnippet: '百叶窗打光，神秘优雅',
        properties: {
          resolution: '2K',
          relight: { presetId: '5', direction: 'front', brightness: 10, lightColor: '#ffffff', rimLight: false, smartMode: true, prompt: '百叶窗打光，神秘优雅' },
        },
      },
      {
        label: '黄金时刻',
        description: 'LibTV preset id=7，黄金时刻提示词。',
        promptSnippet: '让画面光影变成"黄金时刻"',
        properties: {
          resolution: '2K',
          relight: { presetId: '7', direction: 'front', brightness: 50, lightColor: '#ffffff', rimLight: false, smartMode: true, prompt: '让画面光影变成"黄金时刻"' },
        },
      },
      {
        label: '诺兰冷灰',
        description: 'LibTV preset id=8，诺兰同款冷灰色调。',
        promptSnippet: '让画面质感变成诺兰同款冷灰色调',
        properties: {
          resolution: '2K',
          relight: { presetId: '8', direction: 'front', brightness: 50, lightColor: '#ffffff', rimLight: false, smartMode: true, prompt: '让画面质感变成诺兰同款冷灰色调' },
        },
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
