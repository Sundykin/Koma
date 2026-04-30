/**
 * 项目 / 剧集 / 主题预设 / 持久化元数据等核心实体类型
 *
 * 由 P1#4 从 frontend/src/types.ts 拆出，types.ts 现仅 re-export 本文件。
 * 调用方继续 `import { Project } from '../types'` 不变。
 */
import type { MediaModelSelection } from '../providers/channel/types';
import type { Shot } from './scene-character';

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
  completedStages?: Array<'characters' | 'scenes' | 'props' | 'shots' | 'tweet'>;
  // 剧集特有的分镜
  shots: Shot[];
  // 剧集级推文文案：基于 scriptText 提炼出的连续推文旁白脚本，
  // 后续可分发到每个 Shot.tweetCopy 作为分镜级解说台词的来源
  tweetScript?: string;
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
  aspectRatio?: '16:9' | '9:16';
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

// ========== 保存状态类型 ==========

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

export interface ProjectSaveState {
  projectId: string;
  status: SaveStatus;
  lastSavedAt?: number;
  error?: string;
}
