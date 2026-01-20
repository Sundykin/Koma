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
  Modal,
} from 'antd';
import {
  SettingOutlined,
  EditOutlined,
  ThunderboltOutlined,
  HighlightOutlined,
} from '@ant-design/icons';
import { Film, FolderOpen, Upload, Palette } from 'lucide-react';
import type { Project, Episode, AppSettings } from '../types';
import { EpisodeManager, EpisodeManagerRef } from './EpisodeManager';
import { EpisodeSplitWizard } from './EpisodeSplitWizard';
import { ProjectAssetOverview } from './ProjectAssetOverview';
import { saveProject, loadProject } from '../store/projectStore';
import { THEME_PRESETS } from '../config/themePresets';
import { ScriptEditor } from '../editor';
import { generateRandomScript, polishScript } from '../workflow/scriptGenerator';

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
  const [splitWizardVisible, setSplitWizardVisible] = useState(false);
  const episodeManagerRef = useRef<EpisodeManagerRef>(null);

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

  // 获取当前主题信息
  const currentTheme = project.theme
    ? THEME_PRESETS.find(t => t.id === project.theme)
    : null;
  const themeDisplay = currentTheme?.name || project.stylePrompt || '未设置';

  return (
    <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* 顶部标题栏 - 固定高度 */}
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
                  <FolderOpen className="w-4 h-4 text-emerald-500" />
                  <span>分集管理</span>
                </div>
              }
              extra={
                <Button
                  size="small"
                  icon={<Upload className="w-3 h-3" />}
                  onClick={openScriptImport}
                >
                  导入剧本
                </Button>
              }
              className="flex-1 flex flex-col"
              style={{ background: '#18181b', border: '1px solid #27272a' }}
              headStyle={{ borderBottom: '1px solid #27272a', flexShrink: 0 }}
              bodyStyle={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
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
