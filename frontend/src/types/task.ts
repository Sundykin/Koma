/**
 * 异步媒体任务（TTI / ITV / TTS / 角色提取）类型
 *
 * 由 P1#4 从 frontend/src/types.ts 拆出，types.ts 现仅 re-export 本文件。
 * 调用方继续 `import { AsyncTask } from '../types'` 不变。
 */
import type { MediaOwnerRef, StoredMediaAsset } from './media';

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
