/**
 * 一键成片工作流
 * 串联全流程：剧本解析 → 资产生成 → 分镜生成 → 图片生成 → 视频生成
 */

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

export interface AutoGenerateOptions {
  projectId: string;
  episodeId: string;
  /** 跳过的步骤 */
  skipSteps?: WorkflowStep[];
  onProgress?: WorkflowProgressCallback;
}

/**
 * 一键成片控制器
 * 注意：实际的生成逻辑由各自的 service 处理，
 * 这里只负责串联流程和进度管理
 */
export class AutoGenerateWorkflow {
  private aborted = false;
  private options: AutoGenerateOptions;

  constructor(options: AutoGenerateOptions) {
    this.options = options;
  }

  /**
   * 开始执行
   * 返回是否全部成功
   */
  async execute(): Promise<boolean> {
    this.aborted = false;
    const { skipSteps = [], onProgress } = this.options;
    const steps = ALL_STEPS.filter(s => !skipSteps.includes(s));

    for (let i = 0; i < steps.length; i++) {
      if (this.aborted) {
        onProgress?.({
          currentStep: steps[i],
          stepIndex: i,
          totalSteps: steps.length,
          stepProgress: 0,
          message: '已取消',
          completed: false,
          error: '用户取消',
        });
        return false;
      }

      const step = steps[i];
      onProgress?.({
        currentStep: step,
        stepIndex: i,
        totalSteps: steps.length,
        stepProgress: 0,
        message: `正在${STEP_LABELS[step]}...`,
        completed: false,
      });

      try {
        await this.executeStep(step, (progress) => {
          onProgress?.({
            currentStep: step,
            stepIndex: i,
            totalSteps: steps.length,
            stepProgress: progress,
            message: `正在${STEP_LABELS[step]}... ${progress}%`,
            completed: false,
          });
        });
      } catch (err: any) {
        onProgress?.({
          currentStep: step,
          stepIndex: i,
          totalSteps: steps.length,
          stepProgress: 0,
          message: `${STEP_LABELS[step]}失败: ${err.message}`,
          completed: false,
          error: err.message,
        });
        return false;
      }
    }

    onProgress?.({
      currentStep: 'videos',
      stepIndex: steps.length - 1,
      totalSteps: steps.length,
      stepProgress: 100,
      message: '全部完成',
      completed: true,
    });

    return true;
  }

  /**
   * 取消执行
   */
  abort() {
    this.aborted = true;
  }

  /**
   * 执行单个步骤
   * 各步骤通过事件/IPC 触发对应的 service
   */
  private async executeStep(
    step: WorkflowStep,
    onStepProgress: (progress: number) => void,
  ): Promise<void> {
    // 各步骤的实际执行由 useStoryboardState 等 hook 中的方法处理
    // 这里通过 CustomEvent 通知 UI 层触发对应操作
    return new Promise<void>((resolve, reject) => {
      const eventName = `koma:auto-generate:${step}`;
      const resultHandler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail.success) {
          onStepProgress(100);
          resolve();
        } else {
          reject(new Error(detail.error || `${step} 失败`));
        }
        window.removeEventListener(`${eventName}:result`, resultHandler);
      };

      window.addEventListener(`${eventName}:result`, resultHandler);

      // 触发步骤执行
      window.dispatchEvent(new CustomEvent(eventName, {
        detail: {
          projectId: this.options.projectId,
          episodeId: this.options.episodeId,
        },
      }));

      // 超时保护：5 分钟
      setTimeout(() => {
        window.removeEventListener(`${eventName}:result`, resultHandler);
        reject(new Error(`${step} 超时`));
      }, 5 * 60 * 1000);
    });
  }
}

export function getStepLabel(step: WorkflowStep): string {
  return STEP_LABELS[step];
}

export function getAllSteps(): WorkflowStep[] {
  return [...ALL_STEPS];
}
