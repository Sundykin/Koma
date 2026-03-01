/**
 * Stage Pipeline 定义
 * 基于 waoowaoo 的 stage-pipeline
 */

// ============ Pipeline Stage ============

export interface PipelineStage {
  id: string;
  taskType: string;
  title: string;
}

export interface Pipeline {
  id: string;
  stages: PipelineStage[];
}

export interface FlowMeta {
  flowId: string;
  flowStageIndex: number;
  flowStageTotal: number;
  flowStageTitle: string;
}

// ============ Task Types ============

export const TASK_TYPE = {
  STORY_TO_SCRIPT_RUN: 'story_to_script_run',
  SCRIPT_TO_STORYBOARD_RUN: 'script_to_storyboard_run',
  AI_CREATE_CHARACTER: 'ai_create_character',
  AI_CREATE_LOCATION: 'ai_create_location',
  PANEL_IMAGE_GENERATION: 'panel_image_generation',
  PANEL_VIDEO_GENERATION: 'panel_video_generation',
} as const;

export type TaskType = typeof TASK_TYPE[keyof typeof TASK_TYPE];

// ============ Koma Workflows ============

export const KOMA_WORKFLOWS: Record<string, Pipeline> = {
  SHOT_RENDER: {
    id: 'shot_render',
    stages: [
      { id: 'prepare', taskType: 'prepare', title: '准备阶段' },
      { id: 'execute', taskType: 'execute', title: '执行阶段' },
      { id: 'persist', taskType: 'persist', title: '持久化阶段' },
    ],
  },
  STORY_TO_SCRIPT: {
    id: 'story_to_script',
    stages: [
      { id: 'analyze_characters', taskType: TASK_TYPE.STORY_TO_SCRIPT_RUN, title: '角色分析' },
      { id: 'analyze_locations', taskType: TASK_TYPE.STORY_TO_SCRIPT_RUN, title: '场景分析' },
      { id: 'split_clips', taskType: TASK_TYPE.STORY_TO_SCRIPT_RUN, title: '片段切分' },
      { id: 'screenplay_conversion', taskType: TASK_TYPE.STORY_TO_SCRIPT_RUN, title: '剧本转换' },
    ],
  },
  SCRIPT_TO_STORYBOARD: {
    id: 'script_to_storyboard',
    stages: [
      { id: 'phase1_plan', taskType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN, title: '分镜规划' },
      { id: 'phase2_cinematography', taskType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN, title: '摄影规则' },
      { id: 'phase2_acting', taskType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN, title: '表演指导' },
      { id: 'phase3_detail', taskType: TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN, title: '细节优化' },
    ],
  },
  AI_CREATE_CHARACTER: {
    id: 'ai_create_character',
    stages: [
      { id: 'create_character', taskType: TASK_TYPE.AI_CREATE_CHARACTER, title: 'AI 生成角色' },
    ],
  },
  AI_CREATE_LOCATION: {
    id: 'ai_create_location',
    stages: [
      { id: 'create_location', taskType: TASK_TYPE.AI_CREATE_LOCATION, title: 'AI 生成场景' },
    ],
  },
  PANEL_IMAGE_GENERATION: {
    id: 'panel_image_generation',
    stages: [
      { id: 'generate_image', taskType: TASK_TYPE.PANEL_IMAGE_GENERATION, title: '生成分镜图片' },
    ],
  },
  PANEL_VIDEO_GENERATION: {
    id: 'panel_video_generation',
    stages: [
      { id: 'generate_video', taskType: TASK_TYPE.PANEL_VIDEO_GENERATION, title: '生成分镜视频' },
    ],
  },
};

// ============ Helper Functions ============

export function getTaskTypeLabel(taskType: TaskType): string {
  const labels: Record<TaskType, string> = {
    [TASK_TYPE.STORY_TO_SCRIPT_RUN]: '故事转剧本',
    [TASK_TYPE.SCRIPT_TO_STORYBOARD_RUN]: '剧本转分镜',
    [TASK_TYPE.AI_CREATE_CHARACTER]: 'AI 生成角色',
    [TASK_TYPE.AI_CREATE_LOCATION]: 'AI 生成场景',
    [TASK_TYPE.PANEL_IMAGE_GENERATION]: '生成分镜图片',
    [TASK_TYPE.PANEL_VIDEO_GENERATION]: '生成分镜视频',
  };
  return labels[taskType] || taskType;
}

export function getFlowMeta(taskType: TaskType): FlowMeta | null {
  for (const workflow of Object.values(KOMA_WORKFLOWS)) {
    const stageIndex = workflow.stages.findIndex(s => s.taskType === taskType);
    if (stageIndex !== -1) {
      return {
        flowId: workflow.id,
        flowStageIndex: stageIndex + 1,
        flowStageTotal: workflow.stages.length,
        flowStageTitle: workflow.stages[stageIndex].title,
      };
    }
  }
  return null;
}
