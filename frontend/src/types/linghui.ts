import type { AppSettings } from '../types';
import type { VideoGenerationCapability } from './media';

/**
 * LibTV 1:1：所有图片节点统一为 'linghui/image'，按 properties.mode + 是否有 result 渲染三态：
 *  1) mode='import' + 无 source → 自行上传图片占位（截图：上传 placeholder）
 *  2) mode='import' + 有 source → 上传素材展示（截图 3：浮空工具条 + 图片预览 + 文件名 + WxH）
 *  3) mode='generate' + 无 result → 未生成状态（截图 2：中心占位 + "图生图/图片高清" 引导 + 底部编辑器）
 *  4) mode='generate' + 有 result → 已生成状态（截图 4：浮空工具条 + 图片 + 底部编辑器）
 * 历史的 'linghui/image-generator' 类型已废弃；旧节点恢复时按 'linghui/image' + mode='generate' 处理。
 */
export type LinghuiNodeType =
  | 'linghui/text'
  | 'linghui/agent'
  | 'linghui/image'
  | 'linghui/panorama'
  | 'linghui/video'
  | 'linghui/audio'
  | 'linghui/script'
  | 'linghui/storyboard'
  | 'linghui/director3d'
  // 宫格切分中间节点：上游单张图被切成 N 个槽位，每个槽位可独立"彻底切分"派生为独立图节点
  | 'linghui/image-grid-slice'
  // 视频合成节点：多个视频/图片片段拼合为单一视频；详情打开"最终剪辑"工具
  | 'linghui/video-clip';

export type LinghuiRFNodeTypeKey =
  | 'linghui-text'
  | 'linghui-agent'
  | 'linghui-image'
  | 'linghui-panorama'
  | 'linghui-video'
  | 'linghui-audio'
  | 'linghui-script'
  | 'linghui-storyboard'
  | 'linghui-director3d'
  | 'linghui-image-grid-slice'
  | 'linghui-video-clip';

export type LinghuiNodeCategory = 'asset' | 'generation' | 'storyboard' | 'spatial';
export type LinghuiSlotDataType = 'image' | 'text' | 'video' | 'audio' | 'images' | 'shot' | 'storyboard';
export type LinghuiRunStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'stale';
export type LinghuiResultKind = 'image' | 'text' | 'video' | 'audio' | 'grid' | 'images' | 'shot' | 'storyboard';
export type LinghuiCanvasMode = 'mouse' | 'hand';
export type LinghuiImageNodeMode = 'import' | 'generate';

/**
 * LibTV ImageNode 视图状态机（对齐 docs/libtv-imagenode-state-machine.md）。
 * 与 Text/Video 节点同模板：
 *   generating / failed / resource / pending / empty_generate
 * - import 模式：始终 resource（纯素材节点）
 * - 有 collection / source / result 图：resource
 * - generate 模式 + 无图 + 有上游：pending
 * - 否则：empty_generate（显示"图生图 / 图片高清"建议）
 */
export type LinghuiImageNodeViewState =
  | 'generating'
  | 'failed'
  | 'resource'
  | 'pending'
  | 'empty_generate';
export type LinghuiImageToolKey =
  | 'focus'
  | 'mark'
  | 'upscale'
  | 'multi-angle'
  | 'outpaint'
  | 'relight'
  | 'repaint'
  | 'erase'
  | 'remove-bg'
  | 'crop'
  | 'mockup'
  | 'edit-elements'
  | 'edit-texts'
  | 'grid-split';
/**
 * 视频节点工具。对齐 LibTV 截图工具条：剪辑 / 高清 / 截图 / 解析 / 智能去字幕 / 音频分离。
 * - clip               剪辑：本地 FFmpeg trim 派生新视频节点
 * - upscale            高清：FFmpeg 倍率放大派生
 * - screenshot         截图：从当前视频抽首帧/中帧/尾帧派生图片节点
 * - analyze            解析：把视频转写为提示词/分镜文本
 * - subtitle-remove    智能去字幕（LibTV: "AI一键去除视频字幕，仅支持中英文字幕"，后端服务待接入）
 * - audio-separation   音频分离（一级菜单容器，下挂"音视频分离"和"人声分离"二级）
 * - 'compose' 已废弃，原因：与 LibTV 模式重合且功能模糊，并入解析。
 */
export type LinghuiVideoToolKey =
  | 'clip'
  | 'upscale'
  | 'screenshot'
  | 'analyze'
  | 'subtitle-remove'
  | 'audio-separation';
export type LinghuiNodeViewMode = 'collapsed' | 'light' | 'immersive';
export type LinghuiMultiAngleAzimuth = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;
export type LinghuiMultiAngleElevation = -30 | 0 | 30 | 60;
export type LinghuiMultiAngleDistance = 0.6 | 1 | 1.8;
export type LinghuiMultiAnglePromptProtocol = 'sks-camera-v1' | 'descriptor-only-v1';
export type LinghuiMultiAngleMode = 'object' | 'camera';
export type LinghuiMultiAnglePresetKey =
  | 'custom'
  | 'fisheye'
  | 'tilted'
  | 'front-down'
  | 'front-up'
  | 'panoramic-down'
  | 'back';
export type LinghuiRelightDirection =
  | 'front'
  | 'front-right'
  | 'right'
  | 'back-right'
  | 'back'
  | 'back-left'
  | 'left'
  | 'front-left'
  | 'high-front'
  | 'high-front-right'
  | 'high-right'
  | 'high-back-right'
  | 'high-back'
  | 'high-back-left'
  | 'high-left'
  | 'high-front-left'
  | 'low-front'
  | 'low-front-right'
  | 'low-right'
  | 'low-back-right'
  | 'low-back'
  | 'low-back-left'
  | 'low-left'
  | 'low-front-left'
  | 'top'
  | 'bottom';
export type LinghuiNodeToolState =
  | { kind: 'image'; nodeId: string; tool: LinghuiImageToolKey }
  | { kind: 'video'; nodeId: string; tool: LinghuiVideoToolKey }
  | null;

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
}

export interface LinghuiExecuteMultiAngleOptions {
  ttiSelection?: string;
  multiAngle?: Partial<LinghuiMultiAngleConfig>;
  label?: string;
}

// --- 视频节点 ---

export type LinghuiVideoCapability = VideoGenerationCapability;

/**
 * 视频节点模式：对齐 LibTV 节点分流。
 * - 'import'  → 视频参考节点：只回放上传的视频，不暴露 prompt / 模型 / 生成按钮。
 * - 'generate' → 视频生成器节点：走 itvSelection + capability + prompt 链路。
 * 缺省（旧节点）仍按"有 source 就当 pass-through"兼容。
 */
export type LinghuiVideoNodeMode = 'import' | 'generate';

/**
 * LibTV VideoNode 6 状态机派生视图（chunk 15gvxu:191642-191652）：
 *   generating / generating_with_content / failed / resource / pending / empty_generate
 * - generating(_with_content)：taskInfo.loading；有 poster/snapshot 时走 _with_content
 * - failed：taskInfo 失败
 * - resource：有 url[0]（已有视频）
 * - pending：generate 模式、无 url、但已有上游连入，等待上游产出
 * - empty_generate：默认（无 url + 无上游 + 非 import）
 *
 * 灵绘合并 generating 与 generating_with_content 为单一 generating（已有 poster 走 poster
 * 不闪屏的逻辑由组件内部处理）。
 */
export type LinghuiVideoNodeViewState =
  | 'generating'
  | 'failed'
  | 'resource'
  | 'pending'
  | 'empty_generate';

