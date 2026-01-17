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
}

// 角色接口定义
export interface Character {
  id: string;
  name: string;
  age: string;
  role: 'protagonist' | 'antagonist' | 'supporting'; // 主角 | 反派 | 配角
  description: string; // 人物小传
  appearance: string;  // AI生成的外貌描述（用于绘图）
  avatarUrl?: string;  // 头像URL
  voiceId?: string;    // TTS 音色 ID
}

// 场景接口定义
export interface Scene {
  id: string;
  name: string;
  location: string;
  time: 'day' | 'night' | 'twilight'; // 白天 |夜晚 | 黄昏
  mood: string;        // 氛围/情绪
  description: string; // 场景视觉描述
}

// 道具接口定义
export interface Prop {
  id: string;
  name: string;
  type: string;        // 道具类型 (如：武器、日常、关键线索)
  description: string; // 视觉描述
}

// 分镜/镜头接口定义
export interface Shot {
  id: string;
  scriptContent: string; // 对应的剧本原文
  shotType: 'close-up' | 'medium' | 'wide' | 'extreme-wide'; // 特写 | 中景 | 全景 | 大全景
  cameraMovement: 'static' | 'pan' | 'zoom-in' | 'tracking'; // 固定 | 摇镜 | 推镜 | 跟随
  duration: number;      // 持续时长(秒)
  description: string;   // 视频生成模型的提示词 (Prompt)
  imageUrl?: string;     // 预览图或生成图
  characters: string[];  // 涉及的角色ID
  dialogue?: string;     // 台词（用于 TTS）
  emotion?: string;      // 情绪标签
  props?: string[];      // 涉及的道具ID
  confirmed?: boolean;   // 是否已确认（用于入轨）
  seed?: number;         // 生成种子（用于复现）
  currentVersion?: number; // 当前版本号
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

export type ModelProviderType = 'gemini' | 'openai' | 'custom' | 'runway' | 'midjourney' | 'comfyui';
export type LLMProviderType = 'openai' | 'gemini' | 'openai-compatible';
export type TTIProviderType = 'comfyui' | 'jimeng' | 'qwen-image' | 'midjourney' | 'dall-e' | 'flux';
export type ITVProviderType = 'runway' | 'kling' | 'pika' | 'minimax' | 'comfyui-animatediff';
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

// 自定义 OpenAI 兼容渠道（旧版，保留兼容）
export interface CustomLLMChannel {
  id: string;
  name: string;           // 渠道显示名称
  baseUrl: string;        // API 基础地址
  apiKey: string;         // API Key
  defaultModel?: string;  // 默认模型名称
  models?: string[];      // 可用模型列表
  createdAt: number;
}

export interface ModelConfig {
  provider: ModelProviderType;
  apiKey: string;
  baseUrl?: string;       // 可选，用于自定义代理地址
  modelName: string;      // 例如 'gpt-4', 'gemini-1.5-pro'
  channelId?: string;     // 当 provider 为 'custom' 时，指向自定义渠道
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
  llm?: ModelConfig;               // 旧版剧本大模型配置（兼容迁移）
  llmConfigs: LLMModelConfig[];    // 新版多模型配置列表
  tti?: ModelConfig;               // 旧版文生图配置（兼容迁移）
  ttiConfigs: TTIModelConfig[];    // 新版多 TTI 配置列表
  itv?: ITVConfig;                 // 旧版图生视频配置（兼容迁移）
  itvConfigs: ITVModelConfig[];    // 新版多 ITV 配置列表
  tts?: TTSConfig;                 // 旧版语音合成配置（兼容迁移）
  ttsConfigs: TTSModelConfig[];    // 新版多 TTS 配置列表
  customChannels?: CustomLLMChannel[];  // 自定义 OpenAI 兼容渠道列表（旧版，保留兼容）
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
  gender: 'male' | 'female' | 'neutral';
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
  sampleRate: number;
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
