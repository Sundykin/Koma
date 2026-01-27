/**
 * 项目概览页面
 * 三栏式工作台布局：左侧分集导航 | 中间内容区 | 右侧资产面板
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  Typography,
  Card,
  Space,
  Button,
  Input,
  Tag,
  App,
  Modal,
  Drawer,
  Tooltip,
} from 'antd';
import {
  EditOutlined,
  ThunderboltOutlined,
  HighlightOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Film, Upload, Palette, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Project, Episode, AppSettings } from '../../types';
import { EpisodeManager, EpisodeManagerRef } from './EpisodeManager';
import { EpisodeSplitWizard } from './EpisodeSplitWizard';
import { ProjectAssetOverview } from './ProjectAssetOverview';
import { ProjectMediaSelector } from './ProjectMediaSelector';
import { saveProject, loadProject } from '../../store/projectStore';
import { THEME_PRESETS } from '../../config/themePresets';
import { ScriptEditor } from '../../editor';
import { generateRandomScript, polishScript } from '../../workflow/scriptGenerator';

const { Title, Text } = Typography;

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

  // 面板折叠状态
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // 设置抽屉
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);

  // 剧本导入弹窗状态
  const [scriptImportVisible, setScriptImportVisible] = useState(false);
  const [tempScript, setTempScript] = useState('');
  const [randomGenerating, setRandomGenerating] = useState(false);
  const [polishing, setPolishing] = useState(false);

  // 保存标题
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

  // 处理分集选择进入创作
  const handleEpisodeSelect = useCallback((episode: Episode) => {
    onEnterEpisode(episode);
  }, [onEnterEpisode]);

  // AI 分集完成后刷新列表
  const handleSplitComplete = useCallback((episodes: Episode[]) => {
    setSplitWizardVisible(false);
    setFullScript('');
    episodeManagerRef.current?.refresh();
    message.success(`成功创建 ${episodes.length} 个分集`);
  }, [message]);

  // 打开剧本导入弹窗
  const openScriptImport = () => {
    setTempScript(fullScript);
    setScriptImportVisible(true);
  };

  // 确认剧本导入
  const confirmScriptImport = () => {
    setFullScript(tempScript);
    setScriptImportVisible(false);
    if (tempScript.trim()) {
      setSplitWizardVisible(true);
    }
  };

  // 随机生成剧本
  const handleRandomGenerate = async () => {
    setRandomGenerating(true);
    try {
      const script = await generateRandomScript('3');
      setTempScript(script);
      message.success('剧本随机生成成功！');
    } catch (err: any) {
      message.error(`生成失败: ${err.message}`);
    } finally {
      setRandomGenerating(false);
    }
  };

  // AI 润色剧本
  const handlePolish = async () => {
    if (!tempScript.trim()) {
      message.warning('请先输入或生成剧本');
      return;
    }
    setPolishing(true);
    try {
      const polishedScript = await polishScript(
        {} as AppSettings,
        tempScript,
        '使语言更加生动，对话更自然，情节更紧凑',
        () => {}
      );
      setTempScript(polishedScript);
      message.success('剧本润色完成！');
    } catch (err: any) {
      message.error(`润色失败: ${err.message}`);
    } finally {
      setPolishing(false);
    }
  };

  // 更新项目配置
  const handleConfigUpdate = useCallback(async (configs: {
    llmConfigId?: string;
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  }) => {
    try {
      const projectMeta = await loadProject(project.id);
      if (projectMeta) {
        Object.assign(projectMeta, configs);
        await saveProject(projectMeta);
        onProjectUpdate(configs);
        message.success('项目配置已更新');
      }
    } catch (err: any) {
      message.error(`配置更新失败: ${err.message}`);
    }
  }, [project.id, onProjectUpdate, message]);

  // 获取当前主题信息
  const currentTheme = project.theme
    ? THEME_PRESETS.find(t => t.id === project.theme)
    : null;
  const themeDisplay = currentTheme?.name || project.stylePrompt || '未设置';

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-900/30">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              {editingTitle ? (
                <Input
                  value={titleValue}
                  onChange={e => setTitleValue(e.target.value)}
                  onBlur={handleSaveTitle}
                  onPressEnter={handleSaveTitle}
                  autoFocus
                  style={{ width: 280, fontSize: 18, fontWeight: 'bold' }}
                />
              ) : (
                <div
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => setEditingTitle(true)}
                >
                  <Title level={4} style={{ margin: 0, color: '#fff' }}>
                    {project.title}
                  </Title>
                  <EditOutlined className="text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
              <Space size={6} className="mt-1">
                <Tag color="green">{project.genre || '未分类'}</Tag>
                <Tag>{project.mode === 'narration' ? '旁白解说' : '剧情模式'}</Tag>
                <Tag icon={<Palette className="w-3 h-3" />} color="purple">{themeDisplay}</Tag>
              </Space>
            </div>
          </div>
          {/* 右侧操作 */}
          <div className="flex items-center gap-2">
            <Button
              icon={<Upload className="w-4 h-4" />}
              onClick={openScriptImport}
            >
              导入剧本
            </Button>
            <Tooltip title="项目设置">
              <Button
                icon={<SettingOutlined />}
                onClick={() => setSettingsDrawerOpen(true)}
              />
            </Tooltip>
          </div>
        </div>
      </div>

      {/* 三栏式主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左栏：分集导航 */}
        <div
          className={`border-r border-zinc-800 bg-zinc-900/30 flex flex-col transition-all duration-300 ${
            leftCollapsed ? 'w-0 overflow-hidden' : 'w-[400px]'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <span className="text-sm font-medium text-zinc-400">分集管理</span>
            <Button
              type="text"
              size="small"
              icon={<MenuFoldOutlined />}
              onClick={() => setLeftCollapsed(true)}
              className="text-zinc-500 hover:text-white"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <EpisodeManager
              ref={episodeManagerRef}
              projectId={project.id}
              fullScript={fullScript || undefined}
              onEpisodeSelect={handleEpisodeSelect}
            />
          </div>
        </div>

        {/* 左栏折叠按钮 */}
        {leftCollapsed && (
          <div className="flex items-center border-r border-zinc-800">
            <Button
              type="text"
              size="small"
              icon={<ChevronRight className="w-4 h-4" />}
              onClick={() => setLeftCollapsed(false)}
              className="h-full px-1 text-zinc-500 hover:text-white hover:bg-zinc-800"
            />
          </div>
        )}

        {/* 中栏：主内容区 */}
        <div className="flex-1 flex flex-col min-w-[400px] overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
                <Film className="w-10 h-10 text-zinc-600" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-300 mb-2">选择或创建分集开始创作</h2>
              <p className="text-zinc-500 mb-6">
                从左侧选择一个分集进入编辑，或导入剧本自动拆分分集
              </p>
              <Space>
                <Button
                  type="primary"
                  icon={<Upload className="w-4 h-4" />}
                  onClick={openScriptImport}
                  size="large"
                >
                  导入剧本
                </Button>
              </Space>
            </div>
          </div>
        </div>

        {/* 右栏折叠按钮 */}
        {rightCollapsed && (
          <div className="flex items-center border-l border-zinc-800">
            <Button
              type="text"
              size="small"
              icon={<ChevronLeft className="w-4 h-4" />}
              onClick={() => setRightCollapsed(false)}
              className="h-full px-1 text-zinc-500 hover:text-white hover:bg-zinc-800"
            />
          </div>
        )}

        {/* 右栏：资产面板 */}
        <div
          className={`border-l border-zinc-800 bg-zinc-900/30 flex flex-col transition-all duration-300 ${
            rightCollapsed ? 'w-0 overflow-hidden' : 'w-[380px]'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <span className="text-sm font-medium text-zinc-400 flex items-center gap-2">
              <Package className="w-4 h-4" />
              项目资产
            </span>
            <Button
              type="text"
              size="small"
              icon={<MenuUnfoldOutlined />}
              onClick={() => setRightCollapsed(true)}
              className="text-zinc-500 hover:text-white"
            />
          </div>
          <div className="flex-1 overflow-hidden">
            <ProjectAssetOverview projectId={project.id} />
          </div>
        </div>
      </div>

      {/* 项目设置抽屉 */}
      <Drawer
        title="项目设置"
        placement="right"
        size="large"
        onClose={() => setSettingsDrawerOpen(false)}
        open={settingsDrawerOpen}
        styles={{ body: { padding: 0 } }}
      >
        <div className="p-6">
          <Card
            title="媒体模型配置"
            className="bg-zinc-900 border-zinc-800"
            styles={{ header: { borderBottom: '1px solid #27272a' } }}
          >
            <div className="mb-4 text-zinc-500 text-sm">
              选择此项目使用的媒体生成服务，留空则使用全局默认配置。
            </div>
            <ProjectMediaSelector
              llmConfigId={project.llmConfigId}
              ttiConfigId={project.ttiConfigId}
              itvConfigId={project.itvConfigId}
              ttsConfigId={project.ttsConfigId}
              onChange={handleConfigUpdate}
            />
          </Card>
        </div>
      </Drawer>

      {/* 剧本导入弹窗 */}
      <Modal
        title="导入剧本"
        open={scriptImportVisible}
        onCancel={() => setScriptImportVisible(false)}
        onOk={confirmScriptImport}
        okText="AI 自动分集"
        okButtonProps={{ disabled: !tempScript.trim(), icon: <ThunderboltOutlined /> }}
        cancelText="取消"
        width={900}
        centered
        maskClosable={false}
        styles={{ body: { padding: '12px 24px' } }}
      >
        <div style={{ marginBottom: 12 }}>
          <Space>
            <Button
              icon={<ThunderboltOutlined />}
              loading={randomGenerating}
              onClick={handleRandomGenerate}
            >
              随机生成
            </Button>
            <Button
              icon={<HighlightOutlined />}
              loading={polishing}
              onClick={handlePolish}
              disabled={!tempScript.trim()}
            >
              AI 润色
            </Button>
          </Space>
          <Text type="secondary" className="ml-4 text-xs">
            输入剧本后点击"AI 自动分集"，系统将智能拆分为多个分集
          </Text>
        </div>
        <ScriptEditor
          value={tempScript}
          onChange={setTempScript}
          placeholder={`在此输入或粘贴完整剧本内容...

提示：
- 使用 ## 标记场景
- 使用 **角色名**：标记对话
- 文本请用"第n章/集"分割，系统将自动识别分集`}
          minHeight="400px"
          maxHeight="500px"
        />
      </Modal>

      {/* AI 分集向导 */}
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