export interface LinghuiVideoNodeProperties extends LinghuiScriptDerivedProperties {
  prompt: string;
  itvSelection: string;
  source: string;
  posterSource: string;
  videoCapability: LinghuiVideoCapability;
  aspectRatio: string;
  resolution: string;
  duration: number;
  /** 'import' 时视频节点是纯参考素材；'generate'（默认）才暴露 prompt + 生成按钮。 */
  mode?: LinghuiVideoNodeMode;
}

// --- 3D 导演工作台节点 ---

/**
 * 场景物件类型：
 * - mannequin：可摆姿势的主角假人，全套头/躯干/四肢，唯一持有 posePreset 字段
 * - mannequin-lite：单个低级群演占位（独立可拖拽），简化为胶囊形，用作普通群演
 * - formation：整体方阵（rows × cols 个胶囊小人，整体可移动旋转，不可单独拆移），
 *   元数据存在 actor.formation 字段
 * - prop-box / prop-cylinder / prop-plane：基础几何辅助构图（桌椅/桶/墙板等占位）
 * - prop-camera：相机模型，标注次要机位 / OTS 参考点
 * - prop-arrow：方向箭头，标注运动轨迹 / 视线
 */
export type LinghuiDirector3DActorType =
  | 'mannequin'
  | 'mannequin-lite'
  | 'formation'
  | 'creature'
  | 'prop-box'
  | 'prop-cylinder'
  | 'prop-plane'
  | 'prop-camera'
  | 'prop-arrow';

/**
 * 动物 / 玄幻生物子类型（actor.type='creature' 时使用）。
 * 详见 director3d/director3dCreature.ts。
 */
export type LinghuiDirector3DCreatureSpecies =
  | 'lion' | 'wolf' | 'tiger' | 'bear' | 'horse' | 'eagle'
  | 'dragon' | 'phoenix' | 'qilin' | 'fox' | 'deer' | 'crane';

export type LinghuiDirector3DCreatureAction =
  | 'idle' | 'walk' | 'run' | 'pounce' | 'fly' | 'roar';

export interface LinghuiDirector3DCreatureRig {
  spine: [number, number, number];
  neck: [number, number, number];
  frontLeftLeg: [number, number, number];
  frontRightLeg: [number, number, number];
  rearLeftLeg: [number, number, number];
  rearRightLeg: [number, number, number];
  tail: [number, number, number];
}

/**
 * 方阵元数据（actor.type === 'formation' 时使用）。
 * actor.position 是方阵的几何中心，actor.rotationY 是整体朝向；
 * 方阵内的每个小人位置由 rows/cols/spacing 派生，不存储独立坐标。
 */
export interface LinghuiDirector3DFormationConfig {
  rows: number;
  cols: number;
  spacing: number;
  /**
   * 方阵内部成员的相对朝向：
   *  - forward：全部朝向方阵正前方（与 actor.rotationY 一致）
   *  - away：全部背对方阵正前方
   *  - inward：面朝方阵几何中心
   *  - outward：背朝方阵几何中心
   */
  memberFacing: 'forward' | 'away' | 'inward' | 'outward';
}

export type LinghuiDirector3DActorGroupRole =
  | 'rider'
  | 'mount'
  | 'passenger'
  | 'carrier'
  | 'linked';

export type LinghuiDirector3DActorPose =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit'
  | 'wave'
  | 'point';
export type LinghuiDirector3DBackgroundMode = 'none' | 'color' | 'image-plane' | 'panorama';
export type LinghuiDirector3DRenderMode = 'preview' | 'lineart' | 'silhouette' | 'depth' | 'composition';

export interface LinghuiDirector3DActor {
  id: string;
  label: string;
  type: LinghuiDirector3DActorType;
  /** 世界坐标 [x,y,z]，y=0 为地面，单位米 */
  position: [number, number, number];
  /** 绕 Y 轴朝向，弧度 */
  rotationY: number;
  /** 整体缩放，1.0 = 默认身高 1.75m */
  scale: number;
  /** 颜色（参考图区分用），CSS 颜色串 */
  color: string;
  posePreset: LinghuiDirector3DActorPose;
  /**
   * 轻量实体组合标识。组合成员仍保存世界绝对坐标，编辑器层根据 groupId
   * 做移动 / 旋转联动，避免 nested transform 破坏导出、关键帧和老场景。
   */
  groupId?: string;
  /** 组合内角色，例如 rider / mount；用于 UI 与 prompt 描述。 */
  groupRole?: LinghuiDirector3DActorGroupRole;
  /** 组合显示名，例如“人骑马”。 */
  groupLabel?: string;
  /**
   * 骨骼姿态（rig）。仅 type='mannequin' 时有意义。
   * 每个关节存局部欧拉角（XYZ，弧度）。详见 director3d/director3dRig.ts。
   * 不存在时回退 RIG_PRESETS[posePreset]，保持老 scene 向后兼容。
   * 关键帧 / timeline 之间可按关节线性插值，做连续骨骼动画。
   */
  rig?: LinghuiDirector3DRig;
  /** 方阵元数据，仅 type='formation' 时存在 */
  formation?: LinghuiDirector3DFormationConfig;
  /** 生物子类型（仅 type='creature' 时存在） */
  species?: LinghuiDirector3DCreatureSpecies;
  /** 生物当前动作（仅 type='creature' 时使用，离散切换） */
  creatureAction?: LinghuiDirector3DCreatureAction;
  /** 生物骨架姿态（仅 type='creature' 时使用，关节级 LERP 动画） */
  creatureRig?: LinghuiDirector3DCreatureRig;
  /**
   * 参考图（koma-local URL 数组）。从全局资产库加入场景时一次性 snapshot 复制过来；
   * director3d executor 把所有 actor 的参考图聚合后写入 result.items，
   * 让下游图片节点直接拿到真实视觉指引（角色脸 / 服装 / 道具样式）。
   */
  referenceImages?: string[];
  /** 来自哪个全局资产 id（弱引用，用于未来同步更新） */
  sourceGlobalAssetId?: string;
}

/**
 * 骨骼绑定（rig）。每个关节为局部欧拉角 [x,y,z]，单位弧度。
 * 渲染时 Mannequin 组件把这些值挂到对应的 group rotation 上；
 * 时间轴插值时关节角度独立 LERP，做连续骨骼动画。
 *
 * 关节命名：
 *  - spine：躯干前后倾 / 转
 *  - neck：头部俯仰 / 转
 *  - left/right shoulder：肩关节
 *  - left/right elbow：肘关节（前臂）
 *  - left/right hip：髋关节
 *  - left/right knee：膝关节（小腿）
 */
export interface LinghuiDirector3DRig {
  spine: [number, number, number];
  neck: [number, number, number];
  leftShoulder: [number, number, number];
  rightShoulder: [number, number, number];
  leftElbow: [number, number, number];
  rightElbow: [number, number, number];
  leftHip: [number, number, number];
  rightHip: [number, number, number];
  leftKnee: [number, number, number];
  rightKnee: [number, number, number];
}

export interface LinghuiDirector3DCamera {
  position: [number, number, number];
  /** LookAt 目标点 */
  target: [number, number, number];
  /** 视场角，单位度 */
  fov: number;
  /** 倾斜（roll），单位度 */
  roll: number;
  aspectRatio: string;
}

export interface LinghuiDirector3DBackground {
  mode: LinghuiDirector3DBackgroundMode;
  /** image-plane 模式下的图片 URL */
  source?: string;
  /** panorama 模式下绑定的上游全景节点 id（运行时按其结果贴几何） */
  sourceNodeId?: string;
  /** 投影模式（panorama 模式下决定贴圆柱/球带/球体） */
  projectionMode?: LinghuiPanoramaProjectionMode;
  /** 纯色背景（color 模式） */
  color?: string;
  /** 全景背景的 yaw 偏移，弧度 */
  yawOffset?: number;
}

