import React, { useState, useEffect, useCallback } from 'react';
import { Project, ScriptAnalysisResult, EditorStep, AppSettings } from './types';
import { ProjectList } from './components/ProjectList';
import { AssetManager } from './components/AssetManager';
import { Storyboard } from './components/Storyboard';
import { VideoEditor } from './components/editor';
import { SettingsPage } from './components/SettingsPage';
import { StepNavigator } from './components/StepNavigator';
import { CreateProjectModal } from './components/CreateProjectModal';
import { ProjectSettingsModal } from './components/ProjectSettingsModal';
import { WindowControls } from './components/WindowControls';
import { ScriptAnalysisWizard } from './components/ScriptAnalysisWizard';
import { useProjects } from './hooks/useProjects';
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
  FileText
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
    { id: 'c1', name: '叶青凡', age: '28', role: 'protagonist', description: '沉稳冷静的调查员', appearance: '黑发，深邃眼神', avatarUrl: '' },
    { id: 'c2', name: '鬼护士', age: '?', role: 'antagonist', description: '神秘的医院幽灵', appearance: '白色护士服，无面孔', avatarUrl: '' },
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

  const [view, setView] = useState<'projects' | 'editor' | 'settings'>(isVideoDevMode ? 'editor' : 'projects');
  const [activeProject, setActiveProject] = useState<Project | null>(
    isVideoDevMode ? DEV_TEST_PROJECT : null
  );
  const [editorStep, setEditorStep] = useState<EditorStep>(isVideoDevMode ? 'video' : 'script');
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // 弹窗状态
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);

  // 剧本相关状态
  const [scriptText, setScriptText] = useState(DEFAULT_SCRIPT);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisWizardVisible, setAnalysisWizardVisible] = useState(false);

  // 项目数据状态
  const [analysisData, setAnalysisData] = useState<ScriptAnalysisResult | null>(
    isVideoDevMode ? DEV_TEST_ANALYSIS : null
  );

  // 侧边栏折叠逻辑：在 editor 模式下折叠
  const isSidebarCollapsed = view === 'editor';

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
  const handleCreateProject = async (data: { title: string; mode: 'drama' | 'narration'; script: string }) => {
    try {
      const created = await createProjectAPI({
        title: data.title,
        mode: data.mode,
        genre: data.mode === 'drama' ? '剧情' : '解说',
      });

      const newProject: Project = {
        id: created.id,
        title: created.title,
        genre: created.genre,
        mode: created.mode,
        episodes: created.episodes || 1,
        lastEdited: '刚刚',
        thumbnail: created.thumbnail || `https://picsum.photos/seed/${created.id}/600/338`,
        status: created.status || 'script'
      };

      if (data.script.trim()) {
        setScriptText(data.script);
      } else {
        setScriptText('');
      }

      setActiveProject(newProject);
      setView('editor');
      setEditorStep('script');
      setAnalysisData(null);
      setIsCreateModalOpen(false);
      message.success('项目创建成功');
    } catch (err: any) {
      message.error(err.message || '创建项目失败');
    }
  };

  // 选择已有项目
  const handleSelectProject = (id: string) => {
    const proj = displayProjects.find(p => p.id === id);
    if (proj) {
      setActiveProject(proj);
      setView('editor');
      setEditorStep(proj.status === 'storyboard' ? 'storyboard' : 'script');
      // TODO: 加载项目的剧本数据
      setScriptText('');
      setAnalysisData(null);
    }
  };

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

  // 处理剧本分析（打开解析向导）
  const handleAnalyze = async () => {
    if (!scriptText.trim()) {
      message.warning('请先输入剧本内容');
      return;
    }
    setAnalysisWizardVisible(true);
  };

  // 解析完成回调
  const handleAnalysisComplete = (result: ScriptAnalysisResult) => {
    setAnalysisData(result);
    setAnalysisWizardVisible(false);
    setEditorStep('assets');
    message.success('剧本解析完成');
  };

  // --- 辅助组件：剧本工具栏 ---
  const ScriptToolbar = () => (
    <div className="flex items-center justify-between p-2 bg-[#1a1a1a] border-b border-gray-800 rounded-t-xl select-none">
        <div className="flex items-center gap-1">
            <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors" title="粗体">
                <Bold className="w-4 h-4" />
            </button>
            <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors" title="斜体">
                <Italic className="w-4 h-4" />
            </button>
            <div className="w-[1px] h-4 bg-gray-700 mx-1"></div>
            <button className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 rounded transition-colors">
                <MapPin className="w-3 h-3 text-purple-400" /> 场景
            </button>
            <button className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 rounded transition-colors">
                <User className="w-3 h-3 text-blue-400" /> 角色
            </button>
            <button className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 rounded transition-colors">
                <MessageSquare className="w-3 h-3 text-green-400" /> 台词
            </button>
            <button className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 rounded transition-colors">
                <Type className="w-3 h-3 text-orange-400" /> 动作
            </button>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 font-mono">
            {scriptText.length} 字符
        </div>
    </div>
  );

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
          } else {
            setView(key as 'projects' | 'editor' | 'settings');
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
          // 编辑中显示当前项目
          ...(view === 'editor' && activeProject && !isSidebarCollapsed
            ? [
                {
                  key: 'editor',
                  icon: <FileText size={16} />,
                  label: `编辑: ${activeProject.title}`,
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
                    {view === 'editor' && activeProject && (
                        <>
                            <ChevronRight className="w-4 h-4 mx-2 text-gray-600" />
                            <span className="text-white font-bold">{activeProject.title}</span>
                            <span className="ml-2 text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-0.5 rounded shadow-sm">{activeProject.episodes} 集</span>
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
                <StepNavigator currentStep={editorStep} onStepChange={setEditorStep} />
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

            {view === 'editor' && (
                <>
                    {/* 剧本编辑器视图 */}
                    {editorStep === 'script' && (
                        <div className="flex h-full">
                            {/* 编辑器主体 */}
                            <div className="flex-1 overflow-y-auto">
                                <div className="h-full flex flex-col px-4 py-6 lg:px-[100px] lg:py-8 transition-all duration-300">
                                    <h2 className="text-xl font-bold mb-4 text-gray-200 flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-green-500" />
                                        剧本创作
                                    </h2>
                                    
                                    {/* 编辑器容器 */}
                                    <div className="flex-1 bg-[#1a1a1a] rounded-xl border border-gray-800 shadow-xl flex flex-col overflow-hidden focus-within:border-green-600/50 transition-colors">
                                        <ScriptToolbar />
                                        
                                        <div className="flex-1 flex relative">
                                            {/* 行号模拟 (Visual only) */}
                                            <div className="w-10 bg-[#161616] border-r border-gray-800 pt-6 text-right pr-2 text-gray-600 font-mono text-sm select-none hidden sm:block">
                                                {Array.from({length: 20}).map((_, i) => (
                                                    <div key={i} className="leading-relaxed">{i + 1}</div>
                                                ))}
                                            </div>

                                            <textarea 
                                                value={scriptText}
                                                onChange={(e) => setScriptText(e.target.value)}
                                                className="flex-1 bg-[#1a1a1a] p-6 text-gray-300 focus:outline-none resize-none font-serif leading-relaxed text-lg placeholder-gray-700 selection:bg-green-500/30"
                                                placeholder="在此开始创作... (支持直接粘贴小说或剧本)"
                                                spellCheck={false}
                                            />
                                        </div>
                                    </div>

                                    {/* 底部操作区 */}
                                    <div className="mt-6 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                             <span className="text-xs text-gray-500 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                                模型: <span className="text-blue-400 font-mono font-bold">
                                                  {appSettings.llmConfigs.find(c => c.isDefault)?.name || appSettings.llmConfigs[0]?.name || '未配置'}
                                                </span>
                                            </span>
                                        </div>

                                        <Button
                                            type="primary"
                                            size="large"
                                            onClick={handleAnalyze}
                                            loading={isAnalyzing}
                                            icon={isAnalyzing ? <LoadingOutlined /> : <ThunderboltOutlined />}
                                        >
                                            {isAnalyzing ? 'AI 深度解析中...' : '开始智能拆解剧本'}
                                        </Button>
                                    </div>
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
                        analysisData ? (
                            <AssetManager 
                                characters={analysisData.characters} 
                                scenes={analysisData.scenes} 
                                props={analysisData.props}
                                onNext={() => setEditorStep('storyboard')}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-gray-500 flex-col gap-4">
                                <Users className="w-16 h-16 opacity-10" />
                                <p>请先分析剧本以生成角色和场景资产。</p>
                                <Button type="link" onClick={() => setEditorStep('script')}>返回剧本</Button>
                            </div>
                        )
                    )}

                    {/* 分镜视图 */}
                    {editorStep === 'storyboard' && (
                         analysisData ? (
                            <Storyboard 
                                shots={analysisData.shots} 
                                characters={analysisData.characters} 
                                settings={appSettings}
                            />
                        ) : (
                             <div className="flex h-full items-center justify-center text-gray-500 flex-col gap-4">
                                <Clapperboard className="w-16 h-16 opacity-10" />
                                <p>请先分析剧本以生成分镜脚本。</p>
                                <Button type="link" onClick={() => setEditorStep('script')}>返回剧本</Button>
                            </div>
                        )
                    )}

                    {/* 剪辑视图 */}
                    {editorStep === 'video' && (
                         analysisData ? (
                            <VideoEditor 
                                shots={analysisData.shots} 
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

      {/* 剧本解析向导 */}
      <ScriptAnalysisWizard
        visible={analysisWizardVisible}
        script={scriptText}
        projectLLMConfigId={activeProject?.llmConfigId}
        onCancel={() => setAnalysisWizardVisible(false)}
        onComplete={handleAnalysisComplete}
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