/**
 * 项目概览页面
 * Tab 布局：剧本/分集 | 项目资产 | 项目设置
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
  Tabs,
} from 'antd';
import {
  EditOutlined,
  ThunderboltOutlined,
  HighlightOutlined,
} from '@ant-design/icons';
import { Film, FolderOpen, Upload, Palette, Settings, Package } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('episodes');

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
      <div className="flex-shrink-0 px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
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
        </div>
      </div>

      {/* 主内容区 - Tab 布局 */}
      <div className="flex-1 overflow-hidden">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          centered
          size="large"
          className="h-full projectOverviewTabs"
          style={{ height: '100%' }}
          items={[
            {
              key: 'episodes',
              label: (
                <span className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  剧本/分集
                </span>
              ),
              children: (
                <div className="h-full flex flex-col p-4">
                  <div className="w-full flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2 text-zinc-400">
                        <FolderOpen className="w-4 h-4" />
                        <span>分集管理</span>
                      </div>
                      <Button
                        type="primary"
                        icon={<Upload className="w-4 h-4" />}
                        onClick={openScriptImport}
                      >
                        导入剧本
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto bg-zinc-900 rounded-lg border border-zinc-800 p-4">
                      <EpisodeManager
                        ref={episodeManagerRef}
                        projectId={project.id}
                        fullScript={fullScript || undefined}
                        onEpisodeSelect={handleEpisodeSelect}
                      />
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'assets',
              label: (
                <span className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  项目资产
                </span>
              ),
              children: (
                <div className="h-full overflow-y-auto p-4">
                  <ProjectAssetOverview projectId={project.id} />
                </div>
              ),
            },
            {
              key: 'settings',
              label: (
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  项目设置
                </span>
              ),
              children: (
                <div className="h-full overflow-y-auto p-4">
                  <div className="max-w-4xl">
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
                </div>
              ),
            },
          ]}
        />
      </div>

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

      <style>{`
        .projectOverviewTabs .ant-tabs-content {
          height: calc(100% - 46px);
        }
        .projectOverviewTabs .ant-tabs-tabpane {
          height: 100%;
        }
      `}</style>
    </div>
  );
};

export default ProjectOverview;
