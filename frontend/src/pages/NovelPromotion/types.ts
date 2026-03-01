/**
 * Novel Promotion 核心类型定义
 * 基于 waoowaoo 项目的数据结构
 */

// ============ Episode 类型 ============

export interface Episode {
  id: string;
  projectId: string;
  name: string;
  novelText: string;
  createdAt: number;
  updatedAt: number;
}

export interface EpisodeCreateParams {
  projectId: string;
  name: string;
}

export interface EpisodeUpdateParams {
  name?: string;
  novelText?: string;
}

// ============ Clip 类型 ============

export interface Clip {
  id: string;
  episodeId: string;
  start: number;
  end: number;
  summary: string;
  content: string;
  characters: string[];
  location: string | null;
  screenplay: Record<string, unknown> | null;
  createdAt: number;
}

export interface ClipUpdateParams {
  summary?: string;
  content?: string;
  characters?: string[];
  location?: string | null;
  screenplay?: Record<string, unknown> | null;
}

// ============ Storyboard & Panel 类型 ============

export interface Storyboard {
  id: string;
  clipId: string;
  panels: Panel[];
  createdAt: number;
}

export interface Panel {
  id: string;
  storyboardId: string;
  panelNumber: number;
  description: string;
  location: string;
  characters: string[];
  imageUrl?: string;
  imageCandidates?: string[];
  photographyPlan?: PhotographyPlan;
  actingNotes?: ActingNote[];
  videoUrl?: string;
  videoStatus?: VideoStatus;
  createdAt: number;
}

export interface PhotographyPlan {
  composition: string;
  lighting: string;
  colorPalette: string;
  atmosphere: string;
  technicalNotes?: string;
}

export interface ActingNote {
  character: string;
  action: string;
  emotion?: string;
}

export type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PanelUpdateParams {
  description?: string;
  location?: string;
  characters?: string[];
  imageUrl?: string;
  imageCandidates?: string[];
  photographyPlan?: PhotographyPlan;
  actingNotes?: ActingNote[];
  videoUrl?: string;
  videoStatus?: VideoStatus;
}

// ============ Character 类型 ============

export interface Character {
  id: string;
  projectId: string;
  name: string;
  description: string;
  appearance: string;
  personality: string;
  imageUrl?: string;
  createdAt: number;
}

export interface CharacterCreateParams {
  projectId: string;
  name: string;
  description?: string;
  appearance?: string;
  personality?: string;
}

export interface CharacterUpdateParams {
  name?: string;
  description?: string;
  appearance?: string;
  personality?: string;
  imageUrl?: string;
}

// ============ Location 类型 ============

export interface Location {
  id: string;
  projectId: string;
  name: string;
  description: string;
  imageUrl?: string;
  createdAt: number;
}

export interface LocationCreateParams {
  projectId: string;
  name: string;
  description?: string;
}

export interface LocationUpdateParams {
  name?: string;
  description?: string;
  imageUrl?: string;
}

// ============ Stage 类型 ============

export type Stage = 'config' | 'script' | 'storyboard' | 'video' | 'editor';

export type StageStatus = 'empty' | 'active' | 'processing' | 'ready';

export interface StageNavItem {
  id: Stage;
  icon: string;
  label: string;
  status: StageStatus;
  disabled?: boolean;
  disabledLabel?: string;
}

// ============ Workflow 任务类型 ============

export interface StoryToScriptParams {
  projectId: string;
  episodeId: string;
  novelText: string;
  theme?: string;
  videoRatio?: string;
}

export interface ScriptToStoryboardParams {
  projectId: string;
  episodeId: string;
  clipIds: string[];
}

export interface PanelImageGenerationParams {
  projectId: string;
  panelId: string;
  description: string;
  location: string;
  characters: string[];
}

export interface PanelVideoGenerationParams {
  projectId: string;
  panelId: string;
  imageUrl: string;
  prompt: string;
  duration?: number;
}

// ============ 工作流状态 ============

export interface WorkflowStatus {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  phase?: string;
  message?: string;
  error?: string;
}
