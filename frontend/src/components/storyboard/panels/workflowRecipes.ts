import type { WorkflowPanelId, WorkflowPanelSessions, WorkflowShotScope } from './workflowSessions';

export interface WorkflowRecipeStepDefinition {
  id: string;
  title: string;
  panelId: WorkflowPanelId;
  detail: string;
}

export interface WorkflowRecipeDefinition {
  id: string;
  sourceWorkflowId: string;
  sourceName: string;
  name: string;
  description: string;
  goal: string;
  recommendedPanelId: WorkflowPanelId;
  scope: WorkflowShotScope;
  sessionPreset: {
    script?: Partial<WorkflowPanelSessions['script']>;
    assets?: Partial<WorkflowPanelSessions['assets']>;
    inference?: Partial<WorkflowPanelSessions['inference']>;
    export?: Partial<WorkflowPanelSessions['export']> & {
      config?: Partial<WorkflowPanelSessions['export']['config']>;
    };
  };
  steps: WorkflowRecipeStepDefinition[];
}

const WORKFLOW_RECIPES: WorkflowRecipeDefinition[] = [
  {
    id: 'official-language-model-flow',
    sourceWorkflowId: '55',
    sourceName: '语言模型流',
    name: '剧本导入成镜流',
    description: '从剧本文案进入，经过拆分和推理，把结果直接沉淀为分镜。',
    goal: '剧本文本 -> 分镜草稿 -> 批量提示词 -> 直出导出',
    recommendedPanelId: 'script',
    scope: 'current-chapter',
    sessionPreset: {
      script: {
        currentStep: 0,
        applyMode: 'append',
      },
      inference: {
        scope: 'current-chapter',
        templateLevel: 'advanced',
      },
      export: {
        activeExport: 'video',
        config: {
          scope: 'current-chapter',
        },
      },
    },
    steps: [
      {
        id: 'import-script',
        title: '导入与精炼剧本',
        panelId: 'script',
        detail: '在剧本工作室导入文案，按步骤完成精炼、章节划分和拆分分镜。',
      },
      {
        id: 'infer-prompts',
        title: '批量补全提示词',
        panelId: 'inference',
        detail: '对当前章节（本集）执行批量推理，把图片/视频提示词写回分镜。',
      },
      {
        id: 'direct-export',
        title: '按分镜顺序导出',
        panelId: 'export',
        detail: '直接导出快速视频、图片序列或剪映草稿，不必先进入时间线。',
      },
    ],
  },
  {
    id: 'official-image-interrogate-flow',
    sourceWorkflowId: '56',
    sourceName: '图片反推流',
    name: '当前分镜补推流',
    description: '围绕当前分镜已有图片或视频，补齐资产、推理提示词并继续输出。',
    goal: '当前分镜媒体 -> 资产对齐 -> 当前分镜推理 -> 图片或视频导出',
    recommendedPanelId: 'inference',
    scope: 'current-shot',
    sessionPreset: {
      assets: {
        activeTab: 'characters',
      },
      inference: {
        scope: 'current-shot',
        templateLevel: 'advanced',
      },
      export: {
        activeExport: 'images',
        config: {
          scope: 'current-shot',
        },
      },
    },
    steps: [
      {
        id: 'align-assets',
        title: '先补齐镜头资产',
        panelId: 'assets',
        detail: '检查当前镜头涉及的角色、场景、道具，必要时从文案重新提取或补录。',
      },
      {
        id: 'current-shot-inference',
        title: '只推理当前分镜',
        panelId: 'inference',
        detail: '将推理范围锁定为当前分镜，避免对其他镜头造成扰动。',
      },
      {
        id: 'export-current-shot',
        title: '快速验证导出',
        panelId: 'export',
        detail: '优先导出当前分镜图片或短视频，确认镜头质量后再扩展到全片。',
      },
    ],
  },
];

export function getWorkflowRecipes(): WorkflowRecipeDefinition[] {
  return [...WORKFLOW_RECIPES];
}

export function getWorkflowRecipe(recipeId: string): WorkflowRecipeDefinition | undefined {
  return WORKFLOW_RECIPES.find((recipe) => recipe.id === recipeId);
}
