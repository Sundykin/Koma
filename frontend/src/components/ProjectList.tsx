import React, { useState } from 'react';
import { Project } from '../types';
import { Plus, Clock, Search, Filter, MoreHorizontal, FileText, Film, PlayCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { Dropdown, Modal, message } from 'antd';
import type { MenuProps } from 'antd';

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject?: (id: string) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  onSelectProject,
  onCreateProject,
  onDeleteProject
}) => {
  const [filter, setFilter] = useState<'all' | 'script' | 'video' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // 状态配置
  const statusConfig = {
    'script': { label: '剧本创作', color: 'text-blue-400', bg: 'bg-blue-400/10', icon: FileText },
    'storyboard': { label: '分镜设计', color: 'text-purple-400', bg: 'bg-purple-400/10', icon: Film },
    'generating': { label: '生成中', color: 'text-orange-400', bg: 'bg-orange-400/10', icon: PlayCircle },
    'completed': { label: '已完成', color: 'text-green-400', bg: 'bg-green-400/10', icon: CheckCircle2 }
  };

  // 过滤逻辑
  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all'
      ? true
      : filter === 'completed'
        ? p.status === 'completed'
        : filter === 'video'
          ? (p.status === 'storyboard' || p.status === 'generating')
          : p.status === 'script';
    return matchesSearch && matchesFilter;
  });

  // 处理删除确认
  const handleDeleteConfirm = () => {
    if (projectToDelete && onDeleteProject) {
      onDeleteProject(projectToDelete.id);
    }
    setDeleteModalVisible(false);
    setProjectToDelete(null);
  };

  // 打开删除确认弹窗
  const openDeleteModal = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setDeleteModalVisible(true);
  };

  // 创建下拉菜单项
  const getDropdownItems = (project: Project): MenuProps['items'] => [
    {
      key: 'delete',
      label: '删除项目',
      icon: <Trash2 className="w-4 h-4" />,
      danger: true,
      onClick: (info) => {
        info.domEvent.stopPropagation();
        setProjectToDelete(project);
        setDeleteModalVisible(true);
      },
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f] overflow-y-auto">
      {/* 顶部 Header */}
      <div className="sticky top-0 z-20 bg-[#0f0f0f]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0f0f0f]/60 border-b border-gray-800 px-8 py-6">
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">我的项目</h1>
              <p className="text-gray-400 text-sm mt-1">管理您的 AI 短剧制作工程</p>
            </div>

            {/* 搜索与筛选工具栏 */}
            <div className="flex items-center gap-3 bg-[#1a1a1a] p-1 rounded-lg border border-gray-800">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-white transition-colors" />
                <input
                  type="text"
                  placeholder="搜索项目..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-sm text-white placeholder-gray-600 pl-9 pr-4 py-2 focus:ring-0 w-48 transition-all focus:w-64"
                />
              </div>
              <div className="w-[1px] h-6 bg-gray-700"></div>
              <div className="flex gap-1">
                {(['all', 'script', 'video', 'completed'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      filter === f
                        ? 'bg-gray-700 text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {f === 'all' ? '全部' : f === 'script' ? '剧本' : f === 'video' ? '制作中' : '已完成'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 项目列表网格 */}
      <div className="p-8 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

          {/* 1. 新建项目卡片 (Always First) */}
          <div
            onClick={onCreateProject}
            className="group relative aspect-[16/10] bg-[#141414] border-2 border-dashed border-gray-800 hover:border-green-500/50 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-[#1a1a1a]"
          >
            <div className="w-14 h-14 rounded-full bg-gray-800 group-hover:bg-green-900/20 flex items-center justify-center mb-3 transition-colors">
              <Plus className="w-7 h-7 text-gray-400 group-hover:text-green-500" />
            </div>
            <span className="text-sm font-bold text-gray-400 group-hover:text-white transition-colors">创建新短剧</span>
            <span className="text-xs text-gray-600 mt-1">从剧本或创意开始</span>
          </div>

          {/* 2. 项目列表 */}
          {filteredProjects.map((project) => {
            const StatusIcon = statusConfig[project.status]?.icon || FileText;

            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className="group bg-[#1a1a1a] rounded-xl overflow-hidden border border-gray-800 hover:border-gray-600 hover:shadow-2xl hover:shadow-black/50 transition-all cursor-pointer relative"
              >
                {/* 封面区域 */}
                <div className="aspect-[16/10] bg-gray-900 relative overflow-hidden">
                  <img
                    src={project.thumbnail}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                    alt={project.title}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-transparent opacity-60"></div>

                  {/* 状态标签 */}
                  <div className="absolute top-3 left-3">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md border border-white/5 ${statusConfig[project.status]?.bg || 'bg-gray-800'}`}>
                      <StatusIcon className={`w-3 h-3 ${statusConfig[project.status]?.color || 'text-gray-400'}`} />
                      <span className={`text-[10px] font-bold tracking-wide uppercase ${statusConfig[project.status]?.color || 'text-gray-400'}`}>
                        {statusConfig[project.status]?.label}
                      </span>
                    </div>
                  </div>

                  {/* 更多操作 (Hover 显示) */}
                  <Dropdown
                    menu={{ items: getDropdownItems(project) }}
                    trigger={['click']}
                    placement="bottomRight"
                  >
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-3 right-3 p-1.5 bg-black/50 hover:bg-black/80 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </Dropdown>
                </div>

                {/* 信息区域 */}
                <div className="p-5 relative">
                  {/* 进度条 (仅生成中显示) */}
                  {project.status === 'generating' && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-800">
                      <div className="h-full bg-orange-500 w-2/3 animate-pulse"></div>
                    </div>
                  )}

                  <h3 className="text-lg font-bold text-gray-100 mb-1.5 truncate group-hover:text-green-400 transition-colors">
                    {project.title}
                  </h3>

                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] font-medium text-gray-500 bg-gray-900 px-2 py-0.5 rounded border border-gray-800">
                      {project.genre}
                    </span>
                    {project.mode === 'narration' && (
                      <span className="text-[10px] font-medium text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded border border-blue-900/30">
                        解说
                      </span>
                    )}
                    <span className="text-[10px] text-gray-600">{project.episodes} 集</span>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-800/50">
                    <div className="flex items-center text-xs text-gray-500">
                      <Clock className="w-3 h-3 mr-1.5" />
                      {project.lastEdited}
                    </div>
                    <div className="flex -space-x-2">
                      <div className="w-5 h-5 rounded-full bg-purple-500 border border-[#1a1a1a]"></div>
                      <div className="w-5 h-5 rounded-full bg-blue-500 border border-[#1a1a1a]"></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State Search */}
        {filteredProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Search className="w-12 h-12 mb-4 opacity-20" />
            <p>未找到匹配的项目</p>
            <button
              onClick={() => { setSearchQuery(''); setFilter('all'); }}
              className="mt-4 text-sm text-green-500 hover:underline"
            >
              清除筛选条件
            </button>
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <Modal
        title="确认删除项目"
        open={deleteModalVisible}
        onOk={handleDeleteConfirm}
        onCancel={() => { setDeleteModalVisible(false); setProjectToDelete(null); }}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <div className="py-4">
          <p className="text-gray-600 mb-2">
            您确定要删除项目 <strong className="text-gray-900">{projectToDelete?.title}</strong> 吗？
          </p>
          <p className="text-red-500 text-sm">
            此操作不可恢复，项目所有数据（包括剧本、分镜、素材）都将被永久删除。
          </p>
        </div>
      </Modal>
    </div>
  );
};
