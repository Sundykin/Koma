import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Project, ScriptAnalysisResult, EditorStep, AppSettings, Episode, EpisodeStepProgress } from './types';
import { ProjectList } from './components/ProjectList';
import { ProjectOverview } from './components/ProjectOverview';
import { AssetManager } from './components/AssetManager';
import { Storyboard } from './components/Storyboard';
import type { MentionItem } from './editor';
import { ScriptEditor } from './editor';
import { SimpleEditor } from './components/editor';
import { SettingsPage } from './components/SettingsPage';
import { StepNavigator } from './components/StepNavigator';
import { CreateProjectModal } from './components/CreateProjectModal';
import { ProjectSettingsModal } from './components/ProjectSettingsModal';
import { WindowControls } from './components/WindowControls';
import { TaskStatusBar } from './components/TaskStatusBar';
import { useProjects } from './hooks/useProjects';
import { TaskManager } from './services/TaskManager';
import { startBackgroundAnalysis } from './services/ScriptAnalysisService';
import { loadCharacters, loadScenes, loadProps, loadShots, loadEpisodeShots, saveEpisode } from './store/projectStore';
import { Menu, Avatar, Tooltip, Button, Tag, Spin, App as AntApp } from 'antd';
import {
  AppstoreOutlined,
  SettingOutlined,
  UserOutlined,
  SaveOutlined,
  ExportOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import {
  LayoutDashboard,
  Settings,
  ChevronRight,
  Home,
  Sparkles,
  Users,
  Clapperboard,
  Scissors,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  Type, User, MessageSquare, MapPin, Loader2,
  FileText,
  FolderOpen
} from 'lucide-react';

// 开发测试用模拟数据
const DEV_TEST_PROJECT: Project = {
  id: 'dev-test',
  title: '废弃医院的回声',
  genre: '恐怖/悬疑',
  mode: 'drama',
  episodes: 12,
  lastEdited: '测试项目',
  thumbnail: 'https://picsum.photos/seed/horror/600/338',
  status: 'storyboard'
};

const DEV_TEST_ANALYSIS: ScriptAnalysisResult = {
  characters: [
    { id: 'c1', name: '叶青凡', age: '28', role: 'protagonist', description: '沉稳冷静的调查员', appearance: '黑发，深邃眼神' },
    { id: 'c2', name: '鬼护士', age: '?', role: 'antagonist', description: '神秘的医院幽灵', appearance: '白色护士服，无面孔' },
  ],
  scenes: [
    { id: 's1', name: '废弃医院走廊', location: '废弃医院', time: 'night', mood: '阴森紧张', description: '昏暗的走廊，墙壁剥落' },
  ],
  props: [
    { id: 'pr1', name: '手电筒', type: '道具', description: '发出微弱光芒的老旧手电' },
    { id: 'pr2', name: '手术刀', type: '武器', description: '生锈的手术刀' },
  ],
  shots: [
    { id: 'shot1', scriptContent: '走廊里死一般的寂静', shotType: 'wide', cameraMovement: 'static', duration: 3, description: 'Wide shot of dark hospital corridor', characters: ['c1'], dialogue: '', emotion: '紧张' },
    { id: 'shot2', scriptContent: '叶青凡站在铁门前', shotType: 'medium', cameraMovement: 'tracking', duration: 4, description: 'Medium shot of Ye Qingfan holding flashlight', characters: ['c1'], dialogue: '比我记忆中更黑了', emotion: '警觉' },
    { id: 'shot3', scriptContent: '铁门发出刺耳的摩擦声', shotType: 'close-up', cameraMovement: 'zoom-in', duration: 2, description: 'Close-up of rusty iron door opening', characters: [], dialogue: '', emotion: '悬疑' },
    { id: 'shot4', scriptContent: '鬼护士背对窗户站立', shotType: 'wide', cameraMovement: 'static', duration: 4, description: 'Wide shot of ghost nurse silhouette against window', characters: ['c2'], dialogue: '', emotion: '恐怖' },
    { id: 'shot5', scriptContent: '鬼护士转身，脸上没有五官', shotType: 'close-up', cameraMovement: 'zoom-in', duration: 3, description: 'Close-up of faceless ghost nurse turning', characters: ['c2'], dialogue: '', emotion: '惊悚' },
  ],
};

const DEFAULT_SCRIPT = `# 第一场：废弃医院 - 夜
[氛围: 阴森, 紧张]

走廊里死一般的寂静，只有滴水声回荡。
叶青凡站在一扇生锈的铁门前，手里紧紧握着手电筒。

叶青凡
(低语)
“比我记忆中更黑了。”

他用力推门，铁门发出刺耳的摩擦声。

里面，一个身影背对着窗户站立。那是鬼护士。
她缓慢地转过身，脸上没有五官。手中握着一把生锈的手术刀。
`;

// 默认设置
const DEFAULT_SETTINGS: AppSettings = {
  llmConfigs: [],
  ttiConfigs: [],
  itvConfigs: [],
  ttsConfigs: [],
};

// 时间格式化工具函数
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return '刚刚';
}

