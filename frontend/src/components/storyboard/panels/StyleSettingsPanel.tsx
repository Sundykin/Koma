/**
 * StyleSettingsPanel - 风格设置面板
 * 浏览、预览、应用视觉风格、新建自定义风格
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Input, Typography, App, Empty, Spin, Button, Modal, Form, Segmented, Tag } from 'antd';
import { CheckCircleFilled, PlusOutlined } from '@ant-design/icons';
import { addCustomThemePreset } from '../../../store/settings/themePresets';
import type { ProjectStyleSnapshot } from '../../../types';
import { createProjectStyleSnapshot, getAllThemePresets, type ThemePresetCatalogItem } from '../../../config/themePresets';
import { loadProject, saveProject, loadEpisodeShots } from '../../../store/projectStore';
import type { ChapterInferenceSession } from './workflowSessions';
import {
  resolveStoryboardScope,
  type StoryboardWorkflowContext,
  type StyleImpactScope,
  type StyleSettingsSession,
} from './workflowSessions';

const { Text } = Typography;
const { Search, TextArea } = Input;

interface StyleSettingsPanelProps {
  projectId: string;
  activeStylePresetId?: string;
  activeStyleSnapshot?: ProjectStyleSnapshot;
  storyboardContext: StoryboardWorkflowContext;
  episodeId: string;
  session: StyleSettingsSession;
  onSessionChange: (updates: Partial<StyleSettingsSession>) => void;
  onPrepareInferencePlan?: (updates: Partial<ChapterInferenceSession>) => void;
  onOpenInference?: () => void;
  onProjectStyleApplied?: (updates: {
    stylePresetId: string;
    styleSnapshot: ProjectStyleSnapshot;
  }) => void;
}

export const StyleSettingsPanel: React.FC<StyleSettingsPanelProps> = ({
  projectId,
  activeStylePresetId,
  activeStyleSnapshot,
  storyboardContext,
  episodeId,
  session,
  onSessionChange,
  onPrepareInferencePlan,
  onOpenInference,
  onProjectStyleApplied,
}) => {
  const { message } = App.useApp();
  const [presets, setPresets] = useState<ThemePresetCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm();

  const activePresetId = session.selectedPresetId || activeStylePresetId || activeStyleSnapshot?.sourcePresetId || null;

  const loadPresets = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await getAllThemePresets();
      setPresets(loaded);
    } catch {
      setPresets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPresets(); }, [loadPresets]);

  const filteredPresets = useMemo(() => presets.filter(preset =>
    !searchQuery || preset.name.includes(searchQuery) || preset.description.includes(searchQuery)
  ), [presets, searchQuery]);

  const selectedPreset = useMemo(
    () => filteredPresets.find((preset) => preset.id === activePresetId) || presets.find((preset) => preset.id === activePresetId) || null,
    [activePresetId, filteredPresets, presets],
  );

  const handleApply = useCallback(async () => {
    if (!selectedPreset) {
      message.warning('请先选择一个风格预设');
      return;
    }

    try {
      const styleSnapshot = await createProjectStyleSnapshot(selectedPreset.id);
      const project = await loadProject(projectId);
      if (!project) {
        throw new Error('项目不存在');
      }
      project.stylePresetId = selectedPreset.id;
      project.styleSnapshot = styleSnapshot;
      await saveProject(project);
      onProjectStyleApplied?.({
        stylePresetId: selectedPreset.id,
        styleSnapshot,
      });

      const shots = await loadEpisodeShots(projectId, episodeId);
      const resolvedScope = session.impactScope === 'future-only'
        ? { label: '仅影响后续新生成', shots: [], shotIds: [] }
        : resolveStoryboardScope(shots, storyboardContext, session.impactScope);
      const plan = {
        presetId: selectedPreset.id,
        presetName: selectedPreset.name,
        scope: session.impactScope,
        scopeLabel: resolvedScope.label,
        affectedShotCount: resolvedScope.shots.length,
        templateLevel: session.reinferenceLevel,
        summary: session.impactScope === 'future-only'
          ? `风格已切换为 ${selectedPreset.name}，后续新生成内容将自动使用新风格。`
          : `风格已切换为 ${selectedPreset.name}，建议对 ${resolvedScope.label} 的 ${resolvedScope.shots.length} 条分镜执行 ${session.reinferenceLevel} 档重推理。`,
      } satisfies NonNullable<StyleSettingsSession['pendingPlan']>;

      onSessionChange({
        currentStep: 1,
        selectedPresetId: selectedPreset.id,
        pendingPlan: plan,
        draftSummary: plan.summary,
        affectedScopeLabel: plan.scopeLabel,
        affectedCount: plan.affectedShotCount,
        lastApplied: {
          appliedAt: Date.now(),
          summary: `应用风格 ${selectedPreset.name}`,
          affectedCount: plan.affectedShotCount,
          scopeLabel: plan.scopeLabel,
        },
      });

      if (session.impactScope !== 'future-only') {
        onPrepareInferencePlan?.({
          scope: session.impactScope,
          templateLevel: session.reinferenceLevel,
          affectedScopeLabel: plan.scopeLabel,
          affectedCount: plan.affectedShotCount,
          draftSummary: plan.summary,
        });
      }

      message.success(`已应用风格: ${selectedPreset.name}`);
    } catch (err: any) {
      message.error(err?.message || '应用风格失败');
    }
  }, [episodeId, message, onPrepareInferencePlan, onProjectStyleApplied, onSessionChange, projectId, selectedPreset, session.impactScope, session.reinferenceLevel, storyboardContext]);

  const handleCreateStyle = useCallback(async () => {
    try {
      const values = await form.validateFields();
      const newPreset = await addCustomThemePreset({
        name: values.name,
        description: values.description || '',
        ttiStylePrefix: values.ttiStylePrefix || '',
        llmPromptSuffix: values.llmPromptSuffix || '',
      });
      setPresets(prev => [
        {
          ...newPreset,
          sourceType: 'custom',
          sourcePresetId: newPreset.id,
        },
        ...prev,
      ]);
      setCreateModalOpen(false);
      form.resetFields();
      onSessionChange({ selectedPresetId: newPreset.id });
      message.success('自定义风格已创建');
    } catch (err: any) {
      if (err.errorFields) {
        return;
      }
      message.error('创建失败');
    }
  }, [form, message, onSessionChange]);

  const scopeOptions: Array<{ value: StyleImpactScope; label: string }> = [
    { value: 'future-only', label: '仅影响后续新生成' },
    { value: 'current-shot', label: '重推理当前分镜' },
    { value: 'current-chapter', label: '重推理当前章节' },
    { value: 'selected-shots', label: '重推理选中分镜' },
    { value: 'all-shots', label: '重推理全部分镜' },
  ];

  if (loading) {
    return <div className="flex justify-center p-8"><Spin /></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="pb-4 border-b border-zinc-800 mb-4 flex gap-2">
        <Search
          placeholder="搜索风格..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          allowClear
          size="small"
          className="flex-1"
        />
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalOpen(true)}
        >
          新建
        </Button>
      </div>
      <div className="flex-1 space-y-4">
        {filteredPresets.length === 0 ? (
          <Empty description="暂无风格预设，点击新建创建一个" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button type="primary" size="small" onClick={() => setCreateModalOpen(true)}>
              新建风格
            </Button>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filteredPresets.map(preset => {
              const isActive = activePresetId === preset.id;
              return (
                <Card
                  key={preset.id}
                  size="small"
                  className={`bg-zinc-900 cursor-pointer transition-colors hover:bg-zinc-800/80 ${
                    isActive
                      ? 'border-blue-500'
                      : 'border-zinc-700 hover:border-zinc-500'
                  }`}
                  styles={{ body: { padding: '10px 14px' } }}
                  onClick={() => onSessionChange({ selectedPresetId: preset.id })}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Text className="text-zinc-200">{preset.name}</Text>
                        <Tag className="m-0 text-[10px]">
                          {preset.sourceType === 'builtin' ? '内置' : '自定义'}
                        </Tag>
                      </div>
                      <Text type="secondary" className="text-xs block mt-1 truncate">
                        {preset.description}
                      </Text>
                    </div>
                    {isActive && (
                      <CheckCircleFilled className="text-emerald-500 text-lg shrink-0" />
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3 space-y-3">
          <div>
            <Text className="text-zinc-400 text-xs">影响范围</Text>
            <Segmented
              className="mt-2"
              block
              value={session.impactScope}
              onChange={(value) => onSessionChange({ impactScope: value as StyleImpactScope })}
              options={scopeOptions}
            />
          </div>
          <div>
            <Text className="text-zinc-400 text-xs">重推理档位</Text>
            <Segmented
              className="mt-2"
              value={session.reinferenceLevel}
              onChange={(value) => onSessionChange({ reinferenceLevel: value as StyleSettingsSession['reinferenceLevel'] })}
              options={[
                { label: '基础', value: 'basic' },
                { label: '进阶', value: 'advanced' },
                { label: '工作室级', value: 'studio' },
              ]}
            />
          </div>
          <Button type="primary" onClick={handleApply} disabled={!selectedPreset}>
            应用当前风格并生成计划
          </Button>
          {session.pendingPlan && (
            <div className="rounded border border-emerald-800/60 bg-emerald-950/20 p-3 text-xs text-zinc-200 space-y-2">
              <div>{session.pendingPlan.summary}</div>
              <div className="text-zinc-400">
                范围: {session.pendingPlan.scopeLabel} / {session.pendingPlan.affectedShotCount} 条分镜
              </div>
              {session.pendingPlan.scope !== 'future-only' && (
                <Button size="small" onClick={onOpenInference}>
                  去推理面板继续执行
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        title="新建自定义风格"
        open={createModalOpen}
        onOk={handleCreateStyle}
        onCancel={() => { setCreateModalOpen(false); form.resetFields(); }}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="风格名称" rules={[{ required: true, message: '请输入风格名称' }]}>
            <Input placeholder="如：3D动漫风格" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="风格的简短描述" />
          </Form.Item>
          <Form.Item name="ttiStylePrefix" label="TTI 提示词前缀" help="生成图片时自动添加到提示词前面">
            <TextArea rows={3} placeholder="如：3D anime style, cinematic lighting, detailed..." />
          </Form.Item>
          <Form.Item name="llmPromptSuffix" label="LLM 提示词后缀" help="调用 LLM 时自动添加的风格说明">
            <TextArea rows={2} placeholder="如：使用3D动漫风格描述画面" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
