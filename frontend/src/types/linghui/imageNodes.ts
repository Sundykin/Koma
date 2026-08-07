/**
 * 灵绘图片/文本/剧本/分镜节点：视图状态、工具键、节点 properties
 * （从 types/linghui.ts 拆出）
 */
import type {
  LinghuiImageNodeMode,
  LinghuiMultiAngleAzimuth,
  LinghuiMultiAngleDistance,
  LinghuiMultiAngleElevation,
  LinghuiMultiAngleMode,
  LinghuiMultiAnglePresetKey,
  LinghuiMultiAnglePromptProtocol,
  LinghuiRelightDirection,
} from './core';
import type { LinghuiStoryboardFrame } from './graph';
// --- 图片节点 ---

export type LinghuiTextNodeMode = 'manual' | 'generate';

/**
 * LibTV TextNode 5 状态机派生视图（15gvxu:55066-55074）：
 *   generating / failed / resource / pending / empty_generate
 * - generating：taskInfo.loading → 渲染生成中视图
 * - failed：taskInfo 失败 → 渲染失败视图
 * - resource：有 content 或 mode='manual'（对齐 LibTV TEXT_RESOURCE 永远是 resource）→ 渲染编辑器/文本预览
 * - pending：当前 mode='generate' 且没有 content，但已有上游连入 → 等待上游产出
 * - empty_generate：默认（generate 模式 + 无 content + 无上游）→ 显示 4 actions EmptyState
 */
export type LinghuiTextNodeViewState =
  | 'generating'
  | 'failed'
  | 'resource'
  | 'pending'
  | 'empty_generate';
export type LinghuiScriptNodeMode = 'manual' | 'generate';
export type LinghuiScriptNodeViewMode = 'cards' | 'table';
export type LinghuiScriptDerivationKind = 'text' | 'image' | 'video-image' | 'video' | 'video-clip';
export type LinghuiProductionStage = 'script' | 'assets' | 'storyboard';
export type LinghuiProductionAssetKind = 'character' | 'scene' | 'prop';
export type LinghuiProductionAssetStatus = 'draft' | 'approved' | 'locked';

export interface LinghuiProductionAssetReferenceVersion {
  id: string;
  source: string;
  createdAt: number;
  label?: string;
}

export interface LinghuiProductionAsset {
  id: string;
  kind: LinghuiProductionAssetKind;
  name: string;
  description: string;
  sourceShotIds: string[];
  referenceImage?: string;
  /** 参考图候选版本；旧工作区只有 referenceImage 时由状态层补出兼容版本。 */
  referenceImageVersions?: LinghuiProductionAssetReferenceVersion[];
  /** 当前采用的参考图版本 ID；referenceImage 仍作为兼容/同步字段保留。 */
  currentReferenceImageId?: string;
  /** 用户确认的同义称呼；用于重复候选提示和镜头名称回退。 */
  aliases?: string[];
  /** 已合并到当前 canonical 资产的旧 ID，保留历史镜头和派生节点可解析性。 */
  mergedAssetIds?: string[];
  confirmed: boolean;
  /**
   * 生产资产生命周期：旧工作区没有该字段时由 confirmed 推导。
   * locked 资产必须显式解锁后才能编辑、删除或重新提取覆盖。
   */
  status?: LinghuiProductionAssetStatus;
}
export type LinghuiStoryboardScene =
  | 'plot_deduction_four_grid'
  | 'plot_deduction_nine_grid'
  | 'coherent_storyboard_16'
  | 'coherent_storyboard_25';

export interface LinghuiScriptDerivedProperties {
  scriptSourceNodeId?: string;
  scriptShotId?: string;
  scriptShotTitle?: string;
  scriptDerivationKind?: LinghuiScriptDerivationKind;
  productionAssetId?: string;
  productionAssetKind?: LinghuiProductionAssetKind;
  productionAssetName?: string;
}

