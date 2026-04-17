/**
 * StoryboardWorkspace - 以分镜为中心的主工作区
 * 替代原有三步线性流程和 overview 页面
 * 包含：顶部工具栏（含剧集切换）+ 分镜列表 + 右侧工具面板
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Button, Empty, Select, Spin, Tooltip, App } from 'antd';
import {
  FileTextOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  FormatPainterOutlined,
  ExportOutlined,
  RobotOutlined,
  PlusOutlined,
  SettingOutlined,
  ExperimentOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import type { Project, Episode, AppSettings, ProjectStyleSnapshot, MediaModelSelection } from '../../types';
import type { MentionItem } from '../../editor';
import { Storyboard } from './Storyboard';
import { ToolPanelDrawer } from './panels/ToolPanelDrawer';
import { serializeMediaSelection, parseMediaSelectionKey } from '../../providers/channel/resolver';
import { listEpisodes, createEpisode, loadProject, saveProject } from '../../store/projectStore';
import { createLogger } from '../../store/logger';
import {
  buildProjectMediaCategoryState,
  PROJECT_MEDIA_BASE_REQUIREMENTS,
  type ProjectMediaCategoryKey,
} from '../project/projectMediaSelectionState';
import {
  createDefaultStoryboardWorkflowContext,
  createDefaultWorkflowPanelSessions,
  ensureWorkflowPanelSessions,
  type StoryboardWorkflowContext,
  type WorkflowPanelId,
  type WorkflowPanelSessions,
} from './panels/workflowSessions';
import {
  loadStoryboardWorkspaceState,
  saveStoryboardWorkspaceState,
} from './storyboardWorkspaceState';

const logger = createLogger('StoryboardWorkspace');

export type ToolPanelId = WorkflowPanelId;
type ProjectMediaSelections = Partial<Record<ProjectMediaCategoryKey, MediaModelSelection>>;

const TOOL_BUTTONS: { id: ToolPanelId; label: string; icon: React.ReactNode }[] = [
  { id: 'script', label: '剧本', icon: <FileTextOutlined /> },
  { id: 'assets', label: '资产', icon: <TeamOutlined /> },
  { id: 'inference', label: '推理', icon: <ThunderboltOutlined /> },
  { id: 'style', label: '风格', icon: <FormatPainterOutlined /> },
  { id: 'export', label: '导出', icon: <ExportOutlined /> },
  { id: 'assistant', label: '流程', icon: <RobotOutlined /> },
];

interface StoryboardWorkspaceProps {
  activeProject: Project;
  activeEpisode: Episode | null;
  scriptText: string;
  appSettings: AppSettings;
  mentionItems: MentionItem[];
  styleSnapshot?: ProjectStyleSnapshot;
  onViewChange: (view: 'projects') => void;
  onEpisodeChange?: (episode: Episode) => void;
  onProjectStyleApplied?: (updates: { stylePresetId: string; styleSnapshot: ProjectStyleSnapshot }) => void;
}

export const StoryboardWorkspace: React.FC<StoryboardWorkspaceProps> = ({
  activeProject,
  activeEpisode,
  scriptText,
  appSettings,
  mentionItems,
  styleSnapshot,
  onViewChange,
  onEpisodeChange,
  onProjectStyleApplied,
}) => {
  const { message } = App.useApp();
  const [activePanel, setActivePanel] = useState<ToolPanelId | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [storyboardRefreshKey, setStoryboardRefreshKey] = useState(0);
  const [storyboardAssetRefreshKey, setStoryboardAssetRefreshKey] = useState(0);
  const [projectMediaSelections, setProjectMediaSelections] = useState<ProjectMediaSelections>(activeProject.mediaSelections || {});
  const [workflowSessionsByEpisode, setWorkflowSessionsByEpisode] = useState<Record<string, Partial<WorkflowPanelSessions>>>({});
  const [storyboardContext, setStoryboardContext] = useState<StoryboardWorkflowContext>(createDefaultStoryboardWorkflowContext());
  const [restoredStoryboardContextByEpisode, setRestoredStoryboardContextByEpisode] = useState<Record<string, Pick<StoryboardWorkflowContext, 'activeShotId' | 'selectedShotIds'>>>({});
  const [hydratedEpisodes, setHydratedEpisodes] = useState<Record<string, boolean>>({});

  const reloadEpisodes = useCallback(async (preferredEpisodeId?: string) => {
    setLoadingEpisodes(true);
    try {
      const nextEpisodes = (await listEpisodes(activeProject.id)).sort((a, b) => a.number - b.number);
      setEpisodes(nextEpisodes);

      const targetId = preferredEpisodeId ?? activeEpisode?.id;
      const targetEpisode = targetId
        ? nextEpisodes.find(episode => episode.id === targetId)
        : nextEpisodes[0];

      if (targetEpisode) {
        onEpisodeChange?.(targetEpisode);
      }
    } catch (err) {
      logger.error('加载剧集列表失败', err);
    } finally {
      setLoadingEpisodes(false);
    }
  }, [activeEpisode?.id, activeProject.id, onEpisodeChange]);

  const handleShotsChanged = useCallback(() => {
    setStoryboardRefreshKey(prev => prev + 1);
  }, []);

  const handleAssetsChanged = useCallback(() => {
    setStoryboardAssetRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    setProjectMediaSelections(activeProject.mediaSelections || {});
  }, [activeProject.id, activeProject.mediaSelections]);

  const mediaSelectionStates = useMemo(() => ({
    llm: buildProjectMediaCategoryState({
      settings: appSettings,
      category: 'llm',
      explicitSelection: projectMediaSelections.llm,
      requirement: PROJECT_MEDIA_BASE_REQUIREMENTS.llm,
    }),
    tti: buildProjectMediaCategoryState({
      settings: appSettings,
      category: 'tti',
      explicitSelection: projectMediaSelections.tti,
      requirement: PROJECT_MEDIA_BASE_REQUIREMENTS.tti,
    }),
    itv: buildProjectMediaCategoryState({
      settings: appSettings,
      category: 'itv',
      explicitSelection: projectMediaSelections.itv,
    }),
    tts: buildProjectMediaCategoryState({
      settings: appSettings,
      category: 'tts',
      explicitSelection: projectMediaSelections.tts,
      requirement: PROJECT_MEDIA_BASE_REQUIREMENTS.tts,
    }),
  }), [appSettings, projectMediaSelections]);

  const llmSelection = serializeMediaSelection(projectMediaSelections.llm);
  const ttiSelection = serializeMediaSelection(projectMediaSelections.tti);
  const itvSelection = serializeMediaSelection(projectMediaSelections.itv);
  const ttsSelection = serializeMediaSelection(projectMediaSelections.tts);

  const handleMediaSelectionChange = useCallback(async (category: ProjectMediaCategoryKey, value?: string) => {
    const parsed = parseMediaSelectionKey(value);
    const nextSelections: ProjectMediaSelections = {
      ...projectMediaSelections,
    };
    if (parsed) {
      nextSelections[category] = parsed;
    } else {
      delete nextSelections[category];
    }

    setProjectMediaSelections(nextSelections);
    try {
      const project = await loadProject(activeProject.id);
      if (!project) {
        throw new Error('项目不存在');
      }
      project.mediaSelections = nextSelections;
      await saveProject(project);
    } catch (error: any) {
      setProjectMediaSelections(activeProject.mediaSelections || {});
      message.error(`更新模型配置失败: ${error?.message || '未知错误'}`);
    }
  }, [activeProject.id, activeProject.mediaSelections, message, projectMediaSelections]);

  const renderQuickSelector = useCallback((
    category: ProjectMediaCategoryKey,
    icon: React.ReactNode,
    colorClassName: string,
    emptyTitle: string,
    readyTitle: string,
  ) => {
    const state = mediaSelectionStates[category];
    const tooltipLines = [
      state.options.length === 0 ? emptyTitle : readyTitle,
      state.requirement?.description,
      state.fallbackLabel ? `全局默认: ${state.fallbackLabel}` : undefined,
      state.warning,
    ].filter(Boolean);

    return (
      <Tooltip key={category} title={tooltipLines.join('；')}>
        <div className="flex items-center gap-1">
          <span className={colorClassName}>{icon}</span>
          <Select
            value={state.explicitSupported ? state.explicitValue : undefined}
            onChange={(nextValue) => void handleMediaSelectionChange(category, nextValue)}
            placeholder={state.fallbackLabel ? `默认 · ${state.fallbackLabel}` : '默认'}
            allowClear
            size="small"
            status={state.warning ? 'warning' : undefined}
            className="!w-36"
            popupMatchSelectWidth={false}
            options={state.options.map((option) => ({
              value: option.value,
              label: `${option.channelLabel} / ${option.modelLabel}`,
            }))}
            notFoundContent="请先在设置中配置"
          />
        </div>
      </Tooltip>
    );
  }, [handleMediaSelectionChange, mediaSelectionStates]);

  useEffect(() => {
    if (!activeEpisode) {
      setStoryboardContext(createDefaultStoryboardWorkflowContext());
      return;
    }

    const persisted = loadStoryboardWorkspaceState(activeProject.id, activeEpisode.id);
    const restoredContext = {
      activeShotId: persisted?.context?.activeShotId ?? null,
      selectedShotIds: persisted?.context?.selectedShotIds || [],
    };

    setActivePanel(persisted?.activePanel ?? null);
    setWorkflowSessionsByEpisode(prev => ({
      ...prev,
      [activeEpisode.id]: persisted?.workflowSessions || prev[activeEpisode.id] || createDefaultWorkflowPanelSessions(),
    }));
    setRestoredStoryboardContextByEpisode(prev => ({
      ...prev,
      [activeEpisode.id]: restoredContext,
    }));
    setStoryboardContext({
      ...createDefaultStoryboardWorkflowContext(),
      ...restoredContext,
    });
    setHydratedEpisodes(prev => ({
      ...prev,
      [activeEpisode.id]: true,
    }));
  }, [activeEpisode?.id, activeProject.id]);

  const activeWorkflowSessions = useMemo(() => {
    if (!activeEpisode) {
      return createDefaultWorkflowPanelSessions();
    }
    return ensureWorkflowPanelSessions(workflowSessionsByEpisode[activeEpisode.id]);
  }, [workflowSessionsByEpisode, activeEpisode]);

  useEffect(() => {
    if (!activeEpisode || !hydratedEpisodes[activeEpisode.id]) {
      return;
    }

    saveStoryboardWorkspaceState(activeProject.id, activeEpisode.id, {
      activePanel,
      workflowSessions: workflowSessionsByEpisode[activeEpisode.id] || activeWorkflowSessions,
      context: {
        activeShotId: storyboardContext.activeShotId,
        selectedShotIds: storyboardContext.selectedShotIds,
      },
      updatedAt: Date.now(),
    });
  }, [
    activeEpisode,
    activePanel,
    activeProject.id,
    activeWorkflowSessions,
    hydratedEpisodes,
    storyboardContext.activeShotId,
    storyboardContext.selectedShotIds,
    workflowSessionsByEpisode,
  ]);

  // 加载剧集列表
  useEffect(() => {
    let cancelled = false;
    setLoadingEpisodes(true);
    listEpisodes(activeProject.id)
      .then(eps => { if (!cancelled) setEpisodes(eps.sort((a, b) => a.number - b.number)); })
      .catch(err => logger.error('加载剧集列表失败', err))
      .finally(() => { if (!cancelled) setLoadingEpisodes(false); });
    return () => { cancelled = true; };
  }, [activeProject.id]);

  // 无剧集时自动创建第一集
  useEffect(() => {
    if (!loadingEpisodes && episodes.length === 0 && !activeEpisode) {
      createEpisode(activeProject.id, {
        number: 1,
        title: '第1集',
        status: 'draft',
      }).then(ep => {
        setEpisodes([ep]);
        onEpisodeChange?.(ep);
      }).catch(err => logger.error('自动创建剧集失败', err));
    }
  }, [loadingEpisodes, episodes.length, activeEpisode, activeProject.id, onEpisodeChange]);

  // 无 activeEpisode 但有 episodes 时，自动选第一集
  useEffect(() => {
    if (!activeEpisode && episodes.length > 0) {
      onEpisodeChange?.(episodes[0]);
    }
  }, [activeEpisode, episodes, onEpisodeChange]);

  const handleToolClick = useCallback((panelId: ToolPanelId) => {
    setActivePanel(prev => prev === panelId ? null : panelId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  const openPanel = useCallback((panelId: ToolPanelId) => {
    setActivePanel(panelId);
  }, []);

  const handleEpisodeSwitch = useCallback((episodeId: string) => {
    const ep = episodes.find(e => e.id === episodeId);
    if (ep) onEpisodeChange?.(ep);
  }, [episodes, onEpisodeChange]);

  const handleAddEpisode = useCallback(async () => {
    try {
      const nextNum = episodes.length > 0 ? Math.max(...episodes.map(e => e.number)) + 1 : 1;
      const ep = await createEpisode(activeProject.id, {
        number: nextNum,
        title: `第${nextNum}集`,
        status: 'draft',
      });
      setEpisodes(prev => [...prev, ep].sort((a, b) => a.number - b.number));
      onEpisodeChange?.(ep);
    } catch (err) {
      logger.error('创建剧集失败', err);
    }
  }, [episodes, activeProject.id, onEpisodeChange]);

  const updateWorkflowSession = useCallback(<K extends keyof WorkflowPanelSessions,>(
    panelId: K,
    updates: Partial<WorkflowPanelSessions[K]>,
  ) => {
    if (!activeEpisode) {
      return;
    }

    setWorkflowSessionsByEpisode(prev => {
      const current = ensureWorkflowPanelSessions(prev[activeEpisode.id]);
      return {
        ...prev,
        [activeEpisode.id]: {
          ...current,
          [panelId]: {
            ...current[panelId],
            ...updates,
          },
        },
      };
    });
  }, [activeEpisode]);

  const panelTitles: Record<ToolPanelId, string> = {
    script: '剧本工作室',
    assets: '资产管理',
    inference: '章节推理',
    style: '风格设置',
    export: '导出中心',
    assistant: '工作流预设',
  };

  // 加载中
  if (loadingEpisodes && !activeEpisode) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  // 等待自动创建/选择剧集
  if (!activeEpisode) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4">
        <Empty description="正在准备工作区..." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="h-12 flex items-center px-4 bg-zinc-900 border-b border-zinc-800 shrink-0 gap-2">
        {/* 工具按钮组 */}
        <div className="flex items-center gap-1">
          {TOOL_BUTTONS.map(btn => (
            <Button
              key={btn.id}
              type={activePanel === btn.id ? 'primary' : 'text'}
              size="small"
              icon={btn.icon}
              onClick={() => handleToolClick(btn.id)}
              className={activePanel === btn.id ? '' : 'text-zinc-400 hover:text-zinc-200'}
            >
              {btn.label}
            </Button>
          ))}
        </div>

        <div className="flex-1 flex items-center justify-center gap-2 overflow-x-auto px-4">
          {renderQuickSelector('llm', <ExperimentOutlined />, 'text-blue-400', '请先在设置中配置 LLM 模型', 'LLM 大语言模型')}
          {renderQuickSelector('tti', <PictureOutlined />, 'text-purple-400', '请先在设置中配置 TTI 服务', '文生图 TTI')}
          {renderQuickSelector('itv', <VideoCameraOutlined />, 'text-orange-400', '请先在设置中配置 ITV 服务', '项目视频模型')}
          {renderQuickSelector('tts', <SoundOutlined />, 'text-emerald-400', '请先在设置中配置 TTS 服务', '语音合成 TTS')}
        </div>

        {/* 剧集切换器 */}
        <Select
          size="small"
          value={activeEpisode.id}
          onChange={handleEpisodeSwitch}
          className="w-32"
          popupMatchSelectWidth={false}
          options={episodes.map(ep => ({
            value: ep.id,
            label: ep.title || `第${ep.number}集`,
          }))}
          dropdownRender={menu => (
            <>
              {menu}
              <div className="border-t border-zinc-700 p-1">
                <Button type="text" size="small" icon={<PlusOutlined />} onClick={handleAddEpisode} block className="text-zinc-400">
                  新建剧集
                </Button>
              </div>
            </>
          )}
        />
      </div>

      {/* 分镜列表主区域 */}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0">
          <Storyboard
            projectId={activeProject.id}
            episodeId={activeEpisode.id}
            episodeName={activeEpisode.title || `第${activeEpisode.number}集`}
            script={scriptText}
            aspectRatio={activeProject.aspectRatio || '16:9'}
            llmSelection={llmSelection}
            ttiSelection={ttiSelection}
            itvSelection={itvSelection}
            ttsSelection={ttsSelection}
            settings={appSettings}
            styleSnapshot={styleSnapshot}
            mentionItems={mentionItems}
            refreshToken={storyboardRefreshKey}
            assetRefreshToken={storyboardAssetRefreshKey}
            onRequestScriptWorkflow={() => openPanel('script')}
            onStoryboardContextChange={setStoryboardContext}
            initialActiveShotId={restoredStoryboardContextByEpisode[activeEpisode.id]?.activeShotId ?? null}
            initialSelectedShotIds={restoredStoryboardContextByEpisode[activeEpisode.id]?.selectedShotIds || []}
          />
        </div>
      </div>

      {/* 右侧工具面板 */}
      <ToolPanelDrawer
        open={activePanel !== null}
        title={activePanel ? panelTitles[activePanel] : ''}
        onClose={handleClosePanel}
        panelId={activePanel}
        projectId={activeProject.id}
        episodeId={activeEpisode.id}
        ttiSelection={ttiSelection}
        activeStylePresetId={activeProject.stylePresetId}
        styleSnapshot={styleSnapshot}
        onShotsChanged={handleShotsChanged}
        onAssetsChanged={handleAssetsChanged}
        onProjectStyleApplied={onProjectStyleApplied}
        workflowSessions={activeWorkflowSessions}
        storyboardContext={storyboardContext}
        onScriptSessionChange={(updates) => updateWorkflowSession('script', updates)}
        onAssetSessionChange={(updates) => updateWorkflowSession('assets', updates)}
        onInferenceSessionChange={(updates) => updateWorkflowSession('inference', updates)}
        onStyleSessionChange={(updates) => updateWorkflowSession('style', updates)}
        onExportSessionChange={(updates) => updateWorkflowSession('export', updates)}
        onAssistantSessionChange={(updates) => updateWorkflowSession('assistant', updates)}
        onEpisodesChanged={reloadEpisodes}
        onOpenPanel={openPanel}
      />
    </div>
  );
};
