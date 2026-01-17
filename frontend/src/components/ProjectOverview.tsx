/**
 * 项目概览页面
 * 固定布局，分集和资产内部滚动
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
} from 'antd';
import {
  SettingOutlined,
  EditOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Film, FolderOpen, Upload, Palette } from 'lucide-react';
import type { Project, Episode } from '../types';
import { EpisodeManager, EpisodeManagerRef } from './EpisodeManager';
import { EpisodeSplitWizard } from './EpisodeSplitWizard';
import { ProjectAssetOverview } from './ProjectAssetOverview';
import { saveProject, loadProject } from '../store/projectStore';
import { THEME_PRESETS } from '../config/themePresets';

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

  // 获取当前主题信息
  const currentTheme = project.theme
    ? THEME_PRESETS.find(t => t.id === project.theme)
    : null;
  const themeDisplay = currentTheme?.name || project.stylePrompt || '未设置';

  return (
    <div className="h-full flex flex-col bg-[#0f0f0f] overflow-hidden">
      {/* 顶部标题栏 - 固定高度 */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-800">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-green-800 rounded-lg flex items-center justify-center">
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
                  <EditOutlined className="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
              <Space size={6} className="mt-1">
                <Tag color="green">{project.genre || '未分类'}</Tag>
                <Tag>{project.mode === 'narration' ? '旁白解说' : '剧情模式'}</Tag>
                <Tag icon={<Palette className="w-3 h-3" />} color="purple">{themeDisplay}</Tag>
              </Space>
            </div>
          </div>
          <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
            项目设置
          </Button>
        </div>
      </div>

      {/* 主内容区 - 两栏布局 */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="h-full max-w-7xl mx-auto grid grid-cols-2 gap-4">
          {/* 左侧：分集管理 */}
          <div className="flex flex-col min-h-0">
            <Card
              title={
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-green-500" />
                  <span>分集管理</span>
                </div>
              }
              extra={
                <Button
                  size="small"
                  icon={<Upload className="w-3 h-3" />}
                  onClick={() => setShowScriptImport(!showScriptImport)}
                >
                  导入剧本
                </Button>
              }
              className="flex-1 flex flex-col"
              style={{ background: '#141414', border: '1px solid #333' }}
              headStyle={{ borderBottom: '1px solid #333', flexShrink: 0 }}
              bodyStyle={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
              {/* 剧本导入区 */}
              {showScriptImport && (
                <div className="flex-shrink-0 mb-3 p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                  <Text type="secondary" className="block mb-2 text-xs">
                    粘贴完整剧本，可使用 AI 自动分集
                  </Text>
                  <Input.TextArea
                    value={fullScript}
                    onChange={e => setFullScript(e.target.value)}
                    placeholder="在此粘贴完整剧本内容..."
                    rows={4}
                    style={{ background: '#0f0f0f', borderColor: '#333' }}
                  />
                  {fullScript.trim() && (
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="primary"
                        size="small"
                        icon={<ThunderboltOutlined />}
                        onClick={() => setSplitWizardVisible(true)}
                      >
                        AI 自动分集
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* 分集列表 - 内部滚动 */}
              <div className="flex-1 overflow-y-auto">
                <EpisodeManager
                  ref={episodeManagerRef}
                  projectId={project.id}
                  fullScript={fullScript || undefined}
                  onEpisodeSelect={handleEpisodeSelect}
                />
              </div>
            </Card>
          </div>

          {/* 右侧：资产总览 */}
          <div className="flex flex-col min-h-0">
            <ProjectAssetOverview projectId={project.id} />
          </div>
        </div>
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