export interface LinghuiDirector3DScene {
  version: 1;
  background: LinghuiDirector3DBackground;
  camera: LinghuiDirector3DCamera;
  actors: LinghuiDirector3DActor[];
  render: {
    mode: LinghuiDirector3DRenderMode;
    showGrid: boolean;
    showCameraFrame: boolean;
    transparentBackground: boolean;
    /**
     * 用户最近应用的摄影机预设 id 列表（最新在前，保留最多 3 个）。
     * 这些预设的 english 会拼进 directorPromptFragment 让下游 AI 看到镜头术语。
     */
    lastCameraPresetIds?: string[];
  };
  /** 时间轴（关键帧 + 补间）。空时表示静态镜头。 */
  timeline?: LinghuiDirector3DTimeline;
}

/**
 * 时间轴关键帧：在时间轴某个时间点上的 scene 快照。
 * 不存 render 模式 —— 整个 timeline 共享一套渲染设置。
 *
 * actor 字段拆成"连续可插值"和"离散切换"：
 *  - 连续：position / rotationY / scale → 在两 keyframe 间线性 / 短弧插值
 *  - 离散：posePreset / color / formation.rows/cols/memberFacing → 在 alpha>=0.5 时切换
 *  - 半连续：formation.spacing → 线性插值（间距感受连续）
 */
export interface LinghuiDirector3DKeyframeActor {
  id: string;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  /** 假人姿势（mannequin 才有意义）；alpha>=0.5 时切到 next 的值 */
  posePreset?: LinghuiDirector3DActorPose;
  /**
   * 骨骼姿态。两个关键帧都存在 rig 时按关节线性插值，做连续动画；
   * 单边缺失时按"中立站立"补齐再插值。详见 director3d/director3dRig.ts。
   */
  rig?: LinghuiDirector3DRig;
  /** 颜色；alpha>=0.5 时切换 */
  color?: string;
  /** 方阵参数（仅 type='formation' 时有效）；rows/cols/memberFacing 离散切换，spacing 线性 */
  formation?: LinghuiDirector3DFormationConfig;
  /** 生物动作（仅 type='creature'）；离散切换 */
  creatureAction?: LinghuiDirector3DCreatureAction;
  /** 生物骨架；关节级 LERP 动画 */
  creatureRig?: LinghuiDirector3DCreatureRig;
}

/**
 * 关键帧"作用域"：
 *  - 'scene'（默认 / 旧数据兼容）：整场快照，同时插值 camera + 所有 actors
 *  - 'camera'：仅记录相机参数，actor 字段忽略，时间轴专属 camera 轨
 *  - `actor:${actorId}`：仅记录该 actor 的快照，camera 忽略
 *
 * 插值时同一 actor 只从 scope='scene' 或 scope='actor:{id}' 的关键帧里取值，
 * 相机只从 scope='scene' 或 scope='camera' 的关键帧里取值。
 */
export type LinghuiDirector3DKeyframeScope = 'scene' | 'camera' | `actor:${string}`;

export interface LinghuiDirector3DKeyframe {
  id: string;
  /** 关键帧时间（秒） */
  time: number;
  label?: string;
  /**
   * 作用域；缺省视为 'scene'（兼容旧数据）。新版自动加帧只生成 'camera' / 'actor:xxx' 范围。
   */
  scope?: LinghuiDirector3DKeyframeScope;
  /** 该时刻所有 actor 的状态快照（按 actor.id 索引）；未列出的 actor 表示不存在 / 不渲染 */
  actors: LinghuiDirector3DKeyframeActor[];
  /** 该时刻相机参数（完整复用 LinghuiDirector3DCamera） */
  camera: LinghuiDirector3DCamera;
  /**
   * 相机的"轨道"参数（绕 target 的 yaw 累计弧度 + pitch + distance）。
   *
   * 为什么单独存：camera.position 是 [x,y,z]，绕 360° 后 position 与起点相同，
   * 仅看 position 无法区分"没动"与"转了一圈"。orbit 段记录用户实际累计的 yaw
   * （不取模），插值时优先用 yaw/pitch/distance 线性 lerp 重算 position，
   * 这样用户拍下"720° 环绕"关键帧后，回放能真实地转两圈而不是直接停在起点。
   */
  cameraOrbit?: { yaw: number; pitch: number; distance: number };
  /** 背景（不插值，按 segment 起点取） */
  background?: LinghuiDirector3DBackground;
}

export type LinghuiDirector3DEasing = 'linear' | 'ease-in-out' | 'ease-in' | 'ease-out';

/**
 * 视频导出分辨率档位。数字代表垂直像素数；宽度按当前 scene.camera.aspectRatio 计算
 * （e.g. 720p + 16:9 → 1280×720；1080p + 21:9 → 2520×1080）。
 */
export type LinghuiDirector3DExportResolution = '480p' | '720p' | '1080p' | '1440p' | '2160p';

export interface LinghuiDirector3DTimeline {
  version: 1;
  /** 关键帧列表，必须按 time 升序；UI 写入前会自动 sort */
  keyframes: LinghuiDirector3DKeyframe[];
  /** 总时长（秒），默认 8 */
  duration: number;
  /** 输出帧率，默认 24 */
  fps: number;
  /** 补间缓动 */
  easing: LinghuiDirector3DEasing;
  /** 时间轴导出分辨率档位，默认 720p；未设置时按 720p 处理 */
  exportResolution?: LinghuiDirector3DExportResolution;
}

/**
 * 单张额外视角导出：用于"三视图"、"360 环绕九宫格"等批量导出场景。
 *
 * angleViews 不取代主图（lineartDataUrl 仍是主输出，等同于单视角导出）。下游
 * 图片节点会把 lineartDataUrl 作为 result.primary、把 angleViews 同步追加到
 * result.items，让用户用 @ref_xxx__item_N 引用任意一张。
 */
export interface LinghuiDirector3DAngleView {
  id: string;
  label: string;
  /** PNG dataUrl */
  dataUrl: string;
  camera: LinghuiDirector3DCamera;
  renderMode: LinghuiDirector3DRenderMode;
}

export interface LinghuiDirector3DNodeProperties {
  /** 完整 3D 场景描述。会随节点一起持久化。 */
  scene: LinghuiDirector3DScene;
  /** 用户输入的额外说明，编译为 prompt fragment 时拼到末尾。 */
  prompt: string;
  /** 额外视角导出（三视图 / 九宫格等）。空数组 / undefined = 仅有主图。 */
  angleViews?: LinghuiDirector3DAngleView[];
  /** 最近一次批量导出走的是哪个预设，仅作 UI 高亮 */
  lastAngleBatchKind?: 'three-view' | 'orbit-9' | 'custom';
  /**
   * 输出模式：
   *  - 'lineart'（默认）：lineart 单图 / 多视角图集（现行行为）
   *  - 'video'：时间轴渲染出的动画 mp4，作为下游 video / image-to-video 节点的参考
   */
  outputMode?: 'lineart' | 'video';
  /** 时间轴导出后落盘的视频 URL（koma-local://...），仅 outputMode='video' 时使用 */
  timelineVideoUrl?: string;
  /** 时间轴动画首帧 PNG URL（作为下游 video 节点 posterSource / image-to-video 输入） */
  timelineVideoPosterUrl?: string;
  /** 视频元信息：时长 / fps / 帧数（用于下游视频节点 prompt 携带） */
  timelineVideoMeta?: {
    duration: number;
    fps: number;
    frameCount: number;
    width: number;
    height: number;
  };
}