export interface LinghuiTextNodeProperties extends LinghuiScriptDerivedProperties {
  mode: LinghuiTextNodeMode;
  content: string;
  prompt: string;
  systemPrompt: string;
  llmSelection: string;
}

export interface LinghuiAgentNodeProperties {
  prompt: string;
  systemPrompt: string;
  llmSelection: string;
  enabledTools: string[];
  maxIterations: number;
}

export interface LinghuiScriptNodeProperties {
  mode: LinghuiScriptNodeMode;
  content: string;
  prompt: string;
  systemPrompt: string;
  llmSelection: string;
  viewMode: LinghuiScriptNodeViewMode;
  editedShots?: LinghuiStoryboardFrame[];
  productionStage?: LinghuiProductionStage;
  productionAssets?: LinghuiProductionAsset[];
  /** 用户已确认属于有意变化的一致性问题指纹；问题证据或镜头范围变化后会自动重新出现。 */
  acknowledgedProductionConsistencyIssueIds?: string[];
  /** 打开制作台后一次性定位的生产资产，不参与执行语义。 */
  focusedProductionAssetId?: string;
}

/**
 * 故事板节点：脚本节点的"剧情→分镜"傻瓜版。
 * - 内置专业 system prompt，用户不暴露/不编辑
 * - 不开放 manual 模式
 * - 输出 storyboard kind，与 script 节点一致，可被下游 script 派生工具消费
 */
export interface LinghuiStoryboardNodeProperties {
  /** 剧情大纲。用户唯一需要填的字段。 */
  prompt: string;
  llmSelection: string;
  /** LibTV slash scene：用 scene 驱动内置剧情推演 / 连贯分镜提示词。 */
  scene?: LinghuiStoryboardScene;
  /** 视图模式与 script 节点共享，沿用 cards / table 复用 ScriptShot UI */
  viewMode: LinghuiScriptNodeViewMode;
  /** 目标镜头数。默认 8。允许 [4, 24]。 */
  targetShotCount: number;
  /** 用户在节点/编辑器表格中手动修正后的镜头数据。 */
  editedShots?: LinghuiStoryboardFrame[];
  productionStage?: LinghuiProductionStage;
  productionAssets?: LinghuiProductionAsset[];
  /** 用户已确认属于有意变化的一致性问题指纹；问题证据或镜头范围变化后会自动重新出现。 */
  acknowledgedProductionConsistencyIssueIds?: string[];
  /** 打开制作台后一次性定位的生产资产，不参与执行语义。 */
  focusedProductionAssetId?: string;
}

export type LinghuiGridType = 'none' | '2x2' | '3x3' | '4x4' | '5x5';
export type LinghuiPanoramaTemplateKind = 'auto' | 'indoor' | 'outdoor';
export type LinghuiPanoramaProjectionMode = 'ar720-band' | 'equirectangular-2to1' | 'flat-wide';

export interface LinghuiImageAssetItem {
  id: string;
  source: string;
  label?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  aspectRatio?: string;
}

export interface LinghuiImageFocusRegion {
  enabled: boolean;
  /** Normalized left position in the source image, range [0, 1]. */
  x: number;
  /** Normalized top position in the source image, range [0, 1]. */
  y: number;
  /** Normalized width in the source image, range [0, 1]. */
  width: number;
  /** Normalized height in the source image, range [0, 1]. */
  height: number;
  /** Image source captured when the region was marked, used as image-to-image reference on rerun. */
  source?: string;
  label?: string;
  updatedAt?: number;
}

export interface LinghuiImageMarkPoint {
  id: string;
  enabled: boolean;
  /** Normalized x position in the source image, range [0, 1]. */
  x: number;
  /** Normalized y position in the source image, range [0, 1]. */
  y: number;
  /** Image source captured when the point was marked. */
  source?: string;
  label?: string;
  prompt?: string;
  updatedAt?: number;
}

