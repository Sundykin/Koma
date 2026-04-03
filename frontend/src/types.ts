import type {
  CharacterMediaSlots,
  MediaOwnerRef,
  PropMediaSlots,
  SceneMediaSlots,
  ShotMediaState,
  ShotVersionMediaState,
  StoredMediaAsset,
} from './types/media';
import type {
  ChannelConfig,
  MediaDefaults,
  MediaModelSelection,
} from './providers/channel/types';

export type {
  MediaKind,
  MediaAssetSource,
  ProviderAssetInput,
  StoredMediaAsset,
  MediaOwnerRef,
  ProviderStartResult,
  ProviderTaskSnapshot,
  VideoGenerationCapability,
  TTIRequest,
  ITVRequest,
  TTSRequest,
  CharacterMediaSlots,
  SceneMediaSlots,
  PropMediaSlots,
  ShotMediaState,
  ShotVersionMediaState,
} from './types/media';
export type {
  ChannelConfig,
  MediaDefaults,
  MediaModelSelection,
} from './providers/channel/types';
export {
  getITVRequestReferenceAssets,
  getMediaAssetDisplaySource,
  getMediaAssetEditingSource,
  getMediaAssetSource,
  isImageToVideoRequest,
  isReferenceToVideoRequest,
  isStartEndToVideoRequest,
  isTextToVideoRequest,
  isBlobUri,
  isDataUri,
  isRemoteMediaUri,
} from './types/media';

export type StylePresetSourceType = 'builtin' | 'custom';

export interface ProjectStyleSnapshot {
  id: string;
  name: string;
  description: string;
  ttiStylePrefix: string;
  llmPromptSuffix: string;
  sourceType: StylePresetSourceType;
  sourcePresetId: string;
  createdAt: number;
}

// 项目接口定义
export interface Project {
  id: string;
  title: string;
  genre: string;     // 题材类型
  mode?: 'drama' | 'narration'; // 叙事模式：剧情模式 | 旁白解说模式
  episodes: number;  // 集数
  lastEdited: string;// 最后编辑时间
  thumbnail: string; // 封面图
  status: 'script' | 'storyboard' | 'generating' | 'completed'; // 项目状态
  mediaSelections?: Partial<Record<'llm' | 'tti' | 'itv' | 'tts', MediaModelSelection>>;
  aspectRatio?: '16:9' | '9:16'; // 项目画面比例（创建时确定，不可更改）
  stylePresetId?: string;   // 选中的全局风格 ID
  styleSnapshot?: ProjectStyleSnapshot; // 项目风格快照
  // @deprecated 遗留字段，仅保留给未改造调用点过渡
  theme?: string;
  // @deprecated 遗留字段，仅保留给未改造调用点过渡
  stylePrompt?: string;
  episodeCount?: number;    // 实际剧集数（用于剧集管理）
}

// 剧集步骤进度 (3步流程: assets → storyboard → video)
export interface EpisodeStepProgress {
  assets: 'pending' | 'completed';
  storyboard: 'pending' | 'completed';
  video: 'pending' | 'completed';
}

// 剧集接口定义
export interface Episode {
  id: string;
  projectId: string;
  number: number;           // 集数编号
  title: string;            // 剧集标题
  scriptText?: string;      // 本集剧本
  status: 'draft' | 'script' | 'storyboard' | 'generating' | 'completed';
  stepProgress?: EpisodeStepProgress;  // 各步骤完成状态
  createdAt: number;
  updatedAt: number;
  // 剧集解析数据引用（实际数据存储在 episodes/{id}/analysis.json）
  hasAnalysis?: boolean;
}

// 剧集解析结果（存储在 episodes/{id}/analysis.json）
export interface EpisodeAnalysis {
  episodeId: string;
  // 引用项目级资产（ID 引用，非复制）
  characterRefs: string[];
  sceneRefs: string[];
  propRefs: string[];
  completedStages?: Array<'characters' | 'scenes' | 'props' | 'shots'>;
  // 剧集特有的分镜
  shots: Shot[];
  createdAt: number;
  updatedAt: number;
}