// --- 音频节点 ---

/**
 * 音频节点模式：与视频节点对齐。
 * - 'import'  → 音频参考节点：只承载上传的音频文件，不暴露 prompt / 模型 / 生成按钮。
 * - 'generate' → 音频生成器节点：走 ttsSelection + voiceId + prompt 链路。
 */
export type LinghuiAudioNodeMode = 'import' | 'generate';

export interface LinghuiAudioNodeProperties {
  source: string;
  prompt: string;
  ttsSelection: string;
  voiceId: string;
  /** 'import' 时音频节点是纯参考素材；缺省（旧节点）按 generate 处理。 */
  mode?: LinghuiAudioNodeMode;
}

/**
 * LibTV AudioNode 5 状态机派生视图（chunk 15gvxu:8505-8513）：
 *   generating / failed / resource / pending / empty_generate
 * 与 Text/Image/Video 节点完全同模板。
 */
export type LinghuiAudioNodeViewState =
  | 'generating'
  | 'failed'
  | 'resource'
  | 'pending'
  | 'empty_generate';

/**
 * 对齐 LibTV AudioNode 状态机（chunk 15gvxu:8505-8513）。
 * - 优先级 generating > failed > resource > pending > empty_generate
 * - resource：import 模式 / 有 source / 有 result 主音频
 * - pending：generate + 无音频 + 有上游
 */
export function resolveLinghuiAudioNodeViewState(args: {
  properties: LinghuiAudioNodeProperties;
  result?: LinghuiNodeResult;
  runStatus?: LinghuiRunStatus;
  hasIncomingEdge: boolean;
}): LinghuiAudioNodeViewState {
  const { properties, result, runStatus, hasIncomingEdge } = args;
  if (runStatus === 'running') return 'generating';
  if (runStatus === 'failed') return 'failed';
  const sourceLen = String(properties.source ?? '').trim().length;
  const primary = getLinghuiResultPrimaryMedia(result);
  const resultSourceLen = String(primary?.source ?? '').trim().length;
  if (properties.mode === 'import' || sourceLen > 0 || resultSourceLen > 0) return 'resource';
  if (hasIncomingEdge) return 'pending';
  return 'empty_generate';
}

// --- 通用 ---

export interface LinghuiSlotDef {
  name: string;
  dataType: LinghuiSlotDataType;
}

export interface LinghuiNodeData {
  linghuiType: LinghuiNodeType;
  label: string;
  accent: string;
  background: string;
  viewMode?: LinghuiNodeViewMode;
  properties: Record<string, unknown>;
  inputs: LinghuiSlotDef[];
  outputs: LinghuiSlotDef[];
  active: boolean;
}

export interface LinghuiEdgeData {
  sourceSlotType?: LinghuiSlotDataType;
  targetSlotType?: LinghuiSlotDataType;
}

export interface LinghuiMediaItem {
  kind: 'image' | 'video' | 'audio';
  label?: string;
  source?: string;
  posterSource?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  placeholder?: boolean;
  metadata?: Record<string, unknown>;
}

export type LinghuiImageMediaItem = LinghuiMediaItem & { kind: 'image' };
export type LinghuiVideoMediaItem = LinghuiMediaItem & { kind: 'video' };
export type LinghuiAudioMediaItem = LinghuiMediaItem & { kind: 'audio' };

export function isLinghuiImageMediaItem(item?: LinghuiMediaItem): item is LinghuiImageMediaItem {
  return item?.kind === 'image';
}

export function isLinghuiVideoMediaItem(item?: LinghuiMediaItem): item is LinghuiVideoMediaItem {
  return item?.kind === 'video';
}

export function isLinghuiAudioMediaItem(item?: LinghuiMediaItem): item is LinghuiAudioMediaItem {
  return item?.kind === 'audio';
}

export interface LinghuiStoryboardFrame {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  image?: LinghuiImageMediaItem;
  hiddenUuid?: string;
  shotNumber?: number;
  plotDescription?: string;
  visualDescription?: string;
  characters?: Array<{
    characterName?: string;
    characterDescription?: string;
    characterImageUrl?: string;
  }>;
  videoReference?: {
    startTime?: number;
    endTime?: number;
    referenceFrameImage?: string;
  };
  shotSize?: string;
  characterAction?: string;
  emotion?: string;
  sceneTags?: string;
  lightingAndAtmosphere?: string;
  audioEffects?: string;
  dialogue?: string;
  imageGenerationPrompt?: string;
  videoMotionPrompt?: string;
}

export interface LinghuiNodeResultMetadata {
  description?: string;
  note?: string;
  [key: string]: unknown;
}

