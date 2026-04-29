/**
 * 应用类型 entry point
 *
 * P1#4 重构：原 types.ts (700 行上帝文件) 物理拆分到 types/ 子目录的多个主题文件，
 * 本文件保留作为兼容的统一 import path（"import { X } from '../types'" 不变），
 * 仅做 re-export + 保留 timeline / workflow / voice / 结果 等少量未拆分的杂项。
 *
 * 已拆出主题：
 *   types/project.ts          Project / Episode / ThemePreset / ProjectMeta / SaveStatus 等
 *   types/scene-character.ts  Character / Scene / Prop / Shot / ShotVersion 等
 *   types/task.ts             AsyncTask 系列
 *   types/provider-config.ts  各 Config / AppSettings / *ProviderType 等
 *   types/media.ts            StoredMediaAsset / Provider*Request / MediaSlots 等
 *
 * 仍留在本文件的：
 *   - 旧 timeline 数据模型（Clip / Track / Timeline / Keyframe / MediaType / EasingType）
 *     注意：与 types/editor.ts 中同名定义并行存在，且 EasingType 一边是 type union
 *     一边是 enum；统一属于"数据模型重构"epic，不在本次拆分范围内
 *   - WorkflowProgress / EditorStep / AppPage / Voice / Asset / CacheInfo / VideoResult
 *     等独立小类型
 */

// ========== Re-export from types/ subdirectory ==========

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

export type {
  StylePresetSourceType,
  ProjectStyleSnapshot,
  Project,
  EpisodeStepProgress,
  Episode,
  EpisodeAnalysis,
  EpisodeRef,
  ThemePreset,
  StorageConfig,
  ProjectMeta,
  RecentProject,
  SaveStatus,
  ProjectSaveState,
} from './types/project';

export type {
  AssetTimestampRange,
  CharacterGender,
  Character,
  Scene,
  Prop,
  ShotVideo,
  Shot,
  ScriptAnalysisResult,
  ShotVersion,
  ShotMeta,
} from './types/scene-character';

export type {
  AsyncTaskType,
  AsyncTaskStatus,
  AsyncTaskTargetType,
  AsyncTask,
} from './types/task';

export type {
  ModelProviderType,
  LLMProviderType,
  TTIProviderType,
  ITVProviderType,
  TTSProviderType,
  MediaProviderConfig,
  TTIModelConfig,
  ITVModelConfig,
  TTSModelConfig,
  ResolvedTTIConfig,
  ResolvedITVConfig,
  ResolvedTTSConfig,
  ProviderPreset,
  LLMModelConfig,
  LLMChannelPreset,
  ModelConfig,
  TTSConfig,
  ITVConfig,
  AppSettings,
} from './types/provider-config';

// ========== 编辑器步骤（待 P0#3 续刀彻底数据驱动） ==========

// 编辑器当前的步骤状态 (3步流程)
export type EditorStep = 'assets' | 'storyboard' | 'video';

// ========== 时间线相关类型（旧数据模型）==========
//
// TODO: 与 types/editor.ts 中的同名定义重复（且 EasingType 一边是 type 一边是 enum）。
// 当前两套数据模型并行使用：本文件的供 trackStore；types/editor.ts 的供 SimpleEditor。
// 统一属于独立"数据模型重构"epic，不在 P1#4 范围内。

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

// ========== 缓存信息 ==========

export interface CacheInfo {
  type: 'thumbnail' | 'waveform' | 'preview';
  hash: string;
  path: string;
  size: number;
  createdAt: number;
}

// ========== TTS 类型 ==========

import type { TTSProviderType } from './types/provider-config';

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