// 资产引用追踪
export interface EpisodeRef {
  episodeId: string;
  episodeName: string;
  firstAppearance: boolean;
  shotIds?: string[];
}

// 主题预设接口
export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  ttiStylePrefix: string;   // TTI 提示词风格前缀
  llmPromptSuffix: string;  // LLM 提示词风格后缀
  previewImage?: string;    // 预览图
}

// 资产时间戳范围（用于 Sora2 角色提取）
export interface AssetTimestampRange {
  start: number; // 起始时间（秒）
  end: number;   // 结束时间（秒），与 start 间隔不超过 3 秒
}

export type CharacterGender = 'male' | 'female' | 'neutral' | 'unknown';

// 角色接口定义
export interface Character {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting'; // 主角 | 反派 | 配角
  prompt: string;      // 核心视觉提示词

  age?: string;
  gender?: CharacterGender;
  description?: string; 
  appearance?: string;
  
  voiceId?: string;    // TTS 音色 ID
  media?: CharacterMediaSlots; // 结构化媒体槽位
  sora2CharacterId?: string;  // 角色提取API返回的ID
  timestampRange?: AssetTimestampRange; // Sora2 提取时间范围
  // 剧集引用追踪
  episodeRefs?: EpisodeRef[];
  fingerprint?: string;       // 资产指纹（用于去重）
}

// 场景接口定义
export interface Scene {
  id: string;
  name: string;
  prompt: string;     // 核心提示词

  location?: string;
  time?: 'day' | 'night' | 'twilight'; 
  mood?: string;
  description?: string;

  media?: SceneMediaSlots; // 结构化媒体槽位
  // 剧集引用追踪
  episodeRefs?: EpisodeRef[];
  fingerprint?: string;
}

// 道具接口定义
export interface Prop {
  id: string;
  name: string;
  prompt: string;     // 核心提示词

  type?: string;
  description?: string;

  media?: PropMediaSlots; // 结构化媒体槽位
  // Sora2 绑定相关
  sora2PropId?: string;        // Sora2 道具 ID
  timestampRange?: AssetTimestampRange; // Sora2 提取时间范围
  // 剧集引用追踪
  episodeRefs?: EpisodeRef[];
  fingerprint?: string;
}

// 分镜视频版本
export interface ShotVideo {
  path: string;
  url?: string;        // 远程URL
  thumbnailPath?: string;
  prompt?: string;
  seed?: number;
  model?: string;
  asset?: StoredMediaAsset;
  createdAt: number;
}

// 分镜/镜头接口定义
export interface Shot {
  id: string;
  scriptContent: string; // 对应的剧本原文
  shotType: 'close-up' | 'medium' | 'wide' | 'extreme-wide'; // 特写 | 中景 | 全景 | 大全景
  cameraMovement: 'static' | 'pan' | 'zoom-in' | 'tracking' | 'handheld'; // 固定 | 摇镜 | 推镜 | 跟随 | 手持
  duration: number;      // 持续时长(秒)
  imagePrompt?: string;  // 图片生成提示词
  videoPrompt?: string;  // 视频生成提示词
  imageMode?: 'normal' | 'grid'; // 图片生成模式：普通模式 | 九宫格模式（默认 normal）
  media?: ShotMediaState; // 结构化媒体槽位
  // 关联资产
  characters: string[];  // 涉及的角色ID
  scenes?: string[];     // 涉及的场景ID（可在 UI 中编辑）
  dialogue?: string;     // 台词（用于 TTS）
  emotion?: string;      // 情绪标签
  props?: string[];      // 涉及的道具ID
  confirmed?: boolean;   // 是否已确认（用于入轨）
  seed?: number;         // 生成种子（用于复现）
  currentVersion?: number; // 当前版本号（兼容旧数据）
}

// 剧本分析结果接口
export interface ScriptAnalysisResult {
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  shots: Shot[];
}

