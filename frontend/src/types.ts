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
  llmConfigId?: string;  // 关联的 LLM 配置 ID
  ttiConfigId?: string;  // 关联的 TTI 配置 ID
  itvConfigId?: string;  // 关联的 ITV 配置 ID
  ttsConfigId?: string;  // 关联的 TTS 配置 ID
  // 新增字段
  theme?: string;           // 主题风格 ID
  stylePrompt?: string;     // 自定义风格描述
  episodeCount?: number;    // 实际分集数（用于分集管理）
}

// 分集步骤进度
export interface EpisodeStepProgress {
  script: 'pending' | 'completed';
  assets: 'pending' | 'completed';
  storyboard: 'pending' | 'completed';
  video: 'pending' | 'completed';
}

// 分集接口定义
export interface Episode {
  id: string;
  projectId: string;
  number: number;           // 集数编号
  title: string;            // 分集标题
  scriptText?: string;      // 本集剧本
  status: 'draft' | 'script' | 'storyboard' | 'generating' | 'completed';
  stepProgress?: EpisodeStepProgress;  // 各步骤完成状态
  createdAt: number;
  updatedAt: number;
  // 分集解析数据引用（实际数据存储在 episodes/{id}/analysis.json）
  hasAnalysis?: boolean;
}

// 分集解析结果（存储在 episodes/{id}/analysis.json）
export interface EpisodeAnalysis {
  episodeId: string;
  // 引用项目级资产（ID 引用，非复制）
  characterRefs: string[];
  sceneRefs: string[];
  propRefs: string[];
  // 分集特有的分镜
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

// 角色接口定义
export interface Character {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting'; // 主角 | 反派 | 配角
  prompt: string;      // 核心提示词（整合了原有的 description, appearance 等）
  
  // 旧字段（保留用于兼容，但UI上将不再显示）
  age?: string;
  description?: string; 
  appearance?: string;
  
  voiceId?: string;    // TTS 音色 ID
  // 资产字段
  costumePhotoPath?: string;  // 定妆照本地路径
  costumePhotoUrl?: string;   // 定妆照远程URL（用于 Sora2 等需要远程URL的服务）
  previewVideoPath?: string;  // 预览视频路径
  previewVideoTaskId?: string; // 预览视频的生成任务ID（用于角色提取API）
  sora2CharacterId?: string;  // 角色提取API返回的ID
  customPrompt?: string;      // 用户自定义生成提示词 (Deprecated: use prompt instead)
  timestampRange?: AssetTimestampRange; // Sora2 提取时间范围
  // 分集引用追踪
  episodeRefs?: EpisodeRef[];
  fingerprint?: string;       // 资产指纹（用于去重）
}

// 场景接口定义
export interface Scene {
  id: string;
  name: string;
  prompt: string;     // 核心提示词
  
  // 旧字段（保留用于兼容）
  location?: string;
  time?: 'day' | 'night' | 'twilight'; 
  mood?: string;
  description?: string;
  
  imagePath?: string;  // 场景预览图本地路径
  imageUrl?: string;   // 场景预览图远程URL
  customPrompt?: string; // (Deprecated: use prompt instead)
  // 分集引用追踪
  episodeRefs?: EpisodeRef[];
  fingerprint?: string;
}

// 道具接口定义
export interface Prop {
  id: string;
  name: string;
  prompt: string;     // 核心提示词
  
  // 旧字段（保留用于兼容）
  type?: string;
  description?: string;
  