export interface LinghuiAgentToolCallTrace {
  kind: 'tool-call';
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LinghuiAgentToolResultTrace {
  kind: 'tool-result';
  toolCallId: string;
  name: string;
  result?: unknown;
  error?: string;
}

export type LinghuiAgentToolTraceEntry = LinghuiAgentToolCallTrace | LinghuiAgentToolResultTrace;

export interface LinghuiAgentExecutionMetadata extends LinghuiNodeResultMetadata {
  mode: 'agent';
  prompt: string;
  systemPrompt: string;
  llmSelection: string;
  enabledTools: string[];
  maxIterations: number;
  observedToolRounds: number;
  finishReason?: string;
  reasoning?: string;
  toolTrace: LinghuiAgentToolTraceEntry[];
  inputTextCount: number;
  inputImageCount: number;
}

export interface LinghuiTextResult {
  kind: 'text';
  text: string;
  metadata?: LinghuiNodeResultMetadata;
}

export interface LinghuiImageResult {
  kind: 'image' | 'shot';
  primary: LinghuiImageMediaItem;
  metadata?: LinghuiNodeResultMetadata;
}

export interface LinghuiImageCollectionResult {
  kind: 'images' | 'grid';
  primary: LinghuiImageMediaItem;
  items: LinghuiImageMediaItem[];
  metadata?: LinghuiNodeResultMetadata;
}

export interface LinghuiVideoResult {
  kind: 'video';
  primary: LinghuiVideoMediaItem;
  metadata?: LinghuiNodeResultMetadata;
}

export interface LinghuiAudioResult {
  kind: 'audio';
  primary: LinghuiAudioMediaItem;
  text?: string;
  metadata?: LinghuiNodeResultMetadata;
}

export interface LinghuiStoryboardResult {
  kind: 'storyboard';
  text: string;
  shots: LinghuiStoryboardFrame[];
  primary?: LinghuiImageMediaItem;
  metadata?: LinghuiNodeResultMetadata;
}

export type LinghuiNodeResult =
  | LinghuiTextResult
  | LinghuiImageResult
  | LinghuiImageCollectionResult
  | LinghuiVideoResult
  | LinghuiAudioResult
  | LinghuiStoryboardResult;

export function isLinghuiImageResult(result?: LinghuiNodeResult): result is LinghuiImageResult {
  return result?.kind === 'image' || result?.kind === 'shot';
}

export function isLinghuiImageCollectionResult(result?: LinghuiNodeResult): result is LinghuiImageCollectionResult {
  return result?.kind === 'images' || result?.kind === 'grid';
}

export function isLinghuiVideoResult(result?: LinghuiNodeResult): result is LinghuiVideoResult {
  return result?.kind === 'video';
}

export function isLinghuiAudioResult(result?: LinghuiNodeResult): result is LinghuiAudioResult {
  return result?.kind === 'audio';
}

export function isLinghuiStoryboardResult(result?: LinghuiNodeResult): result is LinghuiStoryboardResult {
  return result?.kind === 'storyboard';
}

export function isLinghuiTextResult(result?: LinghuiNodeResult): result is LinghuiTextResult {
  return result?.kind === 'text';
}

export function getLinghuiResultPrimaryMedia(result?: LinghuiNodeResult): LinghuiMediaItem | undefined {
  if (
    isLinghuiImageResult(result) ||
    isLinghuiImageCollectionResult(result) ||
    isLinghuiVideoResult(result) ||
    isLinghuiAudioResult(result)
  ) {
    return result.primary;
  }

  if (isLinghuiStoryboardResult(result)) {
    return result.primary;
  }

  return undefined;
}

export function getLinghuiResultItems(result?: LinghuiNodeResult): LinghuiMediaItem[] {
  return isLinghuiImageCollectionResult(result) ? result.items : [];
}

export function getLinghuiResultShots(result?: LinghuiNodeResult): LinghuiStoryboardFrame[] {
  return isLinghuiStoryboardResult(result) ? result.shots : [];
}

export function getLinghuiResultText(result?: LinghuiNodeResult): string | undefined {
  if (isLinghuiTextResult(result) || isLinghuiStoryboardResult(result) || isLinghuiAudioResult(result)) {
    return result.text;
  }

  return undefined;
}

export function getLinghuiResultDescriptionText(result?: LinghuiNodeResult): string | undefined {
  const description = typeof result?.metadata?.description === 'string' ? result.metadata.description.trim() : '';
  if (description) {
    return description;
  }

  const note = typeof result?.metadata?.note === 'string' ? result.metadata.note.trim() : '';
  return note || undefined;
}

export function getLinghuiResultItemCount(result?: LinghuiNodeResult): number {
  return isLinghuiImageCollectionResult(result) ? result.items.length : 0;
}

/**
 * 对齐 LibTV ImageNode 状态机（docs/libtv-imagenode-state-machine.md §2-3）。
 * - 优先级 generating > failed > resource > pending > empty_generate
 * - resource 判定：import 模式 / 有 source / 有 result 主图 / collection 任意 item
 * - pending：generate + 无图 + 已有上游连入
 */
export function resolveLinghuiImageNodeViewState(args: {
  properties: LinghuiImageNodeProperties;
  result?: LinghuiNodeResult;
  runStatus?: LinghuiRunStatus;
  hasIncomingEdge: boolean;
  /** 派生标记：collection.items 是否非空（由 caller 用 resolveLinghuiImageCollection 算好传入，避免 types 模块反向依赖）。 */
  hasCollectionItems?: boolean;
}): LinghuiImageNodeViewState {
  const { properties, result, runStatus, hasIncomingEdge, hasCollectionItems } = args;
  if (runStatus === 'running') return 'generating';
  if (runStatus === 'failed') return 'failed';
  const sourceLen = String(properties.source ?? '').trim().length;
  const primary = getLinghuiResultPrimaryMedia(result);
  const resultSourceLen = String(primary?.source ?? '').trim().length;
  if (properties.mode === 'import' || sourceLen > 0 || resultSourceLen > 0 || hasCollectionItems) {
    return 'resource';
  }
  if (hasIncomingEdge) return 'pending';
  return 'empty_generate';
}

/**
 * 对齐 LibTV VideoNode 状态机（chunk 15gvxu:191642-191652）。
 * - 优先级 generating > failed > resource > pending > empty_generate
 * - import 模式直接走 resource（与 LibTV VIDEO_RESOURCE 一致；纯参考节点不会进 empty/pending）
 * - resource 判定：有 source / 有 result primary 媒体 / mode==='import'
 * - pending：generate 模式 + 无 content + 已有上游连入
 */
export function resolveLinghuiVideoNodeViewState(args: {
  properties: LinghuiVideoNodeProperties;
  result?: LinghuiNodeResult;
  runStatus?: LinghuiRunStatus;
  hasIncomingEdge: boolean;
}): LinghuiVideoNodeViewState {
  const { properties, result, runStatus, hasIncomingEdge } = args;
  if (runStatus === 'running') return 'generating';
  if (runStatus === 'failed') return 'failed';
  const sourceLen = String(properties.source ?? '').trim().length;
  const primary = getLinghuiResultPrimaryMedia(result);
  const resultSourceLen = String(primary?.source ?? '').trim().length;
  if (properties.mode === 'import' || sourceLen > 0 || resultSourceLen > 0) return 'resource';
  if (hasIncomingEdge) return 'pending';
  return 'empty_generate';
}

/**
 * 对齐 LibTV TextNode 状态机（15gvxu:55066-55074）。
 * - 优先级 generating > failed > resource > pending > empty_generate
 * - resource 同时覆盖 LibTV `TEXT_RESOURCE` action（mode='manual'）：即使无 content 也走 resource，让"请编写内容"占位显示
 * - pending：generate 模式下、无 content 但已经有上游连入，等待上游产出
 */
export function resolveLinghuiTextNodeViewState(args: {
  properties: LinghuiTextNodeProperties;
  result?: LinghuiNodeResult;
  runStatus?: LinghuiRunStatus;
  hasIncomingEdge: boolean;
}): LinghuiTextNodeViewState {
  const { properties, result, runStatus, hasIncomingEdge } = args;
  if (runStatus === 'running') return 'generating';
  if (runStatus === 'failed') return 'failed';
  const contentLen = (properties.content ?? '').trim().length;
  const resultText = (getLinghuiResultText(result) ?? '').trim();
  if (properties.mode === 'manual' || contentLen > 0 || resultText.length > 0) return 'resource';
  if (hasIncomingEdge) return 'pending';
  return 'empty_generate';
}

export interface LinghuiNodeRunState {
  status: LinghuiRunStatus;
  message?: string;
  error?: string;
  progress?: number;
  startedAt?: number;
  updatedAt?: number;
  result?: LinghuiNodeResult;
  upstreamIds?: string[];
}

export interface LinghuiExecutionLogEntry {
  id: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  nodeId?: string;
  createdAt: number;
}

export type LinghuiExecutionQueueStatus =
  | 'idle'
  | 'running'
  | 'canceling'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface LinghuiExecutionQueueState {
  status: LinghuiExecutionQueueStatus;
  total: number;
  targetNodeIds: string[];
  queuedNodeIds: string[];
  runningNodeIds: string[];
  runningNodeId?: string;
  completedNodeIds: string[];
  failedNodeIds: string[];
  canceledNodeIds: string[];
  startedAt?: number;
  updatedAt?: number;
}

export interface LinghuiViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface LinghuiRFNodeSnapshot {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: LinghuiNodeData;
  width?: number;
  height?: number;
  parentId?: string;
}

export interface LinghuiRFEdgeSnapshot {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  type?: string;
  data?: LinghuiEdgeData;
}

export interface LinghuiRFGroupSnapshot {
  id: string;
  position: { x: number; y: number };
  data: LinghuiCanvasGroupData;
  style: { width: number; height: number };
}

export interface LinghuiCanvasGroupData {
  label: string;
  color: string;
  collapsed?: boolean;
  sourceScriptNodeId?: string;
  storyboardTitle?: string;
  storyboardGroupType?: 'image' | 'video' | string;
  standaloneStoryboardImageGrid?: boolean;
  childNodeIds?: string[];
  storyboardManualGridCols?: number;
  storyboardManualGridRows?: number;
  showStoryboardShotNumbers?: boolean;
}

export interface LinghuiSubgraphSnapshot {
  nodes: LinghuiRFNodeSnapshot[];
  edges: LinghuiRFEdgeSnapshot[];
  groups: LinghuiRFGroupSnapshot[];
}

export interface LinghuiGraphSnapshot extends LinghuiSubgraphSnapshot {
  version: number;
}

export interface LinghuiGraphStats {
  nodeCount: number;
  linkCount: number;
  groupCount: number;
}

export interface LinghuiWorkspaceMeta {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  nodeCount: number;
  linkCount: number;
  groupCount: number;
}

export interface LinghuiWorkspaceDocument extends LinghuiWorkspaceMeta {
  viewport: LinghuiViewportState;
  graphData: LinghuiGraphSnapshot;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  executionLogs: LinghuiExecutionLogEntry[];
  /**
   * 3D 导演节点 → 预览节点 的绑定。
   * key 是 director3d nodeId，value 是被绑定用作 split-view 预览源的下游
   * image/video 节点 id。导演台 HUD 内的"实时预览窗"按这里取数。
   * 跨会话持久化，让用户重新打开工作区还能看到原来的绑定关系。
   */
  directorPreviewBindings?: Record<string, string>;
}

export interface LinghuiNodeCatalogItem {
  id?: string;
  type: LinghuiNodeType;
  label: string;
  description: string;
  category: LinghuiNodeCategory;
  accent: string;
  nodeLabel?: string;
  initialProperties?: Record<string, unknown>;
  recommendation?: string;
  targetSlotName?: string;
  targetSlotType?: LinghuiSlotDataType;
}

export interface LinghuiExecutionContext {
  nodes: LinghuiRFNodeSnapshot[];
  edges: LinghuiRFEdgeSnapshot[];
  nodeOutputs: Record<string, LinghuiNodeResult>;
  settingsSnapshot?: AppSettings;
}

export type LinghuiCanvasSelection =
  | { kind: 'node'; nodeId: string; nodeType: LinghuiNodeType; label: string }
  | { kind: 'group'; groupId: string; label: string }
  | null;

export const DEFAULT_LINGHUI_VIEWPORT: LinghuiViewportState = {
  x: 0,
  y: 0,
  zoom: 1,
};

export const EMPTY_LINGHUI_GRAPH: LinghuiGraphSnapshot = {
  version: 2,
  nodes: [],
  edges: [],
  groups: [],
};

export const EMPTY_LINGHUI_NODE_RUNS: Record<string, LinghuiNodeRunState> = {};
export const EMPTY_LINGHUI_EXECUTION_LOGS: LinghuiExecutionLogEntry[] = [];

export const DEFAULT_LINGHUI_WORKSPACE_NAME = '未命名灵绘';

const LINGHUI_TYPE_TO_RF_TYPE_MAP: Record<LinghuiNodeType, LinghuiRFNodeTypeKey> = {
  'linghui/text': 'linghui-text',
  'linghui/agent': 'linghui-agent',
  'linghui/image': 'linghui-image',
  'linghui/panorama': 'linghui-panorama',
  'linghui/video': 'linghui-video',
  'linghui/audio': 'linghui-audio',
  'linghui/script': 'linghui-script',
  'linghui/storyboard': 'linghui-storyboard',
  'linghui/director3d': 'linghui-director3d',
  'linghui/image-grid-slice': 'linghui-image-grid-slice',
  'linghui/video-clip': 'linghui-video-clip',
};

const RF_TYPE_TO_LINGHUI_TYPE_MAP: Record<LinghuiRFNodeTypeKey, LinghuiNodeType> = {
  'linghui-text': 'linghui/text',
  'linghui-agent': 'linghui/agent',
  'linghui-image': 'linghui/image',
  'linghui-panorama': 'linghui/panorama',
  'linghui-video': 'linghui/video',
  'linghui-audio': 'linghui/audio',
  'linghui-script': 'linghui/script',
  'linghui-storyboard': 'linghui/storyboard',
  'linghui-director3d': 'linghui/director3d',
  'linghui-image-grid-slice': 'linghui/image-grid-slice',
  'linghui-video-clip': 'linghui/video-clip',
};

/** 旧持久化迁移：linghui-image-generator → linghui-image (mode=generate)。下游 normalize 时同步处理 properties.mode。 */
const LEGACY_RF_TYPE_MIGRATION: Record<string, LinghuiNodeType> = {
  'linghui-image-generator': 'linghui/image',
};

export function linghuiTypeToRFType(type: LinghuiNodeType): LinghuiRFNodeTypeKey {
  return LINGHUI_TYPE_TO_RF_TYPE_MAP[type];
}

export function rfTypeToLinghuiType(rfType: string): LinghuiNodeType {
  return RF_TYPE_TO_LINGHUI_TYPE_MAP[rfType as LinghuiRFNodeTypeKey]
    ?? LEGACY_RF_TYPE_MIGRATION[rfType]
    ?? 'linghui/text';
}

// 宫格尺寸映射
export function gridTypeToCount(gridType: LinghuiGridType): number {
  switch (gridType) {
    case '2x2': return 4;
    case '3x3': return 9;
    case '4x4': return 16;
    case '5x5': return 25;
    default: return 1;
  }
}

export const IMAGE_ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '4:3', value: '4:3' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '21:9', value: '21:9' },
];

