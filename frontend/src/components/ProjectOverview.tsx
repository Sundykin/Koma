/**
 * 项目概览页面
 * 显示项目设置、分集管理、主题风格选择
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  Typography,
  Card,
  Space,
  Button,
  Input,
  Tag,
  Divider,
  Tooltip,
  App,
} from 'antd';
import {
  SettingOutlined,
  EditOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Film, Palette, FolderOpen, Upload } from 'lucide-react';
import type { Project, Episode } from '../types';
import { EpisodeManager, EpisodeManagerRef } from './EpisodeManager';
import { ThemeSelector } from './ThemeSelector';
import { EpisodeSplitWizard } from './EpisodeSplitWizard';
import { ProjectAssetOverview } from './ProjectAssetOverview';
import { saveProject, loadProject } from '../store/projectStore';
import type { ProjectMeta } from '../types';

const { Title, Text } = Typography;

interface ProjectOverviewProps {
  project: Project;
  onEnterEpisode: (episode: Episode) => void;
  onOpenSettings: () => void;
  onProjectUpdate: (updates: Partial<Project>) => void;
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  project,
  onEnterEpisode,
  onOpenSettings,
  onProjectUpdate,
}) => {
  const { message } = App.useApp();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(project.title);
  const [fullScript, setFullScript] = useState('');
  const [showScriptImport, setShowScriptImport] = useState(false);
  const [splitWizardVisible, setSplitWizardVisible] = useState(false);
  const episodeManagerRef = useRef<EpisodeManagerRef>(null);

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

  // 主题风格变更
  const handleThemeChange = useCallback(async (theme: string | undefined, customStyle: string | undefined) => {
    try {
      // 主题存储在 Project 中，但 ProjectMeta 没有这些字段
      // 暂时只更新本地状态
      onProjectUpdate({ theme, stylePrompt: customStyle });
    } catch (err: any) {
      message.error(err.message);
    }
  }, [onProjectUpdate, message]);

  // 处理分集选择进入创作
  const handleEpisodeSelect = useCallback((episode: Episode) => {
    onEnterEpisode(episode);
  }, [onEnterEpisode]);

  // AI 分集完成后刷新列表
  const handleSplitComplete = useCallback((episodes: Episode[]) => {
    setSplitWizardVisible(false);
    setShowScriptImport(false);
    setFullScript('');
    episodeManagerRef.current?.refresh();
    message.success(`成功创建 ${episodes.length} 个分集`);
  }, [message]);

  return (
    <div className="h-full overflow-y-auto bg-[#0f0f0f]">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* 项目标题区 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-green-800 rounded-xl flex items-center justify-center">
              <Film className="w-6 h-6 text-white" />
            </div>
            <div>
              {editingTitle ? (
                <Input
                  value={titleValue}
                  onChange={e => setTitleValue(e.target.value)}
                  onBlur={handleSaveTitle}
                  onPressEnter={handleSaveTitle}
                  autoFocus
                  style={{ width: 300, fontSize: 20, fontWeight: 'bold' }}
                />
              ) : (
                <div
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => setEditingTitle(true)}
                >
                  <Title level={3} style={{ margin: 0, color: '#fff' }}>
                    {project.title}
                  </Title>
                  <EditOutlined className="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
              <Space size={8} className="mt-1">
                <Tag color="green">{project.genre}</Tag>
                <Tag>{project.mode === 'narration' ? '旁白解说' : '剧情模式'}</Tag>
              </Space>
            </div>
          </div>

          <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
            项目设置
          </Button>
        </div>

        <Divider style={{ borderColor: '#333', margin: '16px 0' }} />

        {/* 主内容区：左侧分集 + 右侧主题 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 分集管理区（占 2/3） */}
          <div className="lg:col-span-2">
            <Card
              title={
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-green-500" />
                  <span>分集管理</span>
                </div>
              }
              extra={
                <Space>
                  <Button
                    size="small"
                    icon={<Upload className="w-3 h-3" />}
                    onClick={() => setShowScriptImport(!showScriptImport)}
                  >
                    导入剧本
                  </Button>
                </Space>
              }
              style={{ background: '#141414', border: '1px solid #333' }}
              headStyle={{ borderBottom: '1px solid #333' }}
            >
              {/* 剧本导入区 */}
              {showScriptImport && (
                <div className="mb-4 p-4 bg-[#1a1a1a] rounded-lg border border-gray-800">
                  <Text type="secondary" className="block mb-2">
                    粘贴完整剧本，可使用 AI 自动分集
                  </Text>
                  <Input.TextArea
                    value={fullScript}
                    onChange={e => setFullScript(e.target.value)}
                    placeholder="在此粘贴完整剧本内容..."
                    rows={6}
                    style={{ background: '#0f0f0f', borderColor: '#333' }}
                  />
                  {fullScript.trim() && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="primary"
                        icon={<ThunderboltOutlined />}
                        onClick={() => setSplitWizardVisible(true)}
                      >
                        AI 自动分集
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <EpisodeManager
                ref={episodeManagerRef}
                projectId={project.id}
                fullScript={fullScript || undefined}
                onEpisodeSelect={handleEpisodeSelect}
              />
            </Card>
          </div>

          {/* 主题风格区（占 1/3） */}
          <div>
            <Card
              title={
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-purple-500" />
                  <span>视觉风格</span>
                </div>
              }
              style={{ background: '#141414', border: '1px solid #333' }}
              headStyle={{ borderBottom: '1px solid #333' }}
              bodyStyle={{ padding: 0 }}
            >
              <ThemeSelector
                value={project.theme}
                customStyle={project.stylePrompt}
                onChange={handleThemeChange}
              />
            </Card>

            {/* 快捷入口 */}
            <Card
              title="快捷操作"
              style={{ background: '#141414', border: '1px solid #333', marginTop: 16 }}
              headStyle={{ borderBottom: '1px solid #333' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  block
                  icon={<SettingOutlined />}
                  onClick={onOpenSettings}
                >
                  媒体配置
                </Button>
                <Tooltip title="配置 LLM、图像、视频、语音模型">
                  <Text type="secondary" className="text-xs">
                    配置 AI 模型和生成服务
                  </Text>
                </Tooltip>
              </Space>
            </Card>
          </div>
        </div>

        {/* 资产总览区域 */}
        <ProjectAssetOverview projectId={project.id} />
      </div>

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
