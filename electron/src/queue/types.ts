export type QueueTaskType = 'shot-render';
export type QueueTaskStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type ShotRenderPhase =
  | 'prepareShotRenderStage'
  | 'executeShotRenderStage'
  | 'persistShotRenderStage';

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

export interface QueueTaskRecord<TPayload = ShotRenderTaskPayload, TResult = ShotRenderTaskResult> {
  id: string;
  type: QueueTaskType;
  status: QueueTaskStatus;
  progress: number;
  attempts: number;
  maxRetries: number;
  phase?: ShotRenderPhase;
  projectId: string;
  shotId: string;
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
  phase?: ShotRenderPhase;
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
  phase: ShotRenderPhase;
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
  phase?: ShotRenderPhase;
  message?: string;
}