export const IMAGE_RESOLUTIONS = [
  { label: '自适应', value: 'auto' },
  { label: '1K', value: '1K' },
  { label: '2K', value: '2K' },
  { label: '4K', value: '4K' },
];

export const GRID_TYPES: Array<{ label: string; value: LinghuiGridType }> = [
  { label: '单图', value: 'none' },
  { label: '4宫格 (2×2)', value: '2x2' },
  { label: '9宫格 (3×3)', value: '3x3' },
  { label: '16宫格 (4×4)', value: '4x4' },
  { label: '25宫格 (5×5)', value: '5x5' },
];

export const LINGHUI_IMAGE_BATCH_COUNTS = [1, 2, 3, 4] as const;
export const DEFAULT_LINGHUI_MULTI_ANGLE_ENDPOINT = '/v1/images/multi-angle';

export const DEFAULT_LINGHUI_IMAGE_FOCUS_REGION: LinghuiImageFocusRegion = {
  enabled: true,
  x: 0.28,
  y: 0.22,
  width: 0.44,
  height: 0.42,
};

function clampLinghuiFocusUnit(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
}

export function normalizeLinghuiImageFocusRegion(
  region?: Partial<LinghuiImageFocusRegion> | null,
): LinghuiImageFocusRegion | null {
  if (!region || typeof region !== 'object') {
    return null;
  }

  const fallback = DEFAULT_LINGHUI_IMAGE_FOCUS_REGION;
  const width = Math.max(0.08, Math.min(1, clampLinghuiFocusUnit(region.width, fallback.width)));
  const height = Math.max(0.08, Math.min(1, clampLinghuiFocusUnit(region.height, fallback.height)));
  const x = Math.max(0, Math.min(1 - width, clampLinghuiFocusUnit(region.x, fallback.x)));
  const y = Math.max(0, Math.min(1 - height, clampLinghuiFocusUnit(region.y, fallback.y)));
  const source = String(region.source ?? '').trim();
  const label = String(region.label ?? '').trim();
  const updatedAt = Number(region.updatedAt);

  return {
    enabled: region.enabled !== false,
    x,
    y,
    width,
    height,
    ...(source ? { source } : {}),
    ...(label ? { label } : {}),
    ...(Number.isFinite(updatedAt) && updatedAt > 0 ? { updatedAt } : {}),
  };
}

