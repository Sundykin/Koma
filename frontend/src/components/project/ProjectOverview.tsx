/**
 * 项目概览页面
 * 三栏式工作台布局：左侧剧集导航(360px) | 中间剧本编辑区 | 右侧资产面板(340px)
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Input, Tag, App, Modal, Select, Tooltip } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import {
  Film, Upload, Package, ChevronLeft, ChevronRight,
  PanelLeftClose, PanelRightClose, Pencil, Brain, Image, Video, Volume2,
} from 'lucide-react';
import type { Project, Episode } from '../../types';
import { EpisodeManager, EpisodeManagerRef } from './EpisodeManager';
import { EpisodeSplitWizard } from './EpisodeSplitWizard';
import { ProjectAssetOverview } from './ProjectAssetOverview';
import { ScriptWorkbench, type ScriptWorkbenchRef } from './ScriptWorkbench';
import { saveProject, loadProject, listEpisodes } from '../../store/projectStore';
import { loadSettings, getChannelsByCapability } from '../../store/globalStore';
import { createLogger } from '../../store/logger';
import { THEME_PRESETS } from '../../config/themePresets';
import { ScriptEditor } from '../../editor';

const logger = createLogger('ProjectOverview');

// 统一的配置选项类型
interface ConfigOption {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface ProjectOverviewProps {
  project: Project;
  onEnterEpisode: (episode: Episode) => void;
  onProjectUpdate: (updates: Partial<Project>) => void;
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  project,
  onEnterEpisode,
  onProjectUpdate,
}) => {
  const { message } = App.useApp();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(project.title);
  const [fullScript, setFullScript] = useState('');
  const [splitWizardVisible, setSplitWizardVisible] = useState(false);
  const episodeManagerRef = useRef<EpisodeManagerRef>(null);
  const scriptWorkbenchRef = useRef<ScriptWorkbenchRef>(null);

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [scriptImportVisible, setScriptImportVisible] = useState(false);
  const [tempScript, setTempScript] = useState('');

  // 当前选中的剧集（用于中间区域剧本编辑）
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  // 模型配置列表（统一类型）
  const [llmConfigs, setLlmConfigs] = useState<ConfigOption[]>([]);
  const [ttiConfigs, setTtiConfigs] = useState<ConfigOption[]>([]);
  const [itvConfigs, setItvConfigs] = useState<ConfigOption[]>([]);
  const [ttsConfigs, setTtsConfigs] = useState<ConfigOption[]>([]);

  // 加载模型配置（内置 + 插件渠道）
  useEffect(() => {
    const load = async () => {
      const settings = await loadSettings();
      // 内置配置
      const builtinLLM: ConfigOption[] = (settings.llmConfigs || []).map(c => ({ id: c.id, name: c.name, isDefault: c.isDefault }));
      const builtinTTI: ConfigOption[] = (settings.ttiConfigs || []).map(c => ({ id: c.id, name: c.name, isDefault: c.isDefault }));
      const builtinITV: ConfigOption[] = (settings.itvConfigs || []).map(c => ({ id: c.id, name: c.name, isDefault: c.isDefault }));
      const builtinTTS: ConfigOption[] = (settings.ttsConfigs || []).map(c => ({ id: c.id, name: c.name, isDefault: c.isDefault }));

      // 插件渠道
      const [ttiChannels, itvChannels, ttsChannels] = await Promise.all([
        getChannelsByCapability('tti'),
        getChannelsByCapability('itv'),
        getChannelsByCapability('tts'),
      ]);
      const channelTTI: ConfigOption[] = ttiChannels.map(c => ({ id: c.id, name: c.name }));
      const channelITV: ConfigOption[] = itvChannels.map(c => ({ id: c.id, name: c.name }));
      const channelTTS: ConfigOption[] = ttsChannels.map(c => ({ id: c.id, name: c.name }));

      setLlmConfigs(builtinLLM);
      setTtiConfigs([...builtinTTI, ...channelTTI]);
      setItvConfigs([...builtinITV, ...channelITV]);
      setTtsConfigs([...builtinTTS, ...channelTTS]);
    };
    load();
  }, []);

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

  // 点击剧集：切换中间区域的剧本内容
  const handleEpisodeSelect = useCallback((episode: Episode) => {
    setSelectedEpisode(episode);
  }, []);

  const handleEpisodeUpdate = useCallback((episode: Episode) => {
    setSelectedEpisode(prev => prev?.id === episode.id ? episode : prev);
  }, []);

  // 点击"开始制作"：进入编辑器
  const handleStartProduction = useCallback(async () => {
    if (!selectedEpisode) return;

    const flushedEpisode = await scriptWorkbenchRef.current?.flushSave();
    const nextEpisode = flushedEpisode || selectedEpisode;

    setSelectedEpisode(nextEpisode);
    onEnterEpisode(nextEpisode);
  }, [selectedEpisode, onEnterEpisode]);

  // 剧本内容变更（自动保存后回调）
  const handleScriptChange = useCallback((text: string) => {
    if (selectedEpisode) {
      setSelectedEpisode({ ...selectedEpisode, scriptText: text });
    }
  }, [selectedEpisode]);

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
    if (episodes.length > 0) {
      setSelectedEpisode(episodes[0]);
    }
    message.success(`成功创建 ${episodes.length} 个剧集`);
  }, [message]);

  const openScriptImport = () => {
    setTempScript(fullScript);
    setScriptImportVisible(true);
  };

  const confirmScriptImport = () => {
    setFullScript(tempScript);
    setScriptImportVisible(false);
    if (tempScript.trim()) setSplitWizardVisible(true);
  };

  // 模型配置更新
  const handleConfigChange = useCallback(async (key: string, value: string | undefined) => {
    try {
      const projectMeta = await loadProject(project.id);
      if (projectMeta) {
        (projectMeta as any)[key] = value;
        await saveProject(projectMeta);
        onProjectUpdate({ [key]: value });
      }
    } catch (err: any) {
      message.error(`更新配置失败: ${err.message}`);
    }
  }, [project.id, onProjectUpdate, message]);

  const currentTheme = project.theme ? THEME_PRESETS.find(t => t.id === project.theme) : null;
  const _themeDisplay = currentTheme?.name || project.stylePrompt || '未设置';

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
          <Tooltip title={llmConfigs.length === 0 ? "请先在设置中配置 LLM 模型" : "LLM 大语言模型"}>
            <div className="flex items-center gap-1">
              <Brain className="w-3.5 h-3.5 text-blue-400" />
              <Select
                value={project.llmConfigId}
                onChange={(v) => handleConfigChange('llmConfigId', v)}
                placeholder="默认"
                allowClear
                size="small"
                className="!w-28"
                popupMatchSelectWidth={false}
                options={llmConfigs.map(c => ({ value: c.id, label: c.name }))}
                notFoundContent="请先在设置中配置"
              />
            </div>
          </Tooltip>
          <Tooltip title={ttiConfigs.length === 0 ? "请先在设置中配置 TTI 服务" : "文生图 TTI"}>
            <div className="flex items-center gap-1">
              <Image className="w-3.5 h-3.5 text-purple-400" />
              <Select
                value={project.ttiConfigId}
                onChange={(v) => handleConfigChange('ttiConfigId', v)}
                placeholder="默认"
                allowClear
                size="small"
                className="!w-28"
                popupMatchSelectWidth={false}
                options={ttiConfigs.map(c => ({ value: c.id, label: c.name }))}
                notFoundContent="请先在设置中配置"
              />
            </div>
          </Tooltip>
          <Tooltip title={itvConfigs.length === 0 ? "请先在设置中配置 ITV 服务" : "图生视频 ITV"}>
            <div className="flex items-center gap-1">
              <Video className="w-3.5 h-3.5 text-orange-400" />
              <Select
                value={project.itvConfigId}
                onChange={(v) => handleConfigChange('itvConfigId', v)}
                placeholder="默认"
                allowClear
                size="small"
                className="!w-28"
                popupMatchSelectWidth={false}
                options={itvConfigs.map(c => ({ value: c.id, label: c.name }))}
                notFoundContent="请先在设置中配置"
              />
            </div>
          </Tooltip>
          <Tooltip title={ttsConfigs.length === 0 ? "请先在设置中配置 TTS 服务" : "语音合成 TTS"}>
            <div className="flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <Select
                value={project.ttsConfigId}
                onChange={(v) => handleConfigChange('ttsConfigId', v)}
                placeholder="默认"
                allowClear
                size="small"
                className="!w-28"
                popupMatchSelectWidth={false}
                options={ttsConfigs.map(c => ({ value: c.id, label: c.name }))}
                notFoundContent="请先在设置中配置"
              />
            </div>
          </Tooltip>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
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
            <ProjectAssetOverview projectId={project.id} />
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
