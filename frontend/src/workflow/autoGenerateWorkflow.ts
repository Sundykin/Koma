/**
 * 一键成片工作流
 * 串联全流程：剧本解析 → 分镜生成 → 资产生成 → 视频生成
 */

import {
  workflowCancel,
  workflowStart,
  onWorkflowEvent,
} from '../services/workflowBridge';

export type WorkflowStep = 'script' | 'assets' | 'storyboard' | 'images' | 'videos';

export interface WorkflowProgress {
  currentStep: WorkflowStep;
  stepIndex: number;
  totalSteps: number;
  stepProgress: number; // 0-100
  message: string;
  completed: boolean;
  error?: string;
}

export type WorkflowProgressCallback = (progress: WorkflowProgress) => void;

const STEP_LABELS: Record<WorkflowStep, string> = {
  script: '剧本解析',
  assets: '资产生成',
  storyboard: '分镜生成',
  images: '图片生成',
  videos: '视频生成',
};

const ALL_STEPS: WorkflowStep[] = ['script', 'assets', 'storyboard', 'images', 'videos'];

const NODE_TO_STEP: Record<string, WorkflowStep> = {
  'script-analysis': 'script',
  'shot-breakdown': 'storyboard',
  'scene-assets': 'assets',
  'character-assets': 'images',
  'shot-render': 'videos',
};

export interface AutoGenerateOptions {
  projectId: string;
  episodeId: string;
  scriptText?: string;
  projectConfigIds?: {
    llmConfigId?: string;
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  };
  theme?: string;
  stylePrompt?: string;
  /** 跳过的步骤 */
  skipSteps?: WorkflowStep[];
  onProgress?: WorkflowProgressCallback;
}

interface WorkflowNodeDefinition {
  id: string;
  label: string;
  type: 'task';
  handler: string;
  params: Record<string, unknown>;
}

interface WorkflowConnection {
  id: string;
  source: string;
  target: string;
}

/**
 * 一键成片控制器
 * 通过后端 WorkflowOrchestrator 执行，前端只负责进度映射
 */
export class AutoGenerateWorkflow {
  private aborted = false;
  private runId: string | null = null;
  private options: AutoGenerateOptions;
  private unsubscribers: Array<() => void> = [];
  private settle: ((success: boolean) => void) | null = null;

  constructor(options: AutoGenerateOptions) {
    this.options = options;
  }

  /**
   * 开始执行
   * 返回是否全部成功
   */
  async execute(): Promise<boolean> {
    this.aborted = false;

    const steps = this.getEnabledSteps();
    const totalSteps = steps.length;

    this.options.onProgress?.({
      currentStep: steps[0] || 'script',
      stepIndex: 0,
      totalSteps,
      stepProgress: 0,
      message: '正在启动工作流...',
      completed: false,
    });

    const definition = this.createWorkflowDefinition();
    const context = {
      projectId: this.options.projectId,
      episodeId: this.options.episodeId,
      scriptText: this.options.scriptText || '',
      projectConfigIds: this.options.projectConfigIds || {},
      theme: this.options.theme,
      stylePrompt: this.options.stylePrompt,
      settings: {},
    };

    const runId = await workflowStart(definition, context);
    if (!runId) {
      this.options.onProgress?.({
        currentStep: steps[0] || 'script',
        stepIndex: 0,
        totalSteps,
        stepProgress: 0,
        message: '启动失败',
        completed: false,
        error: '工作流启动失败',
      });
      return false;
    }

    this.runId = runId;

    this.bindWorkflowEvents(steps, totalSteps);

    if (this.aborted) {
      await workflowCancel(runId);
      this.cleanup();
      return false;
    }

    return new Promise<boolean>((resolve) => {
      this.settle = resolve;
    });
  }

  /**
   * 取消执行
   */
  abort() {
    this.aborted = true;

    const steps = this.getEnabledSteps();
    const totalSteps = steps.length;

    this.options.onProgress?.({
      currentStep: steps[0] || 'script',
      stepIndex: 0,
      totalSteps,
      stepProgress: 0,
      message: '已取消',
      completed: false,
      error: '用户取消',
    });

    if (this.runId) {
      workflowCancel(this.runId).catch(() => {
        // ignore cancel errors
      });
    }

    this.finish(false);
  }