export const LINGHUI_IMAGE_MARK_POINT_LIMIT = 6;

function clampLinghuiMarkUnit(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
}

export function normalizeLinghuiImageMarkPoint(
  point?: Partial<LinghuiImageMarkPoint> | null,
  index = 0,
): LinghuiImageMarkPoint | null {
  if (!point || typeof point !== 'object') {
    return null;
  }

  const id = String(point.id ?? '').trim() || `mark-${index + 1}`;
  const source = String(point.source ?? '').trim();
  const label = String(point.label ?? '').trim();
  const prompt = String(point.prompt ?? '').trim();
  const updatedAt = Number(point.updatedAt);

  return {
    id,
    enabled: point.enabled !== false,
    x: clampLinghuiMarkUnit(point.x, 0.5),
    y: clampLinghuiMarkUnit(point.y, 0.5),
    ...(source ? { source } : {}),
    ...(label ? { label } : {}),
    ...(prompt ? { prompt } : {}),
    ...(Number.isFinite(updatedAt) && updatedAt > 0 ? { updatedAt } : {}),
  };
}

export const LINGHUI_IMAGE_LIGHTING_PRESETS: Array<{
  value: LinghuiImageLightingPreset;
  label: string;
  prompt: string;
}> = [
  { value: 'auto', label: '自动', prompt: '' },
  { value: 'natural', label: '自然光', prompt: 'soft natural daylight' },
  { value: 'softbox', label: '柔光', prompt: 'studio softbox lighting, even diffused light' },
  { value: 'rembrandt', label: '伦勃朗', prompt: 'rembrandt lighting, dramatic triangular cheek light' },
  { value: 'rim', label: '边缘光', prompt: 'rim light hugging the silhouette, separation from background' },
  { value: 'backlight', label: '逆光', prompt: 'strong backlight, silhouette with luminous edge' },
  { value: 'low-key', label: '低调暗调', prompt: 'low-key lighting, deep shadows, single hard key light' },
  { value: 'high-key', label: '高调亮调', prompt: 'high-key lighting, soft shadows, airy bright tones' },
  { value: 'neon', label: '霓虹', prompt: 'neon-lit cyberpunk lighting, magenta and cyan reflections' },
  { value: 'golden-hour', label: '黄金时刻', prompt: 'golden hour warm directional light, long shadows' },
  { value: 'blue-hour', label: '蓝调', prompt: 'blue hour dusk lighting, cool gradient sky' },
];

export const LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS: Array<{
  value: LinghuiImageFocalLengthPreset;
  label: string;
  prompt: string;
}> = [
  { value: 'auto', label: '自动', prompt: '' },
  { value: 'wide-24mm', label: '广角 24mm', prompt: '24mm wide angle perspective, expansive framing' },
  { value: 'standard-50mm', label: '标头 50mm', prompt: '50mm standard lens, natural perspective' },
  { value: 'portrait-85mm', label: '人像 85mm', prompt: '85mm portrait lens, slight background compression' },
  { value: 'tele-135mm', label: '长焦 135mm', prompt: '135mm telephoto compression, isolated subject' },
  { value: 'macro', label: '微距', prompt: 'macro close-up, ultra fine surface detail' },
];

export const LINGHUI_IMAGE_APERTURE_PRESETS: Array<{
  value: LinghuiImageAperturePreset;
  label: string;
  prompt: string;
}> = [
  { value: 'auto', label: '自动', prompt: '' },
  { value: 'shallow-f14', label: '浅景深 f/1.4', prompt: 'shallow depth of field f/1.4, creamy bokeh background' },
  { value: 'medium-f28', label: '中景深 f/2.8', prompt: 'moderate depth of field f/2.8, gently blurred background' },
  { value: 'deep-f8', label: '深景深 f/8', prompt: 'deep depth of field f/8, foreground to background sharp' },
];

export function normalizeLinghuiImageCinematicConfig(
  config?: Partial<LinghuiImageCinematicConfig> | null,
): LinghuiImageCinematicConfig {
  if (!config || typeof config !== 'object') {
    return { ...DEFAULT_LINGHUI_IMAGE_CINEMATIC_CONFIG };
  }
  const lightingValues = new Set(LINGHUI_IMAGE_LIGHTING_PRESETS.map(item => item.value));
  const focalValues = new Set(LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS.map(item => item.value));
  const apertureValues = new Set(LINGHUI_IMAGE_APERTURE_PRESETS.map(item => item.value));
  return {
    lighting: lightingValues.has(config.lighting as LinghuiImageLightingPreset)
      ? (config.lighting as LinghuiImageLightingPreset)
      : 'auto',
    focalLength: focalValues.has(config.focalLength as LinghuiImageFocalLengthPreset)
      ? (config.focalLength as LinghuiImageFocalLengthPreset)
      : 'auto',
    aperture: apertureValues.has(config.aperture as LinghuiImageAperturePreset)
      ? (config.aperture as LinghuiImageAperturePreset)
      : 'auto',
  };
}

/**
 * 把电影感配置编译成英文短语，便于 provider/模型识别。
 * 全部为 'auto' 时返回空串；调用方决定是否拼到 prompt 末尾。
 */
export function buildLinghuiImageCinematicPromptFragment(
  config?: Partial<LinghuiImageCinematicConfig> | null,
): string {
  const normalized = normalizeLinghuiImageCinematicConfig(config);
  const parts: string[] = [];
  const lightingPreset = LINGHUI_IMAGE_LIGHTING_PRESETS.find(item => item.value === normalized.lighting);
  if (lightingPreset && lightingPreset.value !== 'auto' && lightingPreset.prompt) {
    parts.push(lightingPreset.prompt);
  }
  const focalPreset = LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS.find(item => item.value === normalized.focalLength);
  if (focalPreset && focalPreset.value !== 'auto' && focalPreset.prompt) {
    parts.push(focalPreset.prompt);
  }
  const aperturePreset = LINGHUI_IMAGE_APERTURE_PRESETS.find(item => item.value === normalized.aperture);
  if (aperturePreset && aperturePreset.value !== 'auto' && aperturePreset.prompt) {
    parts.push(aperturePreset.prompt);
  }
  return parts.join(', ');
}