// 编辑器当前的步骤状态 (3步流程)
export type EditorStep = 'assets' | 'storyboard' | 'video';

// ========== 模型设置相关类型 ==========

export type ModelProviderType = 'gemini' | 'openai' | 'openai-compatible' | 'claude' | 'runway' | 'midjourney' | 'comfyui';
export type LLMProviderType = 'openai-compatible' | 'gemini' | 'claude';
// 扩展支持插件动态类型
export type TTIProviderType =
  | 'comfyui' | 'jimeng' | 'qwen-image' | 'midjourney' | 'dall-e' | 'flux' | 'nano-banana' | 'gemini-3-pro' | 'gemini-native-tti' | 'openai-compatible-tti' | 'grok2api-imagine-tti'
  | (string & { __ttiPlugin?: never });
export type ITVProviderType =
  | 'runway' | 'kling' | 'pika' | 'minimax' | 'comfyui-animatediff' | 'sora2' | 'vidu' | 'seedance' | 'custom' | 'grok2api-imagine-itv'
  | (string & { __itvPlugin?: never });
export type TTSProviderType =
  | 'edge-tts' | 'openai-tts' | 'fish-audio' | 'gpt-sovits' | 'doubao-tts'
  | (string & { __ttsPlugin?: never });

// 通用媒体配置基类
export interface MediaProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  /**
   * Optional prompt compilation protocol.
   * When set, MediaGenerationService may compile prompt + align reference arrays before provider.start().
   */
  promptProtocol?: 'grok-image-index';
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// TTI 配置（文生图）
export interface TTIModelConfig extends MediaProviderConfig {
  provider: TTIProviderType;
  workflowPath?: string;           // ComfyUI 工作流文件路径
  workflowMapping?: Record<string, string>; // 节点映射 { prompt: "node_id", negative: "node_id", ... }
  modelName?: string;
  defaultSize?: string;            // "1024x1024"
  defaultSteps?: number;
}

// ITV 配置（图生视频）
export interface ITVModelConfig extends MediaProviderConfig {
  provider: ITVProviderType;
  modelName?: string;
  workflowPath?: string;           // ComfyUI AnimateDiff 工作流
  workflowMapping?: Record<string, string>;
  defaultDuration?: number;        // 默认时长（秒）
  defaultResolution?: string;      // "1280x720"
}

// 解析后的配置类型（区分内置和插件渠道）
export type ResolvedTTIConfig =
  | (TTIModelConfig & { source: 'builtin' })
  | (TTIModelConfig & { source: 'channel'; channelConfig: import('./providers/channel/types').ChannelConfig });

export type ResolvedITVConfig =
  | (ITVModelConfig & { source: 'builtin' })
  | (ITVModelConfig & { source: 'channel'; channelConfig: import('./providers/channel/types').ChannelConfig });

export type ResolvedTTSConfig =
  | (TTSModelConfig & { source: 'builtin' })
  | (TTSModelConfig & { source: 'channel'; channelConfig: import('./providers/channel/types').ChannelConfig });

// TTS 配置（语音合成）
export interface TTSModelConfig extends MediaProviderConfig {
  provider: TTSProviderType;
  modelName?: string;
  defaultVoice?: string;
  defaultSpeed?: number;           // 0.5-2.0
}

// 厂商预设
export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl?: string;
  models?: string[];
}