/**
 * 电影感参数：把"打光 / 焦距 / 光圈"从隐式提示词词条改成结构化字段。
 * - lighting：光线类型（自然/柔光/伦勃朗/边缘光/逆光/低调/高调/霓虹/黄金/蓝调）
 * - focalLength：焦距档（24mm 广角 / 50mm 标头 / 85mm 人像中长焦 / 135mm 长焦 / 微距）
 * - aperture：光圈/景深（浅 f1.4 / 中 f2.8 / 深 f8）
 * 所有值缺省时不会注入到 prompt，保证旧节点行为不变；任意字段非默认时执行器会拼接成英文导演短语。
 */
export type LinghuiImageLightingPreset =
  | 'auto'
  | 'natural'
  | 'softbox'
  | 'rembrandt'
  | 'rim'
  | 'backlight'
  | 'low-key'
  | 'high-key'
  | 'neon'
  | 'golden-hour'
  | 'blue-hour';

export type LinghuiImageFocalLengthPreset =
  | 'auto'
  | 'wide-24mm'
  | 'standard-50mm'
  | 'portrait-85mm'
  | 'tele-135mm'
  | 'macro';

export type LinghuiImageAperturePreset =
  | 'auto'
  | 'shallow-f14'
  | 'medium-f28'
  | 'deep-f8';

export interface LinghuiImageCinematicConfig {
  lighting: LinghuiImageLightingPreset;
  focalLength: LinghuiImageFocalLengthPreset;
  aperture: LinghuiImageAperturePreset;
}

export const DEFAULT_LINGHUI_IMAGE_CINEMATIC_CONFIG: LinghuiImageCinematicConfig = {
  lighting: 'auto',
  focalLength: 'auto',
  aperture: 'auto',
};

export interface LinghuiImageNodeProperties extends LinghuiScriptDerivedProperties {
  mode: LinghuiImageNodeMode;
  source: string;
  items?: LinghuiImageAssetItem[];
  primaryAssetId?: string;
  primaryResultSource?: string;
  prompt: string;
  ttiSelection: string;
  aspectRatio: string;
  resolution: string;
  gridType: LinghuiGridType;
  batchCount: number;
  multiAngle?: LinghuiMultiAngleConfig;
  relight?: LinghuiImageRelightConfig;
  focusRegion?: LinghuiImageFocusRegion | null;
  markPoints?: LinghuiImageMarkPoint[];
  /** 电影感参数（打光/焦距/光圈），任意非 auto 字段会拼到 prompt 末尾。可选，保持旧节点兼容。 */
  cinematic?: LinghuiImageCinematicConfig;
  /**
   * LibTV 扩图比例：4 个方向相对原图的扩展量（0-1 区间）。仅在 outpaint 工具中使用，
   * 由扩图面板的 4 向滑块写入。最终 prompt 会拼接方向描述（"向 X 方向各扩 Y%"）。
   */
  outpaintRatio?: { top: number; right: number; bottom: number; left: number };
  /**
   * LibTV `_outpaintPads`：扩图生成成功后，记录原图相对于新画布的位置（像素偏移）。
   * 由 outpaint 提交链路写入，用于后续"再次扩图"或"还原"操作。
   */
  _outpaintPads?: { top: number; right: number; bottom: number; left: number };
  /**
   * 该展示节点是由哪个 image-generator 控制器派生而来。
   * 仅记录来源，便于控制器维护生成历史；展示节点本身仍是独立 image 节点，
   * 用户可以单独删除 / 再跑 / 改 prompt。
   */
  generatedFromNodeId?: string;
  /** 第几次生成（从 1 开始），用于自动 label */
  generatedSequence?: number;
}

/**
 * 宫格切分中间节点属性：上游单张图被本地 canvas 切成 N 个槽位，每个槽位独立可派生为图节点。
 * 槽位 source 可以是空（用户手动从外部拖入/清空）或本地 dataUrl（切分时填充）。
 */
