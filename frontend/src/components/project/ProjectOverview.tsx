/**
 * 项目概览页面
 * 三栏式工作台布局：左侧剧集导航(360px) | 中间剧本编辑区 | 右侧资产面板(340px)
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Input, Tag, App, Modal, Select, Tooltip } from 'antd';
import { ThunderboltOutlined, SettingOutlined } from '@ant-design/icons';
import {
  Film, Upload, Package, ChevronLeft, ChevronRight,
  PanelLeftClose, PanelRightClose, Pencil, Brain, Image, Video, Volume2,
} from 'lucide-react';
import type { Project, Episode } from '../../types';
import type { EpisodeEditorEntryOptions } from '../../workflow/episodeEditorEntry';
import { EpisodeManager, EpisodeManagerRef } from './EpisodeManager';
import { EpisodeSplitWizard } from './EpisodeSplitWizard';
import { ProjectAssetOverview, type ProjectAssetOverviewRef } from './ProjectAssetOverview';
import { ScriptWorkbench, type ScriptWorkbenchRef } from './ScriptWorkbench';
import {
  saveProject, loadProject, listEpisodes, loadEpisode,
  deleteEpisode, saveCharacters, saveScenes, saveProps,
} from '../../store/projectStore';
import { loadSettings } from '../../store/globalStore';
import { TaskManager } from '../../services/TaskManager';
import { createLogger } from '../../store/logger';
import { ScriptEditor } from '../../editor';
import {
  parseMediaSelectionKey,
} from '../../providers/channel/resolver';
import {
  buildProjectMediaCategoryState,
  PROJECT_MEDIA_BASE_REQUIREMENTS,
  type ProjectMediaCategoryKey,
} from './projectMediaSelectionState';

const logger = createLogger('ProjectOverview');

interface ProjectOverviewProps {
  project: Project;
  onEnterEpisode: (episode: Episode, options?: EpisodeEditorEntryOptions) => void;
  onProjectUpdate: (updates: Partial<Project>) => void;
  onOpenProjectSettings?: () => void;
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  project,
  onEnterEpisode,
  onProjectUpdate,
  onOpenProjectSettings,
}) => {
  const { message } = App.useApp();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(project.title);
  const [fullScript, setFullScript] = useState('');
  const [splitWizardVisible, setSplitWizardVisible] = useState(false);
  const episodeManagerRef = useRef<EpisodeManagerRef>(null);
  const scriptWorkbenchRef = useRef<ScriptWorkbenchRef>(null);
  const assetOverviewRef = useRef<ProjectAssetOverviewRef>(null);

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [scriptImportVisible, setScriptImportVisible] = useState(false);
  const [tempScript, setTempScript] = useState('');

  // 当前选中的剧集（用于中间区域剧本编辑）
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  const [settings, setSettings] = useState<Awaited<ReturnType<typeof loadSettings>> | null>(null);

  // 加载模型配置（内置 + 插件渠道）
  useEffect(() => {
    const load = async () => {
      setSettings(await loadSettings());
    };
    load();
  }, []);

  const mediaSelectionStates = useMemo(() => {
    if (!settings) {
      return null;
    }
    return {
      llm: buildProjectMediaCategoryState({
        settings,
        category: 'llm',
        explicitSelection: project.mediaSelections?.llm,
        requirement: PROJECT_MEDIA_BASE_REQUIREMENTS.llm,
      }),
      tti: buildProjectMediaCategoryState({
        settings,
        category: 'tti',
        explicitSelection: project.mediaSelections?.tti,
        requirement: PROJECT_MEDIA_BASE_REQUIREMENTS.tti,
      }),
      itv: buildProjectMediaCategoryState({
        settings,
        category: 'itv',
        explicitSelection: project.mediaSelections?.itv,
      }),
      tts: buildProjectMediaCategoryState({
        settings,
        category: 'tts',
        explicitSelection: project.mediaSelections?.tts,
        requirement: PROJECT_MEDIA_BASE_REQUIREMENTS.tts,
      }),
    };
  }, [settings, project.mediaSelections]);

  // 初始加载时自动选中第一集
  useEffect(() => {
    const loadFirstEpisode = async () => {
      try {
        const episodes = await listEpisodes(project.id);
        if (episodes.length > 0 && !selectedEpisode) {
          setSelectedEpisode(episodes[0]);
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
    setSelectedEpisode(fresh || episode);
  }, [project.id]);

  const handleEpisodeUpdate = useCallback((episode: Episode) => {
    setSelectedEpisode(prev => prev?.id === episode.id ? episode : prev);
  }, []);

  // 点击"开始制作"：进入编辑器
  const handleStartProduction = useCallback(async () => {
    if (!selectedEpisode) return;

    const flushedEpisode = await scriptWorkbenchRef.current?.flushSave();
    const nextEpisode = flushedEpisode || selectedEpisode;

    setSelectedEpisode(nextEpisode);
    onEnterEpisode(nextEpisode, { mode: 'start-production' });
  }, [selectedEpisode, onEnterEpisode]);

  // 剧本内容变更（自动保存后回调）
  const handleScriptChange = useCallback((text: string) => {
    setSelectedEpisode(prev => prev ? { ...prev, scriptText: text } : prev);
  }, []);

  const handleSaveTitle = useCallback(async () => {
    if (titleValue.trim() && titleValue !== project.title) {
      try {
        const projectMeta = await loadProject(project.id);
        if (projectMeta) {
          projectMeta.title = titleValue.trim();
          await saveProject(projectMeta);
          onProjectUpdate({ title: titleValue.trim() });
          message.success('项目名称已更新');
        }
      } catch (err: any) {
        message.error(err.message);
      }
    }
    setEditingTitle(false);
  }, [titleValue, project, onProjectUpdate, message]);

  const handleSplitComplete = useCallback((episodes: Episode[]) => {
    setSplitWizardVisible(false);
    setFullScript('');
    episodeManagerRef.current?.refresh();
    assetOverviewRef.current?.refresh();
    if (episodes.length > 0) {
      setSelectedEpisode(episodes[0]);
    }
    message.success(`成功创建 ${episodes.length} 个剧集`);
  }, [message]);

  const openScriptImport = () => {
    setTempScript(fullScript);
    setScriptImportVisible(true);
  };

  const confirmScriptImport = async () => {
    if (!tempScript.trim()) return;

    setScriptImportVisible(false);

    // 检查是否有后台分析任务在跑（包括剧本分析和分镜分析）
    const runningTasks = TaskManager.getProjectTasks(project.id).filter(task =>
      (task.type === 'script-analysis' || task.type === 'shot-analysis')
      && (task.status === 'pending' || task.status === 'running' || task.status === 'processing')
    );
    if (runningTasks.length > 0) {
      message.warning('当前有分析任务正在执行，请等待完成后再导入');
      return;
    }

    // 检查是否有旧剧集
    const existingEpisodes = await listEpisodes(project.id);
    if (existingEpisodes.length > 0) {
      Modal.confirm({
        title: '确认替换剧本',
        content: `项目中已有 ${existingEpisodes.length} 个剧集，重新导入将删除全部旧剧集及其分析数据、角色、场景、道具信息。已生成的图片/视频文件将保留。此操作不可撤销。`,
        okText: '确认替换',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          try {
            // 清理旧剧集，任一失败则中止
            const failedEpisodes: string[] = [];
            for (const ep of existingEpisodes) {
              const ok = await deleteEpisode(project.id, ep.id);
              if (!ok) failedEpisodes.push(ep.title || ep.id);
            }
            if (failedEpisodes.length > 0) {
              message.error(`以下剧集删除失败: ${failedEpisodes.join(', ')}，已中止导入`);
              return;
            }
            // 清空项目级资产
            await Promise.all([
              saveCharacters(project.id, []),
              saveScenes(project.id, []),
              saveProps(project.id, []),
            ]);
            setSelectedEpisode(null);
            episodeManagerRef.current?.refresh();
            assetOverviewRef.current?.refresh();
            setFullScript(tempScript);
            setSplitWizardVisible(true);
          } catch (err: any) {
            logger.error('清理旧数据失败', err);
            message.error('清理旧数据失败，请重试');
          }
        },
      });
    } else {
      setFullScript(tempScript);
      setSplitWizardVisible(true);
    }
  };

  // 模型配置更新
  const handleConfigChange = useCallback(async (
    category: 'llm' | 'tti' | 'itv' | 'tts',
    value: string | undefined,
  ) => {
    try {
      const projectMeta = await loadProject(project.id);
      if (projectMeta) {
        projectMeta.mediaSelections = {
          ...(projectMeta.mediaSelections || {}),
        };
        const selection = parseMediaSelectionKey(value);
        if (selection) {
          projectMeta.mediaSelections[category] = selection;
        } else {
          delete projectMeta.mediaSelections[category];
        }
        await saveProject(projectMeta);
        onProjectUpdate({ mediaSelections: projectMeta.mediaSelections });
      }
    } catch (err: any) {
      message.error(`更新配置失败: ${err.message}`);
    }
  }, [project.id, onProjectUpdate, message]);

  const renderQuickSelector = (
    category: ProjectMediaCategoryKey,
    icon: React.ReactNode,
    colorClassName: string,
    emptyTitle: string,
    readyTitle: string,
  ) => {
    const state = mediaSelectionStates?.[category];
    const tooltipLines = state
      ? [
          state.options.length === 0 ? emptyTitle : readyTitle,
          state.requirement?.description,
          state.fallbackLabel ? `全局默认: ${state.fallbackLabel}` : undefined,
          state.warning,
        ].filter(Boolean)
      : [emptyTitle];

    return (
      <Tooltip title={tooltipLines.join('；')}>
        <div className="flex items-center gap-1">
          <span className={colorClassName}>{icon}</span>
          <Select
            value={state?.explicitSupported ? state.explicitValue : undefined}
            onChange={(v) => handleConfigChange(category, v)}
            placeholder={state?.fallbackLabel ? `默认 · ${state.fallbackLabel}` : '默认'}
            allowClear
            size="small"
            status={state?.warning ? 'warning' : undefined}
            className="!w-36"
            popupMatchSelectWidth={false}
            options={(state?.options || []).map((option) => ({
              value: option.value,
              label: `${option.channelLabel} / ${option.modelLabel}`,
            }))}
            notFoundContent="请先在设置中配置"
          />
        </div>
      </Tooltip>
    );
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* HeaderBar */}
      <div className="flex-shrink-0 h-14 px-4 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900">
        {/* Left: Icon + Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-lg flex items-center justify-center">
            <Film className="w-4 h-4 text-white" />
          </div>
          {editingTitle ? (
            <Input
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={handleSaveTitle}
              onPressEnter={handleSaveTitle}
              autoFocus
              className="!w-48 !text-base !font-semibold !bg-zinc-800 !border-zinc-700"
            />
          ) : (
            <div
              className="flex items-center gap-1.5 cursor-pointer group"
              onClick={() => setEditingTitle(true)}
            >
              <span className="text-base font-semibold text-zinc-100">{project.title}</span>
              <Pencil className="w-3 h-3 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
          <Tag className="!m-0 !text-xs !bg-emerald-900/30 !text-emerald-400 !border-emerald-800/50">
            {project.genre || '未分类'}
          </Tag>
        </div>

        {/* Center: Model Configs */}
        <div className="flex items-center gap-2">
          {renderQuickSelector('llm', <Brain className="w-3.5 h-3.5" />, 'text-blue-400', '请先在设置中配置 LLM 模型', 'LLM 大语言模型')}
          {renderQuickSelector('tti', <Image className="w-3.5 h-3.5" />, 'text-purple-400', '请先在设置中配置 TTI 服务', '文生图 TTI')}
          {renderQuickSelector('itv', <Video className="w-3.5 h-3.5" />, 'text-orange-400', '请先在设置中配置 ITV 服务', '项目视频模型')}
          {renderQuickSelector('tts', <Volume2 className="w-3.5 h-3.5" />, 'text-emerald-400', '请先在设置中配置 TTS 服务', '语音合成 TTS')}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenProjectSettings?.()}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-300 transition-colors"
          >
            <SettingOutlined />
            项目设置
          </button>
          <button
            onClick={openScriptImport}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-300 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            导入剧本
          </button>
        </div>
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
              fullScript={fullScript || undefined}
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
            onStartProduction={handleStartProduction}
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
          {/* Asset Content */}
          <div className="flex-1 overflow-hidden">
            <ProjectAssetOverview ref={assetOverviewRef} projectId={project.id} />
          </div>
        </div>
      </div>

      {/* Script Import Modal */}
      <Modal
        title="导入剧本并自动分割剧集"
        open={scriptImportVisible}
        onCancel={() => setScriptImportVisible(false)}
        onOk={confirmScriptImport}
        okText="AI 自动分集"
        okButtonProps={{
          disabled: !tempScript.trim(),
          icon: <ThunderboltOutlined />,
          title: !tempScript.trim() ? '请先输入剧本内容' : undefined,
        }}
        cancelText="取消"
        width={900}
        centered
        mask={{ closable: false }}
      >
        <p className="text-xs text-zinc-500 mb-3">
          输入完整剧本后点击"AI 自动分集"，系统将智能拆分为多个剧集
        </p>
        <ScriptEditor
          value={tempScript}
          onChange={setTempScript}
          placeholder={`在此输入或粘贴完整剧本内容...\n\n提示：\n- 使用 ## 标记场景\n- 使用 **角色名**：标记对话\n- 文本请用"第n章/集"分割，系统将自动识别剧集`}
          minHeight="400px"
          maxHeight="500px"
        />
      </Modal>

      {/* AI Episode Split Wizard */}
      <EpisodeSplitWizard
        visible={splitWizardVisible}
        projectId={project.id}
        script={fullScript}
        onCancel={() => setSplitWizardVisible(false)}
        onComplete={handleSplitComplete}
      />
    </div>
  );
};

export default ProjectOverview;
