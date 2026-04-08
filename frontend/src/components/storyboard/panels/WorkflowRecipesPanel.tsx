import React, { useCallback, useEffect, useMemo } from 'react';
import { App, Button, Card, List, Space, Tag, Typography } from 'antd';
import {
  ArrowRightOutlined,
  NodeExpandOutlined,
  PlayCircleOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import {
  OFFICIAL_MODEL_PRESETS,
  OFFICIAL_PROMPT_ASSETS,
  getOfficialPromptAssetSummary,
} from '../../../store/officialPromptAssets';
import type {
  AssistantWorkflowSession,
  StoryboardWorkflowContext,
  WorkflowPanelId,
  WorkflowPanelSessions,
} from './workflowSessions';
import { getWorkflowRecipe, getWorkflowRecipes, type WorkflowRecipeDefinition } from './workflowRecipes';

const { Text, Title } = Typography;

interface WorkflowRecipesPanelProps {
  workflowSessions: WorkflowPanelSessions;
  session: AssistantWorkflowSession;
  storyboardContext: StoryboardWorkflowContext;
  onAssistantSessionChange: (updates: Partial<AssistantWorkflowSession>) => void;
  onScriptSessionChange: (updates: Partial<WorkflowPanelSessions['script']>) => void;
  onAssetSessionChange: (updates: Partial<WorkflowPanelSessions['assets']>) => void;
  onInferenceSessionChange: (updates: Partial<WorkflowPanelSessions['inference']>) => void;
  onExportSessionChange: (updates: Partial<WorkflowPanelSessions['export']>) => void;
  onOpenPanel: (panelId: WorkflowPanelId) => void;
}

const PANEL_LABELS: Record<WorkflowPanelId, string> = {
  script: '剧本工作室',
  assets: '资产管理',
  inference: '章节推理',
  style: '风格设置',
  export: '导出中心',
  assistant: '工作流预设',
};

function resolveRecipeScopePreview(
  recipe: WorkflowRecipeDefinition,
  context: StoryboardWorkflowContext,
): { label: string; count: number; disabled: boolean } {
  switch (recipe.scope) {
    case 'current-shot':
      return {
        label: context.activeShotId ? '当前分镜' : '当前分镜（未选择）',
        count: context.activeShotId ? 1 : 0,
        disabled: !context.activeShotId,
      };
    case 'selected-shots':
      return {
        label: '选中分镜',
        count: context.selectedShotIds.length,
        disabled: context.selectedShotIds.length === 0,
      };
    case 'all-shots':
      return {
        label: '全部分镜',
        count: context.shotCount,
        disabled: context.shotCount === 0,
      };
    case 'current-chapter':
    default:
      return {
        label: '当前章节（本集）',
        count: context.shotCount,
        disabled: context.shotCount === 0,
      };
  }
}

export const WorkflowRecipesPanel: React.FC<WorkflowRecipesPanelProps> = ({
  workflowSessions,
  session,
  storyboardContext,
  onAssistantSessionChange,
  onScriptSessionChange,
  onAssetSessionChange,
  onInferenceSessionChange,
  onExportSessionChange,
  onOpenPanel,
}) => {
  const { message } = App.useApp();
  const recipes = useMemo(() => getWorkflowRecipes(), []);
  const catalogSummary = useMemo(() => getOfficialPromptAssetSummary(), []);
  const selectedRecipe = useMemo(
    () => (session.selectedRecipeId ? getWorkflowRecipe(session.selectedRecipeId) : undefined),
    [session.selectedRecipeId],
  );

  useEffect(() => {
    if (
      session.availableRecipeCount !== recipes.length
      || session.templateAssetCount !== catalogSummary.totalPromptAssets
      || session.modelPresetCount !== catalogSummary.totalModelPresets
    ) {
      onAssistantSessionChange({
        availableRecipeCount: recipes.length,
        templateAssetCount: catalogSummary.totalPromptAssets,
        modelPresetCount: catalogSummary.totalModelPresets,
      });
    }
  }, [
    catalogSummary.totalModelPresets,
    catalogSummary.totalPromptAssets,
    onAssistantSessionChange,
    recipes.length,
    session.availableRecipeCount,
    session.modelPresetCount,
    session.templateAssetCount,
  ]);

  const rememberRecipe = useCallback((recipe: WorkflowRecipeDefinition, scopeLabel: string) => {
    onAssistantSessionChange({
      currentStep: 1,
      selectedRecipeId: recipe.id,
      selectedRecipeName: recipe.name,
      availableRecipeCount: recipes.length,
      templateAssetCount: catalogSummary.totalPromptAssets,
      modelPresetCount: catalogSummary.totalModelPresets,
      affectedScopeLabel: scopeLabel,
      recentRecipeIds: [recipe.id, ...session.recentRecipeIds.filter((item) => item !== recipe.id)].slice(0, 6),
      lastApplied: {
        appliedAt: Date.now(),
        summary: `已启动 ${recipe.name}`,
        affectedCount: resolveRecipeScopePreview(recipe, storyboardContext).count,
        scopeLabel,
      },
    });
  }, [
    catalogSummary.totalModelPresets,
    catalogSummary.totalPromptAssets,
    onAssistantSessionChange,
    recipes.length,
    session.recentRecipeIds,
    storyboardContext,
  ]);

  const handleActivateRecipe = useCallback((recipe: WorkflowRecipeDefinition) => {
    const scopePreview = resolveRecipeScopePreview(recipe, storyboardContext);
    if (scopePreview.disabled) {
      message.warning('当前预设缺少目标分镜范围，请先在工作台中选中分镜后再启动。');
      return;
    }

    if (recipe.sessionPreset.script) {
      onScriptSessionChange(recipe.sessionPreset.script);
    }
    if (recipe.sessionPreset.assets) {
      onAssetSessionChange(recipe.sessionPreset.assets);
    }
    if (recipe.sessionPreset.inference) {
      onInferenceSessionChange(recipe.sessionPreset.inference);
    }
    if (recipe.sessionPreset.export) {
      const { config, ...rest } = recipe.sessionPreset.export;
      onExportSessionChange({
        ...rest,
        ...(config
          ? {
            config: {
              ...workflowSessions.export.config,
              ...config,
            },
          }
          : {}),
      });
    }

    rememberRecipe(recipe, scopePreview.label);
    onOpenPanel(recipe.recommendedPanelId);
    message.success(`已切换到 ${recipe.name}`);
  }, [
    message,
    onAssetSessionChange,
    onExportSessionChange,
    onInferenceSessionChange,
    onOpenPanel,
    onScriptSessionChange,
    rememberRecipe,
    storyboardContext,
    workflowSessions.export.config,
  ]);

  const handleOpenStep = useCallback((recipe: WorkflowRecipeDefinition, panelId: WorkflowPanelId) => {
    const scopeLabel = resolveRecipeScopePreview(recipe, storyboardContext).label;
    rememberRecipe(recipe, scopeLabel);
    onOpenPanel(panelId);
  }, [onOpenPanel, rememberRecipe, storyboardContext]);

  const recentRecipes = session.recentRecipeIds
    .map((recipeId) => getWorkflowRecipe(recipeId))
    .filter((item): item is WorkflowRecipeDefinition => Boolean(item));

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <Space direction="vertical" size={16} className="w-full">
        <Card className="border-zinc-800 bg-zinc-950" styles={{ body: { padding: 16 } }}>
          <Space direction="vertical" size={12} className="w-full">
            <div>
              <Title level={5} className="!mb-1 !text-zinc-100">
                工作流预设
              </Title>
              <Text className="text-zinc-400">
                以分镜为中心，把剧本、资产、推理和导出串成可反复进入的操作流。
              </Text>
            </div>

            {recentRecipes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {recentRecipes.map((recipe) => (
                  <Tag key={recipe.id} className="m-0 border-emerald-800 bg-emerald-950/30 text-emerald-200">
                    最近使用: {recipe.name}
                  </Tag>
                ))}
              </div>
            )}

            <div className="grid gap-3">
              {recipes.map((recipe) => {
                const scopePreview = resolveRecipeScopePreview(recipe, storyboardContext);
                const isActive = session.selectedRecipeId === recipe.id;

                return (
                  <Card
                    key={recipe.id}
                    className={isActive ? 'border-sky-700 bg-sky-950/10' : 'border-zinc-800 bg-zinc-900/70'}
                    styles={{ body: { padding: 16 } }}
                  >
                    <Space direction="vertical" size={10} className="w-full">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Text className="text-zinc-100 font-medium">{recipe.name}</Text>
                            <Tag className="m-0 border-zinc-700 bg-zinc-950 text-zinc-300">
                              模板 {recipe.sourceWorkflowId}
                            </Tag>
                            <Tag className="m-0 border-purple-800 bg-purple-950/30 text-purple-200">
                              {scopePreview.label} · {scopePreview.count}
                            </Tag>
                          </div>
                          <Text className="block text-zinc-400 mt-1">{recipe.description}</Text>
                        </div>
                        <Button
                          type={isActive ? 'default' : 'primary'}
                          icon={<PlayCircleOutlined />}
                          onClick={() => handleActivateRecipe(recipe)}
                          disabled={scopePreview.disabled}
                        >
                          {isActive ? '重新启动' : '启动预设'}
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Tag className="m-0 border-zinc-700 bg-zinc-950 text-zinc-300">
                          入口: {PANEL_LABELS[recipe.recommendedPanelId]}
                        </Tag>
                        <Tag className="m-0 border-amber-800 bg-amber-950/30 text-amber-200">
                          {recipe.goal}
                        </Tag>
                      </div>
                    </Space>
                  </Card>
                );
              })}
            </div>
          </Space>
        </Card>

        {selectedRecipe && (
          <Card className="border-zinc-800 bg-zinc-950" styles={{ body: { padding: 16 } }}>
            <Space direction="vertical" size={12} className="w-full">
              <div className="flex items-center gap-2">
                <NodeExpandOutlined className="text-sky-400" />
                <Title level={5} className="!mb-0 !text-zinc-100">
                  {selectedRecipe.name}
                </Title>
              </div>
              <List
                dataSource={selectedRecipe.steps}
                split={false}
                renderItem={(step, index) => (
                  <List.Item className="px-0 py-2 border-b border-zinc-900 last:border-b-0">
                    <div className="flex w-full items-center justify-between gap-3">
                      <div>
                        <Text className="block text-zinc-200">
                          {index + 1}. {step.title}
                        </Text>
                        <Text className="text-zinc-500">{step.detail}</Text>
                      </div>
                      <Button
                        size="small"
                        icon={<ArrowRightOutlined />}
                        onClick={() => handleOpenStep(selectedRecipe, step.panelId)}
                      >
                        打开 {PANEL_LABELS[step.panelId]}
                      </Button>
                    </div>
                  </List.Item>
                )}
              />
            </Space>
          </Card>
        )}

        <Card className="border-zinc-800 bg-zinc-950" styles={{ body: { padding: 16 } }}>
          <Space direction="vertical" size={12} className="w-full">
            <div className="flex items-center gap-2">
              <RobotOutlined className="text-emerald-400" />
              <Title level={5} className="!mb-0 !text-zinc-100">
                默认模板资产目录
              </Title>
            </div>

            <div className="flex flex-wrap gap-2">
              {catalogSummary.categories.map((item) => (
                <Tag key={item.category} className="m-0 border-zinc-700 bg-zinc-900 text-zinc-300">
                  {item.label} {item.count}
                </Tag>
              ))}
            </div>

            <div className="grid gap-2">
              {OFFICIAL_PROMPT_ASSETS.slice(0, 6).map((asset) => (
                <div key={asset.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Text className="text-zinc-200">{asset.name}</Text>
                    <Tag className="m-0 border-zinc-700 bg-zinc-950 text-zinc-400">
                      {asset.sourceFile}
                    </Tag>
                  </div>
                  <Text className="text-zinc-500">{asset.contentPreview}</Text>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {OFFICIAL_MODEL_PRESETS.map((preset) => (
                <Tag key={preset.id} className="m-0 border-cyan-800 bg-cyan-950/30 text-cyan-200">
                  {preset.label}
                </Tag>
              ))}
            </div>
          </Space>
        </Card>
      </Space>
    </div>
  );
};
