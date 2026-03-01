export type QueueTaskType = 'shot-render' | 'story-to-script' | 'script-to-storyboard';
export type QueueTaskStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type ShotRenderPhase =
  | 'prepareShotRenderStage'
  | 'executeShotRenderStage'
  | 'persistShotRenderStage';

export type StoryToScriptPhase =
  | 'initialize'
  | 'character_analysis'
  | 'location_analysis'
  | 'clip_splitting'
  | 'finalize'
  | 'complete';

export type ScriptToStoryboardPhase =
  | 'initialize'
  | 'storyboard_generation'
  | 'finalize'
  | 'complete';

export type TaskPhase = ShotRenderPhase | StoryToScriptPhase | ScriptToStoryboardPhase;

export interface ShotRenderTaskPayload {
  projectId: string;
  shot: Record<string, unknown>;
  projectConfigIds?: {
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  };
  theme?: string;
  stylePrompt?: string;
  metadata?: Record<string, unknown>;
}

export interface ShotRenderTaskResult {
  prepare?: Record<string, unknown>;
  execute?: Record<string, unknown>;
  persist?: Record<string, unknown>;
  version?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface StoryToScriptTaskPayload {
  projectId: string;
  episodeId: string;
  novelText: string;
  theme?: string;
  videoRatio?: string;
}

export interface StoryToScriptTaskResult {
  characters: Array<{
    name: string;
    description: string;
    appearance: string;
    personality: string;
  }>;
  locations: Array<{
    name: string;
    description: string;
  }>;
  clips: Array<{
    id: string;
    summary: string;
    content: string;
    characters: string[];
    location: string | null;
  }>;
  summary: {
    characterCount: number;
    locationCount: number;
    clipCount: number;
  };
}

export interface ScriptToStoryboardTaskPayload {
  projectId: string;
  episodeId: string;
  clipId: string;
  clipContent: string;
  characters: Array<{ name: string; description: string }>;
  location: string;
}

export interface ScriptToStoryboardTaskResult {
  clipId: string;
  panels: Array<{
    panelNumber: number;
    description: string;
    location: string;
    characters: string[];
    photographyPlan?: {
      shotType: string;
      cameraAngle: string;
      cameraMovement: string;
      lighting: string;
    };
    actingNotes?: Array<{
      character: string;
      action: string;
      emotion: string;
    }>;
  }>;
  summary: {
    panelCount: number;
  };
}

export type TaskPayload = ShotRenderTaskPayload | StoryToScriptTaskPayload | ScriptToStoryboardTaskPayload;
export type TaskResult = ShotRenderTaskResult | StoryToScriptTaskResult | ScriptToStoryboardTaskResult;

export interface QueueTaskRecord<TPayload = TaskPayload, TResult = TaskResult> {
  id: string;
  type: QueueTaskType;
  status: QueueTaskStatus;
  progress: number;
  attempts: number;
  maxRetries: number;
  phase?: TaskPhase;
  projectId: string;
  shotId?: string;
  episodeId?: string;
  clipId?: string;
  payload: TPayload;
  result?: TResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskUpdateEvent {
  taskId: string;
  status: QueueTaskStatus;
  progress: number;
  phase?: TaskPhase;
  attempts: number;
  maxRetries: number;
  error?: string;
  message?: string;
  updatedAt: number;
  task: QueueTaskRecord;
}

export interface RendererDelegatePayload {
  [key: string]: unknown;
}

export interface RendererDelegateRequest {
  delegateId: string;
  taskId: string;
  phase: TaskPhase;
  payload: RendererDelegatePayload;
}

export interface RendererDelegateResult {
  delegateId: string;
  result?: unknown;
  error?: string;
}

export interface RendererDelegateProgress {
  taskId: string;
  progress: number;
  phase?: TaskPhase;
  message?: string;
}
