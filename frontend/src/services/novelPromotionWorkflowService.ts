/**
 * Novel Promotion Workflow Service
 * 处理工作流任务提交与状态订阅
 */

import { taskQueueService } from '../../services/taskQueueService';
import type {
  StoryToScriptParams,
  ScriptToStoryboardParams,
  PanelImageGenerationParams,
  PanelVideoGenerationParams,
  WorkflowStatus,
} from '../NovelPromotion/types';

export class NovelPromotionWorkflowService {
  /**
   * 提交 Story-to-Script 任务
   */
  async submitStoryToScript(params: StoryToScriptParams): Promise<string> {
    // TODO: 实现实际的任务提交
    // return await taskQueueService.submitTask('story-to-script', params);

    // 临时 Mock
    console.log('[WorkflowService] submitStoryToScript:', params);
    return `task_${Date.now()}`;
  }

  /**
   * 提交 Script-to-Storyboard 任务
   */
  async submitScriptToStoryboard(params: ScriptToStoryboardParams): Promise<string> {
    // TODO: 实现实际的任务提交
    // return await taskQueueService.submitTask('script-to-storyboard', params);

    // 临时 Mock
    console.log('[WorkflowService] submitScriptToStoryboard:', params);
    return `task_${Date.now()}`;
  }

  /**
   * 提交 Panel 图片生成任务
   */
  async submitPanelImageGeneration(params: PanelImageGenerationParams): Promise<string> {
    // TODO: 实现实际的任务提交
    // return await taskQueueService.submitTask('panel-image-generation', params);

    // 临时 Mock
    console.log('[WorkflowService] submitPanelImageGeneration:', params);
    return `task_${Date.now()}`;
  }

  /**
   * 提交 Panel 视频生成任务
   */
  async submitPanelVideoGeneration(params: PanelVideoGenerationParams): Promise<string> {
    // TODO: 实现实际的任务提交
    // return await taskQueueService.submitTask('panel-video-generation', params);

    // 临时 Mock
    console.log('[WorkflowService] submitPanelVideoGeneration:', params);
    return `task_${Date.now()}`;
  }

  /**
   * 订阅工作流任务状态
   */
  subscribeWorkflow(
    taskId: string,
    callback: (status: WorkflowStatus) => void
  ): () => void {
    // TODO: 实现实际的订阅
    // return taskQueueService.subscribe(taskId, callback);

    // 临时 Mock
    console.log('[WorkflowService] subscribeWorkflow:', taskId);
    return () => {
      console.log('[WorkflowService] unsubscribe:', taskId);
    };
  }

  /**
   * 取消工作流任务
   */
  async cancelWorkflow(taskId: string): Promise<void> {
    // TODO: 实现实际的取消
    // await taskQueueService.cancelTask(taskId);

    // 临时 Mock
    console.log('[WorkflowService] cancelWorkflow:', taskId);
  }
}

export const novelPromotionWorkflowService = new NovelPromotionWorkflowService();