  private bindWorkflowEvents(steps: WorkflowStep[], totalSteps: number): void {
    const toProgress = (nodeId: string, nodeProgress: number, fallbackMessage?: string): WorkflowProgress | null => {
      const step = NODE_TO_STEP[nodeId];
      if (!step || !steps.includes(step)) return null;

      const stepIndex = steps.indexOf(step);
      return {
        currentStep: step,
        stepIndex,
        totalSteps,
        stepProgress: Math.max(0, Math.min(100, Math.round(nodeProgress))),
        message: fallbackMessage || `正在${STEP_LABELS[step]}...`,
        completed: false,
      };
    };

    this.unsubscribers.push(onWorkflowEvent('node:start', (data) => {
      if (data?.runId !== this.runId) return;
      const progress = toProgress(data.nodeId, 0);
      if (progress) this.options.onProgress?.(progress);
    }));

    this.unsubscribers.push(onWorkflowEvent('node:progress', (data) => {
      if (data?.runId !== this.runId) return;
      const progress = toProgress(data.nodeId, data.progress ?? 0, data.step ? `正在${STEP_LABELS[NODE_TO_STEP[data.nodeId] || 'script']}... ${data.step}` : undefined);
      if (progress) this.options.onProgress?.(progress);
    }));

    this.unsubscribers.push(onWorkflowEvent('node:complete', (data) => {
      if (data?.runId !== this.runId) return;
      const progress = toProgress(data.nodeId, 100, `${STEP_LABELS[NODE_TO_STEP[data.nodeId] || 'script']}完成`);
      if (progress) this.options.onProgress?.(progress);
    }));

    this.unsubscribers.push(onWorkflowEvent('node:error', (data) => {
      if (data?.runId !== this.runId) return;
      const step = NODE_TO_STEP[data.nodeId] || steps[0] || 'script';
      const stepIndex = steps.indexOf(step);
      this.options.onProgress?.({
        currentStep: step,
        stepIndex: stepIndex >= 0 ? stepIndex : 0,
        totalSteps,
        stepProgress: 0,
        message: `${STEP_LABELS[step]}失败: ${data.error || '未知错误'}`,
        completed: false,
        error: data.error || '执行失败',
      });
      this.finish(false);
    }));

    this.unsubscribers.push(onWorkflowEvent('run:cancelled', (data) => {
      if (data?.runId !== this.runId) return;
      this.finish(false);
    }));

    this.unsubscribers.push(onWorkflowEvent('run:end', (data) => {
      if (data?.runId !== this.runId) return;
      const success = data?.status === 'completed';
      const finalStep = steps[steps.length - 1] || 'videos';
      this.options.onProgress?.({
        currentStep: finalStep,
        stepIndex: Math.max(0, steps.length - 1),
        totalSteps,
        stepProgress: success ? 100 : 0,
        message: success ? '全部完成' : `执行结束: ${data?.status || 'failed'}`,
        completed: success,
        error: success ? undefined : `状态: ${data?.status || 'failed'}`,
      });
      this.finish(success);
    }));
  }

  private finish(success: boolean): void {
    if (this.settle) {
      const settle = this.settle;
      this.settle = null;
      this.cleanup();
      settle(success);
      return;
    }
    this.cleanup();
  }

  private cleanup(): void {
    for (const off of this.unsubscribers) {
      try {
        off();
      } catch {
        // ignore
      }
    }
    this.unsubscribers = [];
    this.runId = null;
  }

  private getEnabledSteps(): WorkflowStep[] {
    const skip = new Set(this.options.skipSteps || []);
    return ALL_STEPS.filter(step => !skip.has(step));
  }

  private createWorkflowDefinition(): {
    id: string;
    name: string;
    description: string;
    nodes: WorkflowNodeDefinition[];
    connections: WorkflowConnection[];
    startNodeId: string;
  } {
    return {
      id: 'manga-production-auto-generate',
      name: '一键成片主流程',
      description: '剧本分析 -> 分镜生成 -> 资产生成 -> 分镜渲染',
      nodes: [
        { id: 'script-analysis', label: '剧本分析', type: 'task', handler: 'script-analysis', params: {} },
        { id: 'shot-breakdown', label: '分镜拆解', type: 'task', handler: 'shot-breakdown', params: {} },
        { id: 'scene-assets', label: '场景资产', type: 'task', handler: 'scene-assets', params: {} },
        { id: 'character-assets', label: '角色资产', type: 'task', handler: 'character-assets', params: {} },
        { id: 'shot-render', label: '分镜渲染', type: 'task', handler: 'shot-render', params: {} },
      ],
      connections: [
        { id: 'c1', source: 'script-analysis', target: 'shot-breakdown' },
        { id: 'c2', source: 'shot-breakdown', target: 'scene-assets' },
        { id: 'c3', source: 'shot-breakdown', target: 'character-assets' },
        { id: 'c4', source: 'scene-assets', target: 'shot-render' },
        { id: 'c5', source: 'character-assets', target: 'shot-render' },
      ],
      startNodeId: 'script-analysis',
    };
  }
}

export function getStepLabel(step: WorkflowStep): string {
  return STEP_LABELS[step];
}

export function getAllSteps(): WorkflowStep[] {
  return [...ALL_STEPS];
}