const AppContent: React.FC = () => {
  // 使用 Ant Design App hook 获取 message
  const { message } = AntApp.useApp();

  // 开发模式检测: URL 参数 ?dev=video 直接进入剪辑页面
  const urlParams = new URLSearchParams(window.location.search);
  const devMode = urlParams.get('dev');
  const isVideoDevMode = devMode === 'video';

  // 项目管理 Hook
  const {
    projects,
    loading: projectsLoading,
    error: projectsError,
    createProject: createProjectAPI,
    deleteProject: deleteProjectAPI,
    updateProject: updateProjectAPI,
  } = useProjects();

  const [view, setView] = useState<'projects' | 'overview' | 'editor' | 'settings'>(isVideoDevMode ? 'editor' : 'projects');
  const [activeProject, setActiveProject] = useState<Project | null>(
    isVideoDevMode ? DEV_TEST_PROJECT : null
  );
  const [editorStep, setEditorStep] = useState<EditorStep>(isVideoDevMode ? 'video' : 'script');
  const [activeEpisode, setActiveEpisode] = useState<Episode | null>(null);
  const [stepProgress, setStepProgress] = useState<EpisodeStepProgress>({
    script: 'pending',
    assets: 'pending',
    storyboard: 'pending',
    video: 'pending',
  });
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // 弹窗状态
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);

  // 剧本相关状态
  const [scriptText, setScriptText] = useState(DEFAULT_SCRIPT);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 项目数据状态
  const [analysisData, setAnalysisData] = useState<ScriptAnalysisResult | null>(
    isVideoDevMode ? DEV_TEST_ANALYSIS : null
  );

  // 初始化 TaskManager
  useEffect(() => {
    if (activeProject) {
      TaskManager.initialize(activeProject.id);
    }
    return () => {
      TaskManager.dispose();
    };
  }, [activeProject?.id]);

  // 从存储加载分析数据
  const loadAnalysisData = useCallback(async (projectId: string) => {
    try {
      const [characters, scenes, props, shots] = await Promise.all([
        loadCharacters(projectId),
        loadScenes(projectId),
        loadProps(projectId),
        loadShots(projectId),
      ]);

      // 只有在有数据时才更新状态
      if (characters.length > 0 || scenes.length > 0 || shots.length > 0) {
        setAnalysisData({
          characters,
          scenes,
          props,
          shots,
        });
        console.log('[App] 加载分析数据:', { characters: characters.length, scenes: scenes.length, props: props.length, shots: shots.length });
      }
    } catch (err) {
      console.error('[App] 加载分析数据失败:', err);
    }
  }, []);

  // 从角色数据构建 mentionItems（用于编辑器的 @ 补全）
  const mentionItems: MentionItem[] = useMemo(() => {
    if (!analysisData?.characters) return [];
    return analysisData.characters.map(char => ({
      id: char.id,
      type: 'char' as const,
      name: char.name,
      description: char.description,
      previewImage: char.costumePhotoPath,
      sora2CharacterId: char.sora2CharacterId,
    }));
  }, [analysisData?.characters]);

  // 监听任务完成事件，实现自动跳转
  useEffect(() => {
    if (!activeProject) return;

    const unsubscribe = TaskManager.addListener((task) => {
      if (task.projectId !== activeProject.id) return;

      // 剧本解析完成后自动跳转到资产管理步骤，并重新加载数据
      if (task.type === 'script-analysis' && task.status === 'completed') {
        message.success('剧本解析完成，正在跳转到资产管理...');
        // 标记剧本步骤为完成并持久化
        setStepProgress(prev => {
          const updated = { ...prev, script: 'completed' };
          if (activeProject && activeEpisode) {
            setActiveEpisode({ ...activeEpisode, stepProgress: updated });
            saveEpisode(activeProject.id, activeEpisode.id, { stepProgress: updated })
              .catch(err => console.error('[App] 保存步骤进度失败:', err));
          }
          return updated;
        });
        // 重新加载分析数据
        loadAnalysisData(activeProject.id);
        setEditorStep('assets');
      }
    });

    return () => unsubscribe();
  }, [activeProject?.id, activeEpisode, message, loadAnalysisData]);

  // 进入编辑器视图时加载已保存的分析数据
  useEffect(() => {
    if (view === 'editor' && activeProject && !isVideoDevMode) {
      loadAnalysisData(activeProject.id);
    }
  }, [view, activeProject?.id, isVideoDevMode, loadAnalysisData]);

  // 切换到视频编辑步骤时重新加载 shots（获取最新视频数据）
  useEffect(() => {
    if (editorStep === 'video' && activeProject && activeEpisode && !isVideoDevMode) {
      // 使用分集级别的加载函数
      loadEpisodeShots(activeProject.id, activeEpisode.id).then(shots => {
        if (shots.length > 0) {
          // 即使 prev 为 null 也要设置 shots
          setAnalysisData(prev => ({
            characters: prev?.characters || [],
            scenes: prev?.scenes || [],
            props: prev?.props || [],
            shots,
          }));
          console.log('[App] Loaded episode shots for video editor:', shots.length, 'shots');
        } else {
          console.log('[App] No shots found for episode:', activeEpisode.id);
        }
      });
    }
  }, [editorStep, activeProject?.id, activeEpisode?.id, isVideoDevMode]);

  // 侧边栏折叠逻辑：在 editor 和 overview 模式下折叠
  const isSidebarCollapsed = view === 'editor' || view === 'overview';

  // 将 ProjectMeta 转换为 Project 显示格式
  const displayProjects: Project[] = projects.map(p => ({
    id: p.id,
    title: p.title,
    genre: p.genre,
    mode: p.mode,
    episodes: p.episodes || 1,
    lastEdited: formatTimeAgo(p.updatedAt),
    thumbnail: p.thumbnail || `https://picsum.photos/seed/${p.id}/600/338`,
    status: p.status || 'script',
    // 媒体配置
    llmConfigId: p.llmConfigId,
    ttiConfigId: p.ttiConfigId,
    itvConfigId: p.itvConfigId,
    ttsConfigId: p.ttsConfigId,
    // 主题风格
    theme: p.theme,
    stylePrompt: p.stylePrompt,
  }));

  // 打开创建项目弹窗
  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
  };

  // 进入剪辑测试模式（开发用）
  const handleEnterVideoTest = () => {
    setActiveProject(DEV_TEST_PROJECT);
    setAnalysisData(DEV_TEST_ANALYSIS);
    setEditorStep('video');
    setView('editor');
  };

  // 处理项目创建 (从弹窗回调)
  const handleCreateProject = async (data: { title: string; mode: 'drama' | 'narration'; theme?: string; stylePrompt?: string }) => {
    try {
      const created = await createProjectAPI({
        title: data.title,
        mode: data.mode,
        genre: data.mode === 'drama' ? '剧情' : '解说',
        theme: data.theme,
        stylePrompt: data.stylePrompt,
      });

      const newProject: Project = {
        id: created.id,
        title: created.title,
        genre: created.genre,
        mode: created.mode,
        episodes: created.episodes || 1,
        lastEdited: '刚刚',
        thumbnail: created.thumbnail || `https://picsum.photos/seed/${created.id}/600/338`,
        status: created.status || 'script',
        theme: created.theme,
        stylePrompt: created.stylePrompt,
      };

      setActiveProject(newProject);
      setActiveEpisode(null);
      setView('overview');
      setScriptText('');
      setAnalysisData(null);
      setIsCreateModalOpen(false);
      message.success('项目创建成功');
    } catch (err: any) {
      message.error(err.message || '创建项目失败');
    }
  };

  // 选择已有项目 - 进入项目概览
  const handleSelectProject = (id: string) => {
    const proj = displayProjects.find(p => p.id === id);
    if (proj) {
      setActiveProject(proj);
      setActiveEpisode(null);
      setView('overview');
      // 重置编辑器状态
      setScriptText('');
      setAnalysisData(null);
    }
  };

  // 从项目概览进入分集创作
  const handleEnterEpisode = (episode: Episode) => {
    setActiveEpisode(episode);
    setView('editor');
    // 加载分集的步骤进度，如果没有则使用默认值
    const defaultProgress: EpisodeStepProgress = {
      script: 'pending',
      assets: 'pending',
      storyboard: 'pending',
      video: 'pending',
    };
    setStepProgress(episode.stepProgress || defaultProgress);
    // 根据步骤进度决定初始步骤：从第一个未完成的步骤开始
    const steps: EditorStep[] = ['script', 'assets', 'storyboard', 'video'];
    const progress = episode.stepProgress || defaultProgress;
    const firstPending = steps.find(s => progress[s] === 'pending') || 'script';
    setEditorStep(firstPending);
    // 加载分集剧本
    setScriptText(episode.scriptText || '');
    setAnalysisData(null);
  };

  // 标记步骤为完成
  const markStepCompleted = useCallback((step: EditorStep) => {
    setStepProgress(prev => {
      const updated = { ...prev, [step]: 'completed' as const };
      // 同步更新到 activeEpisode 并持久化
      if (activeProject && activeEpisode) {
        setActiveEpisode({ ...activeEpisode, stepProgress: updated });
        saveEpisode(activeProject.id, activeEpisode.id, { stepProgress: updated })
          .catch(err => console.error('[App] 保存步骤进度失败:', err));
      }
      return updated;
    });
  }, [activeProject, activeEpisode]);

  // 处理步骤切换（带完成标记）
  const handleStepChangeWithMark = useCallback((targetStep: EditorStep) => {
    const stepOrder: EditorStep[] = ['script', 'assets', 'storyboard', 'video'];
    const currentIndex = stepOrder.indexOf(editorStep);
    const targetIndex = stepOrder.indexOf(targetStep);

    // 如果是向后跳转，标记当前步骤为完成
    if (targetIndex > currentIndex) {
      markStepCompleted(editorStep);
    }
    setEditorStep(targetStep);
  }, [editorStep, markStepCompleted]);

  // 删除项目
  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProjectAPI(id);
      message.success('项目已删除');
    } catch (err: any) {
      message.error(err.message || '删除项目失败');
    }
  };

  // 保存项目设置
  const handleProjectSettingsSave = async (updates: Partial<Project>) => {
    if (!activeProject) return;
    try {
      await updateProjectAPI(activeProject.id, updates);
      setActiveProject({ ...activeProject, ...updates });
      message.success('项目设置已保存');
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  // 处理剧本分析（启动后台任务）
  const handleAnalyze = async () => {
    if (!scriptText.trim()) {
      message.warning('请先输入剧本内容');
      return;
    }
    if (!activeProject) {
      message.warning('请先选择项目');
      return;
    }
    if (!activeEpisode) {
      message.warning('请先选择分集');
      return;
    }

    try {
      setIsAnalyzing(true);
      await startBackgroundAnalysis(
        activeProject.id,
        activeEpisode.id,
        activeEpisode.title || `第${activeEpisode.number}集`,
        scriptText,
        activeProject.llmConfigId
      );
      message.success('解析任务已启动，可在状态栏查看进度');
    } catch (err: any) {
      message.error(err.message || '启动解析失败');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- 渲染辅助函数 ---

  const renderSidebar = () => (
    <div
      className={`${
        isSidebarCollapsed ? 'w-16' : 'w-64'
      } bg-[#141414] border-r border-gray-800 flex flex-col h-full z-40 transition-all duration-300 ease-in-out`}
    >
      {/* Logo 区域 */}
      <div className="h-16 w-full flex items-center justify-center border-b border-gray-800 relative px-3">
        <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-lg shadow-green-900/30">
          A
        </div>
        <span
          className={`ml-3 font-bold text-xl text-white overflow-hidden whitespace-nowrap transition-all duration-300 ${isSidebarCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}
        >
          AiDrama
        </span>
      </div>

      {/* Antd Menu 导航 */}
      <Menu
        mode="inline"
        inlineCollapsed={isSidebarCollapsed}
        selectedKeys={[view]}
        onClick={({ key }) => {
          if (key === 'video-test') {
            handleEnterVideoTest();
          } else if (key === 'overview' || key === 'editor') {
            // 这些是项目内视图，保持不变
          } else {
            setView(key as 'projects' | 'settings');
          }
        }}
        style={{
          flex: 1,
          background: 'transparent',
          borderRight: 'none',
        }}
        items={[
          {
            key: 'projects',
            icon: <AppstoreOutlined />,
            label: '项目管理',
          },
          // 项目概览视图
          ...(view === 'overview' && activeProject && !isSidebarCollapsed
            ? [
                {
                  key: 'overview',
                  icon: <FolderOpen size={16} />,
                  label: `概览: ${activeProject.title}`,
                  disabled: true,
                },
              ]
            : []),
          // 编辑中显示当前项目和分集
          ...(view === 'editor' && activeProject && !isSidebarCollapsed
            ? [
                {
                  key: 'editor',
                  icon: <FileText size={16} />,
                  label: activeEpisode
                    ? `编辑: ${activeProject.title} - 第${activeEpisode.number}集`
                    : `编辑: ${activeProject.title}`,
                  disabled: true,
                },
              ]
            : []),
          { type: 'divider' as const },
          {
            key: 'video-test',
            icon: <Scissors size={16} />,
            label: '剪辑测试',
          },
          { type: 'divider' as const },
          {
            key: 'settings',
            icon: <SettingOutlined />,
            label: '全局设置',
          },
        ]}
      />

      {/* 底部用户区 */}
      <div
        className={`p-4 border-t border-gray-800 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}
      >
        <Tooltip title={isSidebarCollapsed ? 'Studio User' : ''} placement="right">
          <Avatar
            size={32}
            style={{
              background: 'linear-gradient(to top right, #8b5cf6, #3b82f6)',
              flexShrink: 0,
            }}
            icon={<UserOutlined />}
          />
        </Tooltip>
        <div
          className={`transition-all duration-300 ${isSidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}
        >
          <div className="text-sm font-medium text-white whitespace-nowrap">Studio User</div>
          <div className="text-xs text-gray-500 whitespace-nowrap">专业版会员</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-[#0f0f0f] text-gray-100 font-sans selection:bg-green-500/30">
      {/* 自定义标题栏 */}
      <WindowControls />

      <div className="flex flex-1 min-h-0">
      {renderSidebar()}

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        {/* 顶部标题栏 */}
        <header className="h-auto border-b border-gray-800 flex flex-col bg-[#141414] shrink-0 z-30">
            {/* 上层：导航与操作 */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-gray-800/50">
                 <div className="flex items-center text-sm text-gray-400">
                    <button onClick={() => setView('projects')} className="hover:text-white transition-colors flex items-center">
                        <Home className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">首页</span>
                    </button>
                    {/* 项目概览视图面包屑 */}
                    {view === 'overview' && activeProject && (
                        <>
                            <ChevronRight className="w-4 h-4 mx-2 text-gray-600" />
                            <span className="text-white font-bold">{activeProject.title}</span>
                            <span className="ml-2 text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-0.5 rounded shadow-sm">概览</span>
                        </>
                    )}
                    {/* 编辑视图面包屑 */}
                    {view === 'editor' && activeProject && (
                        <>
                            <ChevronRight className="w-4 h-4 mx-2 text-gray-600" />
                            <button
                              onClick={() => setView('overview')}
                              className="hover:text-white transition-colors"
                            >
                              {activeProject.title}
                            </button>
                            {activeEpisode && (
                              <>
                                <ChevronRight className="w-4 h-4 mx-2 text-gray-600" />
                                <span className="text-white font-bold">第 {activeEpisode.number} 集</span>
                              </>
                            )}
                            {activeProject.mode === 'narration' && (
                                <span className="ml-2 text-[10px] bg-blue-900/30 text-blue-300 border border-blue-800/50 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide">旁白解说</span>
                            )}
                        </>
                    )}
                    {view === 'settings' && (
                        <>
                            <ChevronRight className="w-4 h-4 mx-2" />
                            <span className="text-white">全局设置</span>
                        </>
                    )}
                </div>

                {view === 'editor' && (
                    <div className="flex gap-3">
                        <Button icon={<SettingOutlined />} onClick={() => setIsProjectSettingsOpen(true)}>
                            项目设置
                        </Button>
                        <Button icon={<SaveOutlined />}>
                            保存草稿
                        </Button>
                        <Button type="primary" icon={<ExportOutlined />}>
                            导出工程
                        </Button>
                    </div>
                )}
            </div>

            {/* 下层：步骤导航 (仅在编辑器模式显示) */}
            {view === 'editor' && (
                <>
                  <StepNavigator
                    currentStep={editorStep}
                    onStepChange={setEditorStep}
                    stepProgress={stepProgress}
                    actionButton={
                      editorStep === 'script' ? (
                        <Button
                          type="primary"
                          icon={isAnalyzing ? <LoadingOutlined /> : <ThunderboltOutlined />}
                          onClick={handleAnalyze}
                          disabled={isAnalyzing || !scriptText.trim()}
                          className="bg-green-600 hover:bg-green-500 border-none"
                        >
                          {isAnalyzing ? '解析中...' : '开始智能解析'}
                        </Button>
                      ) : editorStep === 'assets' ? (
                        <Button
                          type="primary"
                          onClick={() => handleStepChangeWithMark('storyboard')}
                          className="bg-green-600 hover:bg-green-500 border-none"
                        >
                          下一步：AI分镜
                        </Button>
                      ) : editorStep === 'storyboard' ? (
                        <Button
                          type="primary"
                          onClick={() => handleStepChangeWithMark('video')}
                          className="bg-green-600 hover:bg-green-500 border-none"
                        >
                          下一步：后期剪辑
                        </Button>
                      ) : null
                    }
                  />
                  {activeProject && <TaskStatusBar projectId={activeProject.id} />}
                </>
            )}
        </header>

        {/* 主内容区域 */}
        <main className="flex-1 overflow-hidden relative bg-[#0f0f0f]">
            {view === 'projects' && (
                projectsLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <Spin size="large" tip="加载项目列表...">
                      <div className="p-12" />
                    </Spin>
                  </div>
                ) : (
                  <ProjectList
                    projects={displayProjects}
                    onSelectProject={handleSelectProject}
                    onCreateProject={handleOpenCreateModal}
                    onDeleteProject={handleDeleteProject}
                  />
                )
            )}

            {view === 'settings' && (
                <SettingsPage
                    settings={appSettings}
                    onSave={setAppSettings}
                />
            )}

            {/* 项目概览视图 */}
            {view === 'overview' && activeProject && (
                <ProjectOverview
                  project={activeProject}
                  onEnterEpisode={handleEnterEpisode}
                  onOpenSettings={() => setIsProjectSettingsOpen(true)}
                  onProjectUpdate={(updates) => setActiveProject({ ...activeProject, ...updates })}
                />
            )}

            {view === 'editor' && (
                <>
                    {/* 剧本编辑器视图 */}
                    {editorStep === 'script' && (
                        <div className="flex h-full">
                            {/* 编辑器主体 - 填满整个左侧空间 */}
                            <div className="flex-1 flex flex-col p-4">
                                {/* 编辑器容器 */}
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <ScriptEditor
                                        value={scriptText}
                                        onChange={setScriptText}
                                        placeholder="在此开始创作... (支持直接粘贴小说或剧本，使用 @ 引用角色、场景、道具)"
                                        mentionItems={mentionItems}
                                        minHeight="100%"
                                        maxHeight="100%"
                                        showLineNumbers={true}
                                        darkTheme={true}
                                        style={{ height: '100%', flex: 1 }}
                                    />
                                </div>

                                {/* 底部状态栏 */}
                                <div className="mt-3 flex justify-between items-center text-xs text-gray-500">
                                    <span className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                        {scriptText.length} 字符 | 模型: <span className="text-blue-400 font-mono">
                                          {appSettings.llmConfigs.find(c => c.isDefault)?.name || appSettings.llmConfigs[0]?.name || '未配置'}
                                        </span>
                                    </span>
                                </div>
                            </div>

                            {/* 分析结果侧边栏 */}
                            <div className={`w-80 border-l border-gray-800 bg-[#121212] flex flex-col transition-all ${analysisData ? 'translate-x-0' : 'translate-x-full hidden xl:flex'}`}>
                                <div className="p-5 border-b border-gray-800 bg-[#141414]">
                                    <h3 className="font-bold text-gray-300 text-sm uppercase tracking-wider flex items-center gap-2">
                                        <LayoutDashboard className="w-4 h-4 text-purple-500" />
                                        智能分析概览
                                    </h3>
                                </div>
                                
                                {analysisData ? (
                                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                                        {/* 角色卡片 */}
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-xs text-gray-500 font-bold uppercase">
                                                <span>核心角色</span>
                                                <span className="bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded-full">{analysisData.characters.length}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {analysisData.characters.map(c => (
                                                    <div key={c.id} className="bg-[#1a1a1a] p-2 rounded border border-gray-800 flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500">
                                                            {c.name.charAt(0)}
                                                        </div>
                                                        <span className="text-sm text-gray-300 truncate">{c.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* 场景列表 */}
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-xs text-gray-500 font-bold uppercase">
                                                <span>场景列表</span>
                                                <span className="bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded-full">{analysisData.scenes.length}</span>
                                            </div>
                                            <div className="space-y-2">
                                                {analysisData.scenes.map(s => (
                                                    <div key={s.id} className="text-xs bg-[#1a1a1a] p-3 rounded border border-gray-800 flex flex-col gap-1 hover:border-purple-500/30 transition-colors">
                                                        <span className="text-gray-300 font-bold">{s.name}</span>
                                                        <div className="flex items-center justify-between">
                                                             <span className="text-gray-500">{s.time === 'day' ? '☀️ 日' : '🌙 夜'}</span>
                                                             <span className="text-purple-400/80">{s.mood}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-gray-600 p-8 text-center space-y-4">
                                        <div className="w-16 h-16 rounded-full bg-[#1a1a1a] flex items-center justify-center border border-gray-800">
                                            <Sparkles className="w-8 h-8 opacity-20" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-400">等待分析</p>
                                            <p className="text-xs mt-1">输入剧本并点击下方按钮，AI 将自动提取角色与分镜。</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 资产管理视图 (主体管理) */}
                    {editorStep === 'assets' && (
                        activeProject ? (
                            <AssetManager
                                projectId={activeProject.id}
                                ttiConfigId={activeProject.ttiConfigId}
                                episodeId={activeEpisode?.id}
                                episodeName={activeEpisode?.title || (activeEpisode ? `第${activeEpisode.number}集` : undefined)}
                                script={scriptText}
                                llmConfigId={activeProject.llmConfigId}
                                characters={analysisData?.characters}
                                scenes={analysisData?.scenes}
                                props={analysisData?.props}
                                onNext={() => setEditorStep('storyboard')}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-gray-500 flex-col gap-4">
                                <Users className="w-16 h-16 opacity-10" />
                                <p>请先选择项目。</p>
                                <Button type="link" onClick={() => setView('projects')}>返回项目列表</Button>
                            </div>
                        )
                    )}

                    {/* 分镜视图 */}
                    {editorStep === 'storyboard' && (
                        activeProject ? (
                            <Storyboard
                                projectId={activeProject.id}
                                episodeId={activeEpisode?.id}
                                episodeName={activeEpisode?.title || (activeEpisode ? `第${activeEpisode.number}集` : undefined)}
                                script={scriptText}
                                llmConfigId={activeProject.llmConfigId}
                                ttiConfigId={activeProject.ttiConfigId}
                                settings={appSettings}
                                mentionItems={mentionItems}
                            />
                        ) : (
                             <div className="flex h-full items-center justify-center text-gray-500 flex-col gap-4">
                                <Clapperboard className="w-16 h-16 opacity-10" />
                                <p>请先选择项目。</p>
                                <Button type="link" onClick={() => setView('projects')}>返回项目列表</Button>
                            </div>
                        )
                    )}

                    {/* 剪辑视图 */}
                    {editorStep === 'video' && (
                         analysisData ? (
                            <SimpleEditor
                                shots={analysisData.shots}
                                projectId={activeProject?.id}
                                episodeId={activeEpisode?.id}
                            />
                        ) : (
                             <div className="flex h-full items-center justify-center text-gray-500 flex-col gap-4">
                                <Scissors className="w-16 h-16 opacity-10" />
                                <p>需完成分镜生成后才能进入剪辑环节。</p>
                                <Button type="link" onClick={() => setEditorStep('script')}>返回剧本</Button>
                            </div>
                        )
                    )}
                </>
            )}
        </main>
      </div>
      </div>

      {/* 创建项目弹窗 */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateProject}
      />

      {/* 项目设置弹窗 */}
      <ProjectSettingsModal
        project={activeProject}
        open={isProjectSettingsOpen}
        onClose={() => setIsProjectSettingsOpen(false)}
        onSave={handleProjectSettingsSave}
        onGoToGlobalSettings={() => {
          setIsProjectSettingsOpen(false);
          setView('settings');
        }}
      />

    </div>
  );
};

// 外层包装组件，提供 Ant Design App 上下文
const App: React.FC = () => {
  return (
    <AntApp>
      <AppContent />
    </AntApp>
  );
};

export default App;