export function normalizeLinghuiImageMarkPoints(
  points?: Array<Partial<LinghuiImageMarkPoint> | null> | null,
): LinghuiImageMarkPoint[] {
  if (!Array.isArray(points)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: LinghuiImageMarkPoint[] = [];
  points.forEach((point, index) => {
    const nextPoint = normalizeLinghuiImageMarkPoint(point, index);
    if (!nextPoint || seen.has(nextPoint.id)) {
      return;
    }
    seen.add(nextPoint.id);
    normalized.push(nextPoint);
  });

  return normalized.slice(0, LINGHUI_IMAGE_MARK_POINT_LIMIT);
}

export const LINGHUI_MULTI_ANGLE_AZIMUTHS: Array<{
  value: LinghuiMultiAngleAzimuth;
  label: string;
  prompt: string;
}> = [
  { value: 0, label: '正面', prompt: 'front view' },
  { value: 45, label: '前右 3/4', prompt: 'front-right quarter view' },
  { value: 90, label: '右侧', prompt: 'right side view' },
  { value: 135, label: '后右 3/4', prompt: 'back-right quarter view' },
  { value: 180, label: '背面', prompt: 'back view' },
  { value: 225, label: '后左 3/4', prompt: 'back-left quarter view' },
  { value: 270, label: '左侧', prompt: 'left side view' },
  { value: 315, label: '前左 3/4', prompt: 'front-left quarter view' },
];

export const LINGHUI_MULTI_ANGLE_ELEVATIONS: Array<{
  value: LinghuiMultiAngleElevation;
  label: string;
  prompt: string;
}> = [
  { value: -30, label: '低角度', prompt: 'low-angle shot' },
  { value: 0, label: '平视', prompt: 'eye-level shot' },
  { value: 30, label: '稍高', prompt: 'elevated shot' },
  { value: 60, label: '高角度', prompt: 'high-angle shot' },
];

export const LINGHUI_MULTI_ANGLE_DISTANCES: Array<{
  value: LinghuiMultiAngleDistance;
  label: string;
  prompt: string;
}> = [
  { value: 0.6, label: '特写', prompt: 'close-up' },
  { value: 1, label: '中景', prompt: 'medium shot' },
  { value: 1.8, label: '广角', prompt: 'wide shot' },
];

export const LINGHUI_MULTI_ANGLE_PROMPT_PROTOCOLS: Array<{
  value: LinghuiMultiAnglePromptProtocol;
  label: string;
}> = [
  { value: 'sks-camera-v1', label: 'SKS 相机提示词' },
  { value: 'descriptor-only-v1', label: '纯描述符' },
];

export const DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG: LinghuiMultiAngleConfig = {
  enabled: false,
  mode: 'object',
  rotation: 0,
  tilt: 0,
  scale: 50,
  isWideAngle: false,
  presetKey: 'custom',
  prompt: '',
  promptEnabled: false,
  azimuth: 0,
  elevation: 0,
  distance: 1,
  ttiSelection: '',
  promptProtocol: 'sks-camera-v1',
  endpointPath: DEFAULT_LINGHUI_MULTI_ANGLE_ENDPOINT,
};

export const DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG: LinghuiImageRelightConfig = {
  direction: 'front',
  brightness: 50,
  lightColor: '#ffffff',
  rimLight: false,
  smartMode: false,
  prompt: '',
  referenceImage: null,
  presetId: undefined,
  sceneActive: false,
  brightnessActive: false,
  colorActive: false,
};

function normalizeAzimuth(value: unknown): LinghuiMultiAngleAzimuth {
  return (LINGHUI_MULTI_ANGLE_AZIMUTHS.find(item => item.value === value)?.value ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.azimuth);
}

function normalizeElevation(value: unknown): LinghuiMultiAngleElevation {
  return (LINGHUI_MULTI_ANGLE_ELEVATIONS.find(item => item.value === value)?.value ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.elevation);
}

function normalizeDistance(value: unknown): LinghuiMultiAngleDistance {
  return (LINGHUI_MULTI_ANGLE_DISTANCES.find(item => item.value === value)?.value ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.distance);
}

function normalizePromptProtocol(value: unknown): LinghuiMultiAnglePromptProtocol {
  return (
    LINGHUI_MULTI_ANGLE_PROMPT_PROTOCOLS.find(item => item.value === value)?.value
    ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.promptProtocol
  );
}

function normalizeMultiAngleMode(value: unknown): LinghuiMultiAngleMode {
  return value === 'camera' || value === 'object'
    ? value
    : DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.mode;
}

function normalizeMultiAnglePresetKey(value: unknown): LinghuiMultiAnglePresetKey {
  return (
    value === 'fisheye'
    || value === 'tilted'
    || value === 'front-down'
    || value === 'front-up'
    || value === 'panoramic-down'
    || value === 'back'
    || value === 'custom'
  )
    ? value
    : 'custom';
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function rotationToAzimuth(value: number): LinghuiMultiAngleAzimuth {
  const normalized = ((Math.round(value / 45) * 45) % 360 + 360) % 360;
  return normalizeAzimuth(normalized);
}

function tiltToElevation(value: number): LinghuiMultiAngleElevation {
  const snapped = Math.max(-30, Math.min(60, Math.round(value / 30) * 30));
  return normalizeElevation(snapped);
}

function scaleToDistance(value: number): LinghuiMultiAngleDistance {
  if (value <= 25) return 1.8;
  if (value >= 75) return 0.6;
  return 1;
}

function distanceToScale(value: LinghuiMultiAngleDistance): number {
  if (value === 0.6) return 100;
  if (value === 1.8) return 0;
  return 50;
}

export function normalizeLinghuiMultiAngleConfig(
  value: Partial<LinghuiMultiAngleConfig> | null | undefined,
): LinghuiMultiAngleConfig {
  const hasRotation = typeof value?.rotation === 'number';
  const hasTilt = typeof value?.tilt === 'number';
  const hasScale = typeof value?.scale === 'number';
  const azimuth = normalizeAzimuth(value?.azimuth);
  const elevation = normalizeElevation(value?.elevation);
  const distance = normalizeDistance(value?.distance);
  const rotation = clampNumber(
    hasRotation ? value?.rotation : azimuth,
    DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.rotation,
    -360,
    360,
  );
  const tilt = clampNumber(
    hasTilt ? value?.tilt : elevation,
    DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.tilt,
    -90,
    90,
  );
  const scale = clampNumber(
    hasScale ? value?.scale : distanceToScale(distance),
    DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.scale,
    0,
    100,
  );

  return {
    enabled: value?.enabled === true,
    mode: normalizeMultiAngleMode(value?.mode),
    rotation,
    tilt,
    scale,
    isWideAngle: value?.isWideAngle === true,
    presetKey: normalizeMultiAnglePresetKey(value?.presetKey),
    prompt: String(value?.prompt ?? '').trim(),
    promptEnabled: value?.promptEnabled === true,
    azimuth: hasRotation ? rotationToAzimuth(rotation) : azimuth,
    elevation: hasTilt ? tiltToElevation(tilt) : elevation,
    distance: hasScale ? scaleToDistance(scale) : distance,
    ttiSelection: String(value?.ttiSelection ?? '').trim(),
    promptProtocol: normalizePromptProtocol(value?.promptProtocol),
    endpointPath: String(value?.endpointPath ?? DEFAULT_LINGHUI_MULTI_ANGLE_ENDPOINT).trim() || DEFAULT_LINGHUI_MULTI_ANGLE_ENDPOINT,
  };
}

export function normalizeLinghuiImageRelightConfig(
  value: Partial<LinghuiImageRelightConfig> | null | undefined,
): LinghuiImageRelightConfig {
  const direction = typeof value?.direction === 'string'
    ? value.direction as LinghuiRelightDirection
    : DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG.direction;
  const lightColor = String(value?.lightColor ?? DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG.lightColor).trim();
  return {
    direction,
    brightness: clampNumber(value?.brightness, DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG.brightness, 0, 100),
    lightColor: /^#[0-9a-f]{6}$/i.test(lightColor) ? lightColor : DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG.lightColor,
    rimLight: value?.rimLight === true,
    smartMode: value?.smartMode === true,
    prompt: String(value?.prompt ?? '').trim(),
    referenceImage: value?.referenceImage ? String(value.referenceImage) : null,
    presetId: value?.presetId ? String(value.presetId) : undefined,
    sceneActive: value?.sceneActive === true,
    brightnessActive: value?.brightnessActive === true,
    colorActive: value?.colorActive === true,
  };
}

export const VIDEO_ASPECT_RATIOS = [
  { label: '自动', value: 'adaptive' },
  { label: '16:9', value: '16:9' },
  { label: '4:3', value: '4:3' },
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '9:16', value: '9:16' },
  { label: '21:9', value: '21:9' },
];

export const VIDEO_RESOLUTIONS = [
  { label: '480P', value: '480p' },
  { label: '720P', value: '720p' },
  { label: '1080P', value: '1080p' },
];
