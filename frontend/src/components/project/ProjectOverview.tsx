/**
 * 项目概览页面
 * 三栏式工作台布局：左侧剧集导航(360px) | 中间剧本编辑区 | 右侧资产面板(340px)
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Tag, Tooltip, App } from 'antd';
import { SettingOutlined, LoadingOutlined } from '@ant-design/icons';
import {
  Film, Package, ChevronLeft, ChevronRight,
  PanelLeftClose, PanelRightClose, Sparkles,
} from 'lucide-react';
import type { Project, Episode } from '../../types';
import type { EpisodeEditorEntryOptions } from '../../workflow/episodeEditorEntry';
import { EpisodeManager, EpisodeManagerRef } from './EpisodeManager';
import { ProjectAssetOverview, type ProjectAssetOverviewRef } from './ProjectAssetOverview';
import { ScriptWorkbench, type ScriptWorkbenchRef } from './ScriptWorkbench';
import { ScriptImportDialog } from './ScriptImportDialog';
import { listEpisodes, loadEpisode } from '../../store/projectStore';
import { createLogger } from '../../store/logger';

const logger = createLogger('ProjectOverview');

interface ProjectOverviewProps {
  project: Project;
  onEnterEpisode: (episode: Episode, options?: EpisodeEditorEntryOptions) => void;
  onProjectUpdate: (updates: Partial<Project>) => void;
  onOpenProjectSettings?: () => void;
  /**
   * 当中间剧本面板里的 scriptText 发生变化时回调到外层。
   * 当 ProjectOverview 内嵌到 EditorView 'script' 步时，由 ScriptStep 透传给上层
   * 让顶部 StepNavigator 能据此派生 'script' 步的"已完成"状态。
   */
  onScriptChange?: (text: string) => void;
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  project,
  onEnterEpisode,
  onProjectUpdate: _onProjectUpdate,
  onOpenProjectSettings,
  onScriptChange,
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

  // 触发当前剧本解析（按钮在右侧资产面板顶部，逻辑由 ScriptWorkbench 通过 ref 暴露）
  const handleAnalyzeClick = useCallback(() => {
    if (!selectedEpisode) {
      message.warning('请先选择剧集');
      return;
    }
    scriptWorkbenchRef.current?.analyze();
  }, [selectedEpisode, message]);

  // 初始加载时自动选中第一集
  useEffect(() => {
    const loadFirstEpisode = async () => {
      try {
        const episodes = await listEpisodes(project.id);
        if (episodes.length > 0 && !selectedEpisode) {
          setSelectedEpisode(episodes[0]);
          // 同步到外层，让后续步骤的 ctx.activeEpisode 对齐
          onEnterEpisode(episodes[0]);
          onScriptChange?.(episodes[0].scriptText || '');
        }
      } catch (err) {
        logger.error('加载剧集失败:', err);
      }
    };
    loadFirstEpisode();
  }, [project.id]);

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

  const handleImported = useCallback((episodes: Episode[]) => {
    episodeManagerRef.current?.refresh();
    assetOverviewRef.current?.refresh();
    setSelectedEpisode(episodes.length > 0 ? episodes[0] : null);
  }, []);

  const openScriptImport = useCallback(() => {
    setScriptImportVisible(true);
  }, []);

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* HeaderBar — 极简版：项目标识 + 项目设置（合并了项目名 / 题材 / 风格 / 模型选择） */}
      <div className="flex-shrink-0 h-12 px-4 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-lg flex items-center justify-center">
            <Film className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-medium text-zinc-200">{project.title}</span>
          <Tag className="!m-0 !text-xs !bg-emerald-900/30 !text-emerald-400 !border-emerald-800/50">
            {project.genre || '未分类'}
          </Tag>
        </div>
        <button
          onClick={() => onOpenProjectSettings?.()}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-300 transition-colors"
          title="项目名 / 题材 / 风格 / 模型选择 都在这里"
        >
          <SettingOutlined />
          项目设置
        </button>
      </div>

      {/* Three-Column Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: EpisodePanel - 360px */}
        <div className={`bg-zinc-900 flex flex-col transition-all duration-300 ${
          leftCollapsed ? 'w-0 overflow-hidden' : 'w-[360px]'
        }`}>
          {/* Panel Header - 48px */}
          <div className="h-12 px-4 flex items-center justify-between border-b border-zinc-800/80">
            <span className="text-sm font-medium text-zinc-400">剧集管理</span>
            <button
              onClick={() => setLeftCollapsed(true)}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
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
          <div className="flex items-center border-r border-zinc-800">
            <button
              onClick={() => setLeftCollapsed(false)}
              className="h-full px-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Center: Script Workbench */}
        <div className="flex-1 flex flex-col min-w-[400px] overflow-hidden border-x border-zinc-800/50">
          <ScriptWorkbench
            ref={scriptWorkbenchRef}
            project={project}
            episode={selectedEpisode}
            onScriptChange={handleScriptChange}
            onImportScript={openScriptImport}
            onAnalyzingChange={setIsAnalyzing}
          />
        </div>

        {/* Right Collapse Button */}
        {rightCollapsed && (
          <div className="flex items-center border-l border-zinc-800">
            <button
              onClick={() => setRightCollapsed(false)}
              className="h-full px-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Right: AssetPanel - 340px */}
        <div className={`bg-zinc-900 flex flex-col transition-all duration-300 ${
          rightCollapsed ? 'w-0 overflow-hidden' : 'w-[340px]'
        }`}>
          {/* Panel Header - 48px */}
          <div className="h-12 px-4 flex items-center justify-between border-b border-zinc-800/80">
            <span className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Package className="w-4 h-4" />
              项目资产
            </span>
            <button
              onClick={() => setRightCollapsed(true)}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
          {/* 解析剧本入口（取代原工具栏的解析按钮，挂到资产面板上方） */}
          <div className="px-3 py-2 border-b border-zinc-800/80">
            <Tooltip
              title={!selectedEpisode
                ? '请先选择剧集'
                : !(selectedEpisode.scriptText && selectedEpisode.scriptText.trim())
                  ? '当前剧集还没有剧本内容'
                  : isAnalyzing
                    ? '正在解析中...'
                    : '解析当前剧集，提取角色 / 场景 / 道具'}
            >
              <Button
                type="primary"
                size="small"
                block
                icon={isAnalyzing ? <LoadingOutlined spin /> : <Sparkles className="w-3.5 h-3.5" />}
                onClick={handleAnalyzeClick}
                disabled={
                  !selectedEpisode
                  || !(selectedEpisode.scriptText && selectedEpisode.scriptText.trim())
                  || isAnalyzing
                }
                className="bg-emerald-600 hover:!bg-emerald-500 border-none"
              >
                {isAnalyzing ? '解析中...' : '解析剧本'}
              </Button>
            </Tooltip>
          </div>
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