  imagePath?: string;  // 道具参考图本地路径
  imageUrl?: string;   // 道具参考图远程URL
  // Sora2 绑定相关
  previewVideoPath?: string;   // 预览视频路径
  previewVideoTaskId?: string; // 预览视频生成任务 ID
  sora2PropId?: string;        // Sora2 道具 ID
  customPrompt?: string;       // (Deprecated: use prompt instead)
  timestampRange?: AssetTimestampRange; // Sora2 提取时间范围
  // 分集引用追踪
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
  createdAt: number;
}

// 分镜/镜头接口定义
export interface Shot {
  id: string;
  scriptContent: string; // 对应的剧本原文
  shotType: 'close-up' | 'medium' | 'wide' | 'extreme-wide'; // 特写 | 中景 | 全景 | 大全景
  cameraMovement: 'static' | 'pan' | 'zoom-in' | 'tracking' | 'handheld'; // 固定 | 摇镜 | 推镜 | 跟随 | 手持
  duration: number;      // 持续时长(秒)
  // 双提示词字段
  description?: string;  // 通用提示词（兼容旧数据）
  imagePrompt?: string;  // 图片生成提示词
  videoPrompt?: string;  // 视频生成提示词
  // 参考图（用于文生图输入）
  referenceImages?: string[];        // 参考图列表（区别于生成结果 imagePaths）
  selectedReferenceIndex?: number;   // 当前选中的参考图索引
  // 生成结果图片
  imageUrl?: string;     // 预览图或生成图（远程URL）
  imagePath?: string;    // 当前选中的本地图片路径
  imagePaths?: string[]; // 所有生成的候选图片列表
  currentImageIndex?: number; // 当前选中的图片索引
  // 关联资产
  characters: string[];  // 涉及的角色ID
  scenes?: string[];     // 涉及的场景ID（可在 UI 中编辑）
  dialogue?: string;     // 台词（用于 TTS）
  emotion?: string;      // 情绪标签
  props?: string[];      // 涉及的道具ID
  confirmed?: boolean;   // 是否已确认（用于入轨）
  seed?: number;         // 生成种子（用于复现）
  currentVersion?: number; // 当前版本号（兼容旧数据）
  videos?: ShotVideo[];  // 视频版本列表
  currentVideoIndex?: number;    // 当前选中的视频索引
  selectedVideoIndex?: number;   // 别名（兼容）
}

// 剧本分析结果接口
export interface ScriptAnalysisResult {
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  shots: Shot[];
}

// 编辑器当前的步骤状态
export type EditorStep = 'script' | 'assets' | 'storyboard' | 'video';

// ========== 模型设置相关类型 ==========

export type ModelProviderType = 'gemini' | 'openai' | 'openai-compatible' | 'claude' | 'runway' | 'midjourney' | 'comfyui';
export type LLMProviderType = 'openai-compatible' | 'gemini' | 'claude';
export type TTIProviderType = 'comfyui' | 'jimeng' | 'qwen-image' | 'midjourney' | 'dall-e' | 'flux' | 'nano-banana' | 'gemini-3-pro';
export type ITVProviderType = 'runway' | 'kling' | 'pika' | 'minimax' | 'comfyui-animatediff' | 'sora2';
export type TTSProviderType = 'edge-tts' | 'openai-tts' | 'fish-audio' | 'gpt-sovits' | 'doubao-tts';

// 通用媒体配置基类
export interface MediaProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
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
  workflowPath?: string;           // ComfyUI AnimateDiff 工作流
  workflowMapping?: Record<string, string>;
  defaultDuration?: number;        // 默认时长（秒）
  defaultResolution?: string;      // "1280x720"
}

// TTS 配置（语音合成）
export interface TTSModelConfig extends MediaProviderConfig {
  provider: TTSProviderType;
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
  models: string[];
}


export interface ModelConfig {
  provider: ModelProviderType;
  apiKey: string;
  baseUrl?: string;
  modelName: string;
}

export interface TTSConfig {
  provider: TTSProviderType;
  apiKey?: string;
  baseUrl?: string;
  defaultVoice?: string;
}

export interface ITVConfig {
  provider: ITVProviderType;
  apiKey?: string;
  baseUrl?: string;
  defaultDuration?: number;  // 默认视频时长（秒）
  defaultResolution?: string; // 默认分辨率
}

export interface AppSettings {
  llmConfigs: LLMModelConfig[];
  ttiConfigs: TTIModelConfig[];
  itvConfigs: ITVModelConfig[];
  ttsConfigs: TTSModelConfig[];
  customThemePresets?: ThemePreset[];  // 用户自定义视觉风格预设
  channelConfigs?: import('./providers/channel/types').ChannelConfig[];  // 渠道配置（Provider 注入版）
  // @deprecated 以下字段已废弃，迁移后删除
  customChannels?: import('./providers/channel/types').ChannelConfig[];  // 旧版自定义渠道配置
  unifiedChannels?: import('./providers/channel/types').UnifiedChannelConfig[];  // 旧版统一渠道配置
  channelMigrationVersion?: number;  // 迁移版本标记
}

// ========== 时间线相关类型 ==========

export type MediaType = 'video' | 'audio' | 'image' | 'text' | 'subtitle' | 'sticker';

export type EasingType =
  | 'linear'
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
  llmConfigId?: string;   // 关联的 LLM 配置 ID，null/undefined 表示使用默认
  ttiConfigId?: string;   // 关联的 TTI 配置 ID
  itvConfigId?: string;   // 关联的 ITV 配置 ID
  ttsConfigId?: string;   // 关联的 TTS 配置 ID
  theme?: string;         // 主题风格 ID
  stylePrompt?: string;   // 自定义风格描述
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
  imagePath?: string;
  videoPath?: string;
  audioPath?: string;
  remoteImageUrl?: string;   // 原始远程图片 URL
  remoteVideoUrl?: string;   // 原始远程视频 URL
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
  duration?: number;      // 视频时长（秒）
  resolution?: string;    // 分辨率 "1280x720"
  fps?: number;           // 帧率
  motionStrength?: number;// 运动强度 0-1
  cameraMotion?: 'static' | 'pan-left' | 'pan-right' | 'zoom-in' | 'zoom-out';
  motionPrompt?: string;  // 运动描述
  startFrame?: string;    // 首帧图片路径
  endFrame?: string;      // 尾帧图片路径
  aspectRatio?: string;   // 宽高比 16:9, 9:16, 1:1
  // ComfyUI AnimateDiff 扩展
  negativePrompt?: string;
  width?: number;
  height?: number;
  seed?: number;
}

export interface VideoResult {
  path: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
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
  status: AsyncTaskStatus;
  progress: number;
  resultUrl?: string;
  localPath?: string;
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