export interface LinghuiImageGridSliceNodeProperties {
  /** 上游主图（切分源）；空时显示"等待上游"提示 */
  source: string;
  /** 切分类型：2x2=4 槽 / 3x3=9 槽 / 4x4=16 槽 / 5x5=25 槽 */
  gridType: '2x2' | '3x3' | '4x4' | '5x5';
  /** N 个槽位，长度 = gridType 对应槽数（4/9/16/25）；source 空表示槽位已被清空 */
  slots: Array<{ id: string; source: string; label?: string }>;
}

/**
 * 视频合成节点属性：把多个视频 / 图片片段拼合为单一视频。
 *  - clips：片段列表（每项 kind 区分 video / image，image 片段会本地 FFmpeg 转为 N 秒静帧视频后再 concat）
 *  - resolution / fps：导出参数，默认 1080p / 30fps
 *  - source：合成完成后的本地或 OSS URL（暂未合成时为空）
 *  - posterSource：合成完成后的封面
 *  - durationSec：合成结果总时长（来自 FFmpeg 输出）
 *  - status：'idle' | 'composing' | 'ready' | 'failed'
 */
export interface LinghuiVideoClipNodeProperties extends LinghuiScriptDerivedProperties {
  clips: Array<{ id: string; kind: 'video' | 'image' | 'audio'; source: string; durationSec?: number; label?: string }>;
  resolution: '720p' | '1080p' | '4K';
  fps: 24 | 30 | 60;
  /** 每张图片片段默认时长（秒），仅 kind='image' 时生效；缺省 3s */
  imageDurationSec: number;
  source: string;
  posterSource: string;
  durationSec?: number;
  status?: 'idle' | 'composing' | 'ready' | 'failed';
  errorMessage?: string;
}

/**
 * 图片生成"控制器节点"属性。
 *  - 节点本身没有图片预览区，UI 只有 prompt / 模型 / 比例 / 批量 / 生成按钮
 *  - 点击"生成"按钮 → canvas 自动派生一个 linghui/image 展示节点（mode='generate'），
 *    自动连边，自动触发执行；展示节点维持 loading → 出图 → 失败的状态
 *  - 每次点击都派生一个新节点，纵向堆叠在右侧，形成生成历史
 *  - 控制器本身不参与 workflow 执行（没有 result，没有 output 数据）
 */
export interface LinghuiImageGeneratorNodeProperties {
  prompt: string;
  ttiSelection: string;
  aspectRatio: string;
  resolution: string;
  batchCount: number;
  /** 已生成的展示节点 id 列表（按生成顺序，最新在末尾） */
  generatedImageNodeIds?: string[];
  /** 累计生成次数（即使后面手动删了某个展示节点也只增不减），决定下一次 label 序号 */
  generationCount?: number;
  /** 电影感参数（打光/焦距/光圈）会随每次派生注入到 image 节点 prompt */
  cinematic?: LinghuiImageCinematicConfig;
}

