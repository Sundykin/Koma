/**
 * 工作台顶部栏
 * 简洁布局：返回 + 项目名 + 剧集选择 + 设置齿轮 + 一键成片
 * 模型配置移入设置抽屉
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Input, Select, Tooltip, App, Button, Popconfirm, Drawer } from 'antd';
import { PlusOutlined, RocketOutlined, SettingOutlined } from '@ant-design/icons';
import {
  Film, Pencil, Brain, Image, Video, Volume2,
  ArrowLeft, Trash2,
} from 'lucide-react';
import { loadSettings, getChannelsByCapability } from '../../store/globalStore';
import { loadProject, saveProject } from '../../store/projectStore';

interface ConfigOption {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface Episode {
  id: string;
  number: number;
  title: string;
}

interface WorkspaceHeaderProps {
  projectId: string;
  projectTitle: string;
  projectConfig: {
    llmConfigId?: string;
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  };
  episodes: Episode[];
  currentEpisodeId: string | null;
  onTitleChange: (title: string) => void;
  onConfigChange: (key: string, value: string | undefined) => void;
  onEpisodeSelect: (episodeId: string) => void;
  onEpisodeCreate: () => void;
  onEpisodeDelete?: (episodeId: string) => void;
  onBack: () => void;
  onAutoGenerate?: () => void;
  autoGenerating?: boolean;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  projectId,
  projectTitle,
  projectConfig,
  episodes,
  currentEpisodeId,
  onTitleChange,
  onConfigChange,
  onEpisodeSelect,
  onEpisodeCreate,
  onEpisodeDelete,
  onBack,
  onAutoGenerate,
  autoGenerating = false,
}) => {
  const { message } = App.useApp();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(projectTitle);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 模型配置列表
  const [llmConfigs, setLlmConfigs] = useState<ConfigOption[]>([]);
  const [ttiConfigs, setTtiConfigs] = useState<ConfigOption[]>([]);
  const [itvConfigs, setItvConfigs] = useState<ConfigOption[]>([]);
  const [ttsConfigs, setTtsConfigs] = useState<ConfigOption[]>([]);

  useEffect(() => {
    setTitleValue(projectTitle);
  }, [projectTitle]);

  // 加载模型配置
  useEffect(() => {
    const load = async () => {
      const settings = await loadSettings();
      const builtinLLM: ConfigOption[] = (settings.llmConfigs || []).map(c => ({ id: c.id, name: c.name, isDefault: c.isDefault }));
      const builtinTTI: ConfigOption[] = (settings.ttiConfigs || []).map(c => ({ id: c.id, name: c.name, isDefault: c.isDefault }));
      const builtinITV: ConfigOption[] = (settings.itvConfigs || []).map(c => ({ id: c.id, name: c.name, isDefault: c.isDefault }));
      const builtinTTS: ConfigOption[] = (settings.ttsConfigs || []).map(c => ({ id: c.id, name: c.name, isDefault: c.isDefault }));

      const [ttiChannels, itvChannels, ttsChannels] = await Promise.all([
        getChannelsByCapability('tti'),
        getChannelsByCapability('itv'),
        getChannelsByCapability('tts'),
      ]);

      setLlmConfigs(builtinLLM);
      setTtiConfigs([...builtinTTI, ...ttiChannels.map(c => ({ id: c.id, name: c.name }))]);
      setItvConfigs([...builtinITV, ...itvChannels.map(c => ({ id: c.id, name: c.name }))]);
      setTtsConfigs([...builtinTTS, ...ttsChannels.map(c => ({ id: c.id, name: c.name }))]);
    };
    load();
  }, []);

  const handleSaveTitle = useCallback(async () => {
    if (titleValue.trim() && titleValue !== projectTitle) {
      try {
        const projectMeta = await loadProject(projectId);
        if (projectMeta) {
          projectMeta.title = titleValue.trim();
          await saveProject(projectMeta);
          onTitleChange(titleValue.trim());
          message.success('项目名称已更新');
        }
      } catch (err: any) {
        message.error(err.message);
      }
    }
    setEditingTitle(false);
  }, [titleValue, projectTitle, projectId, onTitleChange, message]);

  const currentEpisode = episodes.find(e => e.id === currentEpisodeId);

  // 统计当前选中的配置数
  const configCount = [
    projectConfig.llmConfigId,
    projectConfig.ttiConfigId,
    projectConfig.itvConfigId,
    projectConfig.ttsConfigId,
  ].filter(Boolean).length;

  return (
    <>
      <div className="flex-shrink-0 h-12 px-3 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur-sm">
        {/* Left: Back + Title + Episode Selector */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors flex-shrink-0"
          >
            <ArrowLeft size={16} />
          </button>

          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <Film className="w-4 h-4 text-white" />
          </div>

          {editingTitle ? (
            <Input
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={handleSaveTitle}
              onPressEnter={handleSaveTitle}
              autoFocus
              className="!w-40 !text-sm !font-semibold !bg-zinc-800 !border-zinc-700"
            />
          ) : (
            <button
              className="flex items-center gap-1 cursor-pointer group min-w-0"
              onClick={() => setEditingTitle(true)}
            >
              <span className="text-sm font-semibold text-zinc-100 truncate">{projectTitle}</span>
              <Pencil className="w-3 h-3 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
          )}

          <div className="w-px h-5 bg-zinc-700 mx-1 flex-shrink-0" />

          {/* Episode Selector */}
          <Select
            value={currentEpisodeId || undefined}
            onChange={onEpisodeSelect}
            placeholder="选择剧集"
            size="small"
            className="!w-36"
            popupMatchSelectWidth={false}
            options={episodes.map(e => ({
              value: e.id,
              label: `第${e.number}集 ${e.title}`,
            }))}
            dropdownRender={(menu) => (
              <div>
                {menu}
                <div className="border-t border-zinc-700 p-1">
                  <Button
                    type="text"
                    icon={<PlusOutlined />}
                    onClick={onEpisodeCreate}
                    className="w-full !text-left !text-xs"
                    size="small"
                  >
                    新建剧集
                  </Button>
                </div>
              </div>
            )}
          />

          {currentEpisode && onEpisodeDelete && (
            <Popconfirm
              title="确定删除此剧集？"
              onConfirm={() => onEpisodeDelete(currentEpisode.id)}
              okText="删除"
              cancelText="取消"
            >
              <button className="p-1 text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0">
                <Trash2 size={14} />
              </button>
            </Popconfirm>
          )}
        </div>

        {/* Right: Settings + AutoGenerate */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Tooltip title="项目模型配置">
            <button
              onClick={() => setSettingsOpen(true)}
              className="relative p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
            >
              <SettingOutlined style={{ fontSize: 15 }} />
              {configCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-600 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                  {configCount}
                </span>
              )}
            </button>
          </Tooltip>

          {onAutoGenerate && (
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={onAutoGenerate}
              loading={autoGenerating}
              size="small"
              className="!bg-emerald-600 !border-emerald-600 hover:!bg-emerald-500"
            >
              一键成片
            </Button>
          )}
        </div>
      </div>

      {/* 模型配置抽屉 */}
      <Drawer
        title="项目模型配置"
        placement="right"
        width={360}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        className="model-config-drawer"
        styles={{ body: { padding: '16px' } }}
      >
        <div className="space-y-5">
          <ConfigSelect
            icon={<Brain className="w-4 h-4 text-blue-400" />}
            label="LLM 大语言模型"
            description="用于剧本生成、分镜拆解、提示词生成"
            value={projectConfig.llmConfigId}
            options={llmConfigs}
            onChange={(v) => onConfigChange('llmConfigId', v)}
          />
          <ConfigSelect
            icon={<Image className="w-4 h-4 text-purple-400" />}
            label="文生图 (TTI)"
            description="用于角色定妆照、场景图、分镜图生成"
            value={projectConfig.ttiConfigId}
            options={ttiConfigs}
            onChange={(v) => onConfigChange('ttiConfigId', v)}
          />
          <ConfigSelect
            icon={<Video className="w-4 h-4 text-orange-400" />}
            label="图生视频 (ITV)"
            description="用于分镜视频渲染、角色预览视频"
            value={projectConfig.itvConfigId}
            options={itvConfigs}
            onChange={(v) => onConfigChange('itvConfigId', v)}
          />
          <ConfigSelect
            icon={<Volume2 className="w-4 h-4 text-emerald-400" />}
            label="语音合成 (TTS)"
            description="用于角色对白配音"
            value={projectConfig.ttsConfigId}
            options={ttsConfigs}
            onChange={(v) => onConfigChange('ttsConfigId', v)}
          />
        </div>
      </Drawer>
    </>
  );
};

/** 配置选择器子组件 */
const ConfigSelect: React.FC<{
  icon: React.ReactNode;
  label: string;
  description: string;
  value?: string;
  options: ConfigOption[];
  onChange: (value: string | undefined) => void;
}> = ({ icon, label, description, value, options, onChange }) => (
  <div className="p-3 bg-zinc-900/80 rounded-lg border border-zinc-800">
    <div className="flex items-center gap-2 mb-1.5">
      {icon}
      <span className="text-sm font-medium text-zinc-200">{label}</span>
    </div>
    <p className="text-xs text-zinc-500 mb-2">{description}</p>
    <Select
      value={value}
      onChange={onChange}
      placeholder="使用全局默认"
      allowClear
      size="small"
      className="w-full"
      popupMatchSelectWidth={false}
      options={options.map(c => ({
        value: c.id,
        label: c.isDefault ? `${c.name} (默认)` : c.name,
      }))}
    />
  </div>
);