// LLM 模型配置（新版，支持多模型管理）
export interface LLMModelConfig {
  id: string;
  name: string;                              // 用户自定义名称
  provider: LLMProviderType;
  profileId?: string;
  hasStoredCredential?: boolean;
  baseUrl?: string;                          // API 地址，openai-compatible 必填
  apiKey: string;
  modelName: string;                         // 模型名称
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// OpenAI 兼容渠道预设
export interface LLMChannelPreset {
  id: string;
  name: string;
  baseUrl: string;
  /**
   * Optional suggestion list. Do not rely on this for actual runtime models.
   * Models are maintained per-channel in settings (ChannelConfig.models).
   */
  models?: string[];
}


export interface ModelConfig {
  provider: ModelProviderType;
  profileId?: string;
  hasStoredCredential?: boolean;
  apiKey: string;
  baseUrl?: string;
  modelName: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TTSConfig {
  provider: TTSProviderType;
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  defaultVoice?: string;
}

export interface ITVConfig {
  provider: ITVProviderType;
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
  defaultDuration?: number;  // 默认视频时长（秒）
  defaultResolution?: string; // 默认分辨率
}

export interface AppSettings {
  channelConfigs: ChannelConfig[];
  mediaDefaults?: MediaDefaults;
  promptTemplates?: Record<string, {
    template: string;
    updatedAt: number;
  }>;
  customThemePresets?: ThemePreset[];  // 用户自定义视觉风格预设
  stylePrompts?: { prompt: string; isDefault?: boolean }[];  // 风格提示词列表
}

// ========== 时间线相关类型 ==========

export type MediaType = 'video' | 'audio' | 'image' | 'text' | 'subtitle' | 'sticker';

export type EasingType =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'cubic-bezier';

export interface Keyframe {
  id: string;
  time: number;           // 相对于 clip 起点的时间（毫秒）
  property: string;       // 属性名：position.x, scale, rotation, opacity 等
  value: number;
  easing: EasingType;
  bezierPoints?: [number, number, number, number]; // cubic-bezier 控制点
}

export interface Clip {
  id: string;
  trackId: string;
  type: MediaType;
  name: string;
  startTime: number;      // 在时间线上的起始位置（毫秒）
  duration: number;       // 持续时长（毫秒）
  sourceStart?: number;   // 素材内的起始位置（毫秒）
  sourceDuration?: number;// 素材原始时长（毫秒）
  sourcePath: string;     // 素材文件路径
  thumbnailPath?: string; // 缩略图路径
  // 变换属性
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  opacity: number;
  // 关键帧
  keyframes: Keyframe[];
  // 文字/字幕专用
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'subtitle';
  order?: number;           // 轨道层级顺序
  muted: boolean;
  locked: boolean;
  visible: boolean;
  height: number;         // 轨道显示高度
  clips: Clip[];
}

export interface Timeline {
  id: string;
  duration: number;       // 总时长（毫秒）
  tracks: Track[];
  fps: number;            // 帧率
  resolution: { width: number; height: number };
}

// ========== 素材库类型 ==========

export interface Asset {
  id: string;
  name: string;
  type: MediaType;
  path: string;           // 文件路径
  thumbnailPath?: string;
  duration?: number;      // 视频/音频时长
  size: number;           // 文件大小（字节）
  width?: number;
  height?: number;
  createdAt: number;
  md5?: string;           // 用于去重
  refCount: number;       // 引用计数
}

// ========== 工作流类型 ==========

export type WorkflowType =
  | 'shot-render'         // 分镜渲染：图 → 音 → 视
  | 'batch-render'        // 批量渲染
  | 'script-analysis'     // 剧本分析
  | 'export';             // 导出

export interface WorkflowProgress {
  workflowId: string;
  type: WorkflowType;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;       // 0-100
  currentStep?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// ========== 页面路由 ==========

export type AppPage =
  | 'projects'            // 项目列表
  | 'editor'              // 编辑器
  | 'settings'            // 设置
  | 'export';             // 导出

// ========== 存储相关类型 ==========

export interface StorageConfig {
  rootPath: string;       // 存储根目录
  version: number;        // 存储格式版本
}

export interface ProjectMeta {
  id: string;
  title: string;
  genre: string;
  mode: 'drama' | 'narration';
  createdAt: number;
  updatedAt: number;
  thumbnailPath?: string;
  mediaSelections?: Partial<Record<'llm' | 'tti' | 'itv' | 'tts', MediaModelSelection>>;
  stylePresetId?: string; // 选中的全局风格 ID
  styleSnapshot?: ProjectStyleSnapshot;
  // @deprecated 遗留字段，仅保留给未改造调用点过渡
  theme?: string;
  // @deprecated 遗留字段，仅保留给未改造调用点过渡
  stylePrompt?: string;
}

export interface RecentProject {
  id: string;
  title: string;
  path: string;
  lastOpened: number;
  thumbnailPath?: string;
}

export interface ShotVersion {
  version: number;
  media?: ShotVersionMediaState; // 结构化媒体槽位
  prompt: string;
  seed: number;
  model: string;
  createdAt: number;
}

export interface ShotMeta {
  id: string;
  prompt: string;
  seed: number;
  model: string;
  currentVersion: number;
  versions: ShotVersion[];
}

export interface CacheInfo {
  type: 'thumbnail' | 'waveform' | 'preview';
  hash: string;
  path: string;
  size: number;
  createdAt: number;
}

// ========== TTS 类型 ==========

export interface Voice {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'neutral' | 'unknown';
  provider: TTSProviderType;
  previewUrl?: string;
}

export interface TTSOptions {
  rate?: number;          // 语速 0.5-2.0
  pitch?: number;         // 音调 0.5-2.0
  volume?: number;        // 音量 0-1
}

export interface AudioResult {
  path: string;
  duration: number;
  sampleRate?: number;
  format?: string;  // 音频格式，如 'mp3', 'wav'
}

// ========== ITV 类型 ==========

export interface ITVOptions {
  model?: string;
  duration?: number;      // 视频时长（秒）
  resolution?: string;    // 分辨率 "1280x720"
  fps?: number;           // 帧率
  motionStrength?: number;// 运动强度 0-1
  movementAmplitude?: 'auto' | 'small' | 'medium' | 'large';
  cameraMotion?: 'static' | 'pan-left' | 'pan-right' | 'zoom-in' | 'zoom-out';
  motionPrompt?: string;  // 运动描述
  startFrame?: string;    // 首帧图片路径
  endFrame?: string;      // 尾帧图片路径
  aspectRatio?: string;   // 宽高比 16:9, 9:16, 1:1
  offPeak?: boolean;
  isRecommendedPrompt?: boolean;
  bgm?: boolean;
  watermark?: boolean;
  watermarkPosition?: number;
  watermarkUrl?: string;
  payload?: string;
  metaData?: string;
  // ComfyUI AnimateDiff 扩展
  negativePrompt?: string;
  width?: number;
  height?: number;
  seed?: number;
}

export interface VideoResult {
  url: string;
  path: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  taskId?: string;
}

export interface ProgressInfo {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  estimatedTime?: number;
  resultUrl?: string;
  error?: string;
}

// ========== 异步任务类型 ==========

export type AsyncTaskType = 'tti' | 'itv' | 'tts' | 'character-extraction';
export type AsyncTaskStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type AsyncTaskTargetType = 'character' | 'scene' | 'prop' | 'shot';

export interface AsyncTask {
  id: string;
  projectId: string;
  type: AsyncTaskType;
  targetType: AsyncTaskTargetType;
  targetId: string;
  targetName?: string;        // 用于显示通知
  remoteTaskId: string;       // 远程API返回的任务ID
  channelId?: string;
  modelId?: string;
  capability?: string;
  /**
   * 任务结果的归属信息，用于重启恢复后把结果回写到对应实体的结构化媒体槽位。
   * 新创建的媒体任务 SHOULD 设置该字段，避免在各工作流/Provider 层写兼容分支。
   */
  ownerRef?: MediaOwnerRef;
  status: AsyncTaskStatus;
  progress: number;
  /**
   * 物化后的结构化媒体资产。用于恢复后绑定与后续链路统一读取。
   */
  resultAsset?: StoredMediaAsset;
  error?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  updatedAt: number;
}

// ========== 保存状态类型 ==========

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

export interface ProjectSaveState {
  projectId: string;
  status: SaveStatus;
  lastSavedAt?: number;
  error?: string;
}