export interface LinghuiPanoramaNodeProperties extends LinghuiImageNodeProperties {
  panoramaTemplate: LinghuiPanoramaTemplateKind;
  /** LibTV slash 场景名。默认 720_panoramic；带用户 prompt 的模式对应 720_panoramic_with_prompt。 */
  panoramaSlashScene?: string;
  panoramaWithPromptScene?: string;
  panoramaSlashLabel?: string;
  /** LibTV 全景 slash 默认提交模型 key。灵绘仍通过 ttiSelection 选择真实渠道，这里用于默认比例和元数据。 */
  panoramaModelKey?: string;
  /** LibTV mergeSettingsForPanoramicSlashScene 默认 quality。 */
  panoramaQuality?: string;
  /**
   * 投影契约：决定提示词、出图比例、展示几何。新建节点默认按 LibTV `720_panoramic`
   * 走 'equirectangular-2to1'；老节点缺字段时仍由 resolver 回退为 'ar720-band' 保持兼容。
   * 'equirectangular-2to1' 表示真 360°×180° 球面。
   * 'flat-wide' 是兜底，模型不支持环绕全景时把它当宽幅图。
   */
  projectionMode?: LinghuiPanoramaProjectionMode;
  /**
   * 主图横向切分得到的方向细节图（LibTV 风格的"多方向" UI）。
   * 由编辑器"切 4 / 6 方向"按钮在浏览器侧一次性 canvas crop 出 PNG dataUrl 后存入；
   * 执行器读到非空数组时会把每张作为 image collection item 输出，下游可用
   * @ref_{nodeId}__item_N 引用任意一张。
   */
  detailCrops?: LinghuiImageAssetItem[];
  /**
   * 通过球面重投影抽取出的"伪 3D 透视视角"。每条记录一个虚拟相机角度，
   * source 是落盘后的 koma-local URL（PNG）。executor 把这些作为 result.items 输出，
   * 让下游图片 / 视频节点用 @ref_{nodeId}__item_N 拿到同一场景的不同角度，做场景一致性。
   * 详见 panorama/panoramaPerspectiveExtractor.ts。
   */
  perspectiveViews?: LinghuiPanoramaPerspectiveView[];
}

export interface LinghuiPanoramaPerspectiveView {
  id: string;
  label: string;
  yaw: number;
  pitch: number;
  fovDeg: number;
  /** 落盘后的 koma-local URL（PNG） */
  source: string;
  /** 输出图宽高（PNG 尺寸） */
  width?: number;
  height?: number;
}

export interface LinghuiMultiAngleConfig {
  enabled: boolean;
  /** LibTV p9/pX: object/camera 两种编辑模式。 */
  mode: LinghuiMultiAngleMode;
  /** LibTV p8/pV/pK: 水平旋转，camera 模式按 45° 吸附，object 模式支持连续角度。 */
  rotation: number;
  /** LibTV p8/pV/pK: 垂直俯仰/物体倾斜。 */
  tilt: number;
  /** LibTV p8/pV/pK: 0=全景，50=中景，100=特写。 */
  scale: number;
  /** LibTV object/camera preview 的广角镜头开关。 */
  isWideAngle: boolean;
  presetKey: LinghuiMultiAnglePresetKey;
  prompt: string;
  promptEnabled: boolean;
  /** 旧版灵绘字段，保留用于持久化兼容和现有 provider 编译。 */
  azimuth: LinghuiMultiAngleAzimuth;
  elevation: LinghuiMultiAngleElevation;
  distance: LinghuiMultiAngleDistance;
  ttiSelection: string;
  promptProtocol: LinghuiMultiAnglePromptProtocol;
  endpointPath: string;
}

export interface LinghuiImageRelightConfig {
  direction: LinghuiRelightDirection;
  brightness: number;
  lightColor: string;
  rimLight: boolean;
  smartMode: boolean;
  prompt: string;
  referenceImage?: string | null;
  presetId?: string;
  sceneActive?: boolean;
  brightnessActive?: boolean;
  colorActive?: boolean;
  /**
   * 主光位的连续球面坐标（与 electron-egg ImageLightControlConfig.azimuthDeg/elevationDeg 对齐）。
   * 缺省时回退到 `direction` 派生角度；用户在球面上拖拽时会写入此处持久化。
   */
  mainAzimuthDeg?: number;
  mainElevationDeg?: number;
  /** 轮廓光（fill light）的连续球面坐标，仅在 rimLight 开启时生效。 */
  fillAzimuthDeg?: number;
  fillElevationDeg?: number;
  /** electron-egg 的预览视角模式：透视 / 正面，仅影响球面预览相机。 */
  previewMode?: 'perspective' | 'front';
}

export interface LinghuiExecuteMultiAngleOptions {
  ttiSelection?: string;
  multiAngle?: Partial<LinghuiMultiAngleConfig>;
  label?: string;
}
