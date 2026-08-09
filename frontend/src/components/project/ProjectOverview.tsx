/**
 * 项目概览页面
 * 三栏式工作台布局：左侧剧集导航(360px) | 中间剧本编辑区 | 右侧资产面板(340px)
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { App } from 'antd';
import {
  Package, ChevronLeft, ChevronRight,
  PanelLeftClose, PanelRightClose,
} from 'lucide-react';
import type { Project, Episode, EpisodeAnalysis, Shot } from '../../types';
import type { EpisodeEditorEntryOptions } from '../../workflow/episodeEditorEntry';
import { EpisodeManager, EpisodeManagerRef } from './EpisodeManager';
import { ProjectAssetOverview, type ProjectAssetOverviewRef } from './ProjectAssetOverview';
import { ScriptWorkbench, type ScriptWorkbenchRef } from './ScriptWorkbench';
import { ScriptImportDialog } from './ScriptImportDialog';
import { listEpisodes, loadEpisode } from '../../store/projectStore';
import { createLogger } from '../../store/logger';
import { loadEpisodeAnalysis, loadEpisodeShots, loadCharacters, loadScenes, loadProps } from '../../store/projectStore';
import { useTasks, useTaskTransitions } from '../../hooks';
import { submitShotAnalysisTask } from '../../services/analysisTaskClient';
import { serializeMediaSelection } from '../../providers/channel/resolver';
import {
  buildProjectProductionReadiness,
  type ProductionNextActionType,
} from '../../services/projectProductionReadiness';
import { ProjectProductionReadinessPanel } from './ProjectProductionReadinessPanel';

const logger = createLogger('ProjectOverview');

interface ProjectOverviewProps {
  project: Project;
  /** 从其他编辑步骤返回项目工作台时优先恢复该剧集。 */
  activeEpisodeId?: string;
  onEnterEpisode: (episode: Episode, options?: EpisodeEditorEntryOptions) => void;
  onProjectUpdate: (updates: Partial<Project>) => void;
  /**
   * 当中间剧本面板里的 scriptText 发生变化时回调到外层。
   * 当 ProjectOverview 内嵌到 EditorView 'script' 步时，由 ScriptStep 透传给上层
   * 让顶部 StepNavigator 能据此派生 'script' 步的"已完成"状态。
   */
  onScriptChange?: (text: string) => void;
  /**
   * 来自顶部步骤条"导入剧本"按钮的递增信号；每次自增触发打开导入对话框。
   * 信号模式而非函数 ref：避免把 dialog 提到 EditorView 后还要重新搭刷新通道。
   */
  openImportSignal?: number;
  /** 在统一项目步骤内打开完整资产编辑器（兼容旧 assets step）。 */
  onOpenAssets?: () => void;
  /** 在统一项目步骤内打开当前剧集分镜。 */
  onOpenStoryboard?: () => void;
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  project,
  activeEpisodeId,
  onEnterEpisode,
  onProjectUpdate: _onProjectUpdate,
  onScriptChange,
  openImportSignal,
  onOpenAssets,
  onOpenStoryboard,
}) => {
  const { message } = App.useApp();
  const episodeManagerRef = useRef<EpisodeManagerRef>(null);
  const scriptWorkbenchRef = useRef<ScriptWorkbenchRef>(null);
  const assetOverviewRef = useRef<ProjectAssetOverviewRef>(null);

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [scriptImportVisible, setScriptImportVisible] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 当前选中的剧集（用于中间区域剧本编辑）
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [episodeAnalysis, setEpisodeAnalysis] = useState<EpisodeAnalysis | null>(null);
  const [episodeShots, setEpisodeShots] = useState<Shot[]>([]);
  const [productionAssets, setProductionAssets] = useState<{
    characters: import('../../types').Character[];
    scenes: import('../../types').Scene[];
    props: import('../../types').Prop[];
  }>({ characters: [], scenes: [], props: [] });
  const [productionLoading, setProductionLoading] = useState(false);
  const [isStartingShots, setIsStartingShots] = useState(false);

  // 最新值 refs：让"按 project.id 触发一次"的初始化 effect 读到当前回调与选中态，
  // 避免把每轮渲染都重建的父级回调加进依赖导致重复拉取剧集列表
  const selectedEpisodeRef = useRef<Episode | null>(null);
  selectedEpisodeRef.current = selectedEpisode;
  const onEnterEpisodeRef = useRef(onEnterEpisode);
  onEnterEpisodeRef.current = onEnterEpisode;
  const onScriptChangeRef = useRef(onScriptChange);
  onScriptChangeRef.current = onScriptChange;

  const loadProductionData = useCallback(async () => {
    const current = selectedEpisodeRef.current;
    if (!current) {
      setEpisodeAnalysis(null);
      setEpisodeShots([]);
      setProductionAssets({ characters: [], scenes: [], props: [] });
      setProductionLoading(false);
      return;
    }

    setProductionLoading(true);
    try {
      const [analysis, shots, characters, scenes, props] = await Promise.all([
        loadEpisodeAnalysis(project.id, current.id),
        loadEpisodeShots(project.id, current.id),
        loadCharacters(project.id),
        loadScenes(project.id),
        loadProps(project.id),
      ]);
      if (selectedEpisodeRef.current?.id !== current.id) return;
      setEpisodeAnalysis(analysis);
      setEpisodeShots(shots.length > 0 ? shots : (analysis?.shots || []));
      setProductionAssets({ characters, scenes, props });
    } catch (error) {
      logger.error('加载生产就绪度失败:', error);
    } finally {
      if (selectedEpisodeRef.current?.id === current.id) setProductionLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void loadProductionData();
  }, [loadProductionData, selectedEpisode?.id]);

  const productionTasks = useTasks({
    scope: `project:${project.id}`,
    targetKind: 'episode',
    targetId: selectedEpisode?.id,
  }).filter((task) => task.type === 'script-analysis' || task.type === 'shot-analysis');

  const readiness = React.useMemo(() => buildProjectProductionReadiness({
    episode: selectedEpisode,
    analysis: episodeAnalysis,
    characters: productionAssets.characters,
    scenes: productionAssets.scenes,
    props: productionAssets.props,
    shots: episodeShots,
    tasks: productionTasks,
  }), [episodeAnalysis, episodeShots, productionAssets, productionTasks, selectedEpisode]);

  // 初始加载时自动选中第一集
  useEffect(() => {
    let cancelled = false;
    const loadFirstEpisode = async () => {
      try {
        const episodes = await listEpisodes(project.id);
        if (cancelled || episodes.length === 0 || selectedEpisodeRef.current) return;
        const preferred = activeEpisodeId ? episodes.find((item) => item.id === activeEpisodeId) : null;
        const target = preferred || episodes[0];
        setSelectedEpisode(target);
        // 同步到外层，让后续步骤的 ctx.activeEpisode 对齐
        onEnterEpisodeRef.current(target);
        onScriptChangeRef.current?.(target.scriptText || '');
      } catch (err) {
        logger.error('加载剧集失败:', err);
      }
    };
    loadFirstEpisode();
    return () => {
      cancelled = true;
    };
  }, [activeEpisodeId, project.id]);

  // 点击剧集：先保存当前内容，再从磁盘加载最新数据后切换
  const handleEpisodeSelect = useCallback(async (episode: Episode) => {
    await scriptWorkbenchRef.current?.flushSave();
    // 从磁盘加载最新数据，避免使用 EpisodeManager 中的陈旧 scriptText
    const fresh = await loadEpisode(project.id, episode.id);
    const target = fresh || episode;
    setSelectedEpisode(target);
    // 同步剧本到外层（用于 EditorView StepNavigator 的"剧本步已完成"派生）
    onScriptChange?.(target.scriptText || '');
    // 同步当前剧集到外层（让后续步骤的 ctx.activeEpisode 对齐）
    onEnterEpisode(target);
  }, [project.id, onScriptChange, onEnterEpisode]);

  const handleEpisodeUpdate = useCallback((episode: Episode) => {
    setSelectedEpisode(prev => prev?.id === episode.id ? episode : prev);
  }, []);

  // 剧本内容变更（自动保存后回调）
  const handleScriptChange = useCallback((text: string) => {
    setSelectedEpisode(prev => prev ? { ...prev, scriptText: text } : prev);
    onScriptChange?.(text);
  }, [onScriptChange]);

  const handleOpenAssets = useCallback(() => {
    if (!selectedEpisode) {
      message.warning('请先选择剧集');
      return;
    }
    onOpenAssets?.();
  }, [message, onOpenAssets, selectedEpisode]);

  const handleOpenStoryboard = useCallback(() => {
    if (!selectedEpisode) {
      message.warning('请先选择剧集');
      return;
    }
    onOpenStoryboard?.();
  }, [message, onOpenStoryboard, selectedEpisode]);

  const handleReadinessAction = useCallback(async (action: ProductionNextActionType) => {
    if (!selectedEpisode) return;
    if (action === 'mark-script-ready') {
      await scriptWorkbenchRef.current?.markScriptReady();
      return;
    }
    if (action === 'analyze-script') {
      await scriptWorkbenchRef.current?.analyze();
      return;
    }
    if (action !== 'generate-shots') return;
    const savedEpisode = await scriptWorkbenchRef.current?.flushSave();
    const script = (savedEpisode?.scriptText || selectedEpisode.scriptText)?.trim();
    if (!script) {
      message.warning('请先输入剧本内容');
      return;
    }
    setIsStartingShots(true);
    try {
      const { deduped } = await submitShotAnalysisTask({
        projectId: project.id,
        episodeId: selectedEpisode.id,
        episodeName: selectedEpisode.title || `第${selectedEpisode.number}集`,
        script,
        llmSelection: serializeMediaSelection(project.mediaSelections?.llm),
        styleSnapshot: project.styleSnapshot,
      });
      message.info(deduped ? '当前剧集已有分镜任务在进行中' : '分镜生成任务已启动，可继续编辑剧本');
    } catch (error: any) {
      logger.error('启动分镜生成失败:', error);
      message.error(error?.message || '启动分镜生成失败，请重试');
    } finally {
      setIsStartingShots(false);
    }
  }, [message, project.id, project.mediaSelections?.llm, project.styleSnapshot, selectedEpisode]);

  useTaskTransitions(
    {
      scope: `project:${project.id}`,
      type: 'script-analysis',
      targetKind: 'episode',
      targetId: selectedEpisode?.id,
      to: ['completed', 'failed', 'cancelled'],
    },
    () => { void loadProductionData(); },
  );
  useTaskTransitions(
    {
      scope: `project:${project.id}`,
      type: 'shot-analysis',
      targetKind: 'episode',
      targetId: selectedEpisode?.id,
      to: ['completed', 'failed', 'cancelled'],
    },
    () => { void loadProductionData(); },
  );

  const handleImported = useCallback((episodes: Episode[]) => {
    episodeManagerRef.current?.refresh();
    assetOverviewRef.current?.refresh();
    setSelectedEpisode(episodes.length > 0 ? episodes[0] : null);
  }, []);

  // 监听上层"导入剧本"按钮触发的信号；只在严格"自增"时才触发打开。
  // 用 ref 记录上一次值（初始挂载时 prev = current）—— 这样即便用户切到下个 step
  // 再切回，ProjectOverview 重新挂载、上层 signal 仍是非零值时，初次 effect
  // 也不会把它误当成"刚刚自增"而错误打开导入弹窗。
  const prevImportSignalRef = useRef<number>(openImportSignal ?? 0);
  useEffect(() => {
    const current = openImportSignal ?? 0;
    if (current > prevImportSignalRef.current) {
      setScriptImportVisible(true);
    }
    prevImportSignalRef.current = current;
  }, [openImportSignal]);

  return (
    <div className="h-full flex flex-col bg-bg-app overflow-hidden">
      {/* Three-Column Body（项目标识与项目设置已合并到顶部 StepNavigator） */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: EpisodePanel - 360px */}
        <div className={`bg-bg-surface flex flex-col transition-all duration-300 ${
          leftCollapsed ? 'w-0 overflow-hidden' : 'w-[360px]'
        }`}>
          {/* Panel Header - 48px */}
          <div className="h-12 px-4 flex items-center justify-between border-b border-border-subtle/80">
            <span className="text-sm font-medium text-text-secondary">剧集管理</span>
            <button
              onClick={() => setLeftCollapsed(true)}
              className="p-1.5 text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated rounded transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          {/* Episode List */}
          <div className="flex-1 overflow-y-auto p-3">
            <EpisodeManager
              ref={episodeManagerRef}
              projectId={project.id}
              onEpisodeSelect={handleEpisodeSelect}
              onEpisodeUpdate={handleEpisodeUpdate}
              selectedEpisodeId={selectedEpisode?.id}
            />
          </div>
        </div>

        {/* Left Collapse Button */}
        {leftCollapsed && (
          <div className="flex items-center border-r border-border-subtle">
            <button
              onClick={() => setLeftCollapsed(false)}
              className="h-full px-1 text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Center: Script Workbench */}
        <div className="flex-1 flex flex-col min-w-[400px] overflow-hidden border-x border-border-subtle/50">
          <ScriptWorkbench
            ref={scriptWorkbenchRef}
            project={project}
            episode={selectedEpisode}
            onScriptChange={handleScriptChange}
            onAnalyzingChange={setIsAnalyzing}
            onEpisodeUpdate={(updates) => {
              // 把 ScriptWorkbench 内部刚写回 DB 的字段（如 scriptReady）合并到本地剧集状态，
              // 解析按钮 disabled 守门 / 状态徽章 / 下游派生才能立刻生效
              setSelectedEpisode(prev => prev ? { ...prev, ...updates } : prev);
            }}
          />
        </div>

        {/* Right Collapse Button */}
        {rightCollapsed && (
          <div className="flex items-center border-l border-border-subtle">
            <button
              onClick={() => setRightCollapsed(false)}
              className="h-full px-1 text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Right: AssetPanel - 340px */}
        <div className={`bg-bg-surface flex flex-col transition-all duration-300 ${
          rightCollapsed ? 'w-0 overflow-hidden' : 'w-[340px]'
        }`}>
          {/* Panel Header - 48px */}
          <div className="h-12 px-4 flex items-center justify-between border-b border-border-subtle/80">
            <span className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <Package className="w-4 h-4" />
              项目资产
            </span>
            <button
              onClick={() => setRightCollapsed(true)}
              className="p-1.5 text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated rounded transition-colors"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
          <ProjectProductionReadinessPanel
            readiness={readiness}
            onAction={handleReadinessAction}
            onOpenAssets={handleOpenAssets}
            onOpenStoryboard={handleOpenStoryboard}
            busy={productionLoading || isStartingShots || isAnalyzing}
          />
          {/* Asset Content */}
          <div className="flex-1 overflow-hidden">
            <ProjectAssetOverview ref={assetOverviewRef} projectId={project.id} />
          </div>
        </div>
      </div>

      <ScriptImportDialog
        open={scriptImportVisible}
        onClose={() => setScriptImportVisible(false)}
        projectId={project.id}
        onImported={handleImported}
      />
    </div>
  );
};

export default ProjectOverview;
