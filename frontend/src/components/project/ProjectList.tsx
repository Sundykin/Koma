import React, { useState } from 'react';
import { Project } from '../../types';
import { Plus, Clock, Search, MoreHorizontal, FileText, Film, PlayCircle, CheckCircle2, Trash2, FolderPlus } from 'lucide-react';
import { Dropdown, Modal } from 'antd';
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

  const statusConfig = {
    'script': { label: '剧本', color: 'text-blue-400', bg: 'bg-blue-400/10', icon: FileText },
    'storyboard': { label: '分镜', color: 'text-purple-400', bg: 'bg-purple-400/10', icon: Film },
    'generating': { label: '生成中', color: 'text-orange-400', bg: 'bg-orange-400/10', icon: PlayCircle },
    'completed': { label: '已完成', color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: CheckCircle2 }
  };

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

  const handleDeleteConfirm = () => {
    if (projectToDelete && onDeleteProject) {
      onDeleteProject(projectToDelete.id);
    }
    setDeleteModalVisible(false);
    setProjectToDelete(null);
  };

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

  // 是否真的没有项目（而不是筛选后无结果）
  const hasNoProjects = projects.length === 0;
  // 筛选后无结果
  const isFilterEmpty = !hasNoProjects && filteredProjects.length === 0;

  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-y-auto">
      {/* 紧凑头部 */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-6 py-3">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-4">
          {/* 左侧：标题 */}
          <h1 className="text-xl font-bold text-white whitespace-nowrap">我的项目</h1>

          {/* 中间：搜索和筛选 */}
          <div className="flex-1 flex items-center justify-center gap-2 max-w-xl">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="搜索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-600 pl-9 pr-3 py-1.5 rounded-md focus:outline-none focus:border-zinc-600"
              />
            </div>
            <div className="flex gap-0.5 bg-zinc-900 p-0.5 rounded-md border border-zinc-800">
              {(['all', 'script', 'video', 'completed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    filter === f
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {f === 'all' ? '全部' : f === 'script' ? '剧本' : f === 'video' ? '制作中' : '已完成'}
                </button>
              ))}
            </div>
          </div>

          {/* 右侧：新建按钮（有项目时显示） */}
          {!hasNoProjects && (
            <button
              onClick={onCreateProject}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>新建</span>
            </button>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto w-full">
          {/* 空状态：没有任何项目 */}
          {hasNoProjects && (
            <div className="flex flex-col items-center justify-center py-20">
              <button
                onClick={onCreateProject}
                className="group w-full max-w-md py-8 bg-zinc-900 border-2 border-dashed border-zinc-700 hover:border-emerald-500/50 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-zinc-800/50"
              >
                <div className="w-16 h-16 rounded-full bg-zinc-800 group-hover:bg-emerald-900/30 flex items-center justify-center mb-4 transition-colors">
                  <FolderPlus className="w-8 h-8 text-zinc-500 group-hover:text-emerald-400" />
                </div>
                <span className="text-lg font-bold text-zinc-300 group-hover:text-white transition-colors">创建你的第一个项目</span>
                <span className="text-sm text-zinc-600 mt-1">开始 AI 短剧制作之旅</span>
              </button>
            </div>
          )}

          {/* 筛选后无结果 */}
          {isFilterEmpty && (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <p>未找到匹配的项目</p>
              <button
                onClick={() => { setSearchQuery(''); setFilter('all'); }}
                className="mt-4 text-sm text-emerald-500 hover:underline"
              >
                清除筛选条件
              </button>
            </div>
          )}

          {/* 项目列表 */}
          {filteredProjects.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProjects.map((project) => {
                const StatusIcon = statusConfig[project.status]?.icon || FileText;
                const statusCfg = statusConfig[project.status];

                return (
                  <div
                    key={project.id}
                    onClick={() => onSelectProject(project.id)}
                    className="group bg-zinc-900 rounded-lg border border-zinc-800 hover:border-zinc-600 p-4 cursor-pointer transition-all hover:bg-zinc-800/50"
                  >
                    {/* 顶部：状态和操作 */}
                    <div className="flex items-center justify-between mb-3">
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${statusCfg?.bg || 'bg-zinc-800'}`}>
                        <StatusIcon className={`w-3 h-3 ${statusCfg?.color || 'text-zinc-400'}`} />
                        <span className={`text-[10px] font-bold ${statusCfg?.color || 'text-zinc-400'}`}>
                          {statusCfg?.label}
                        </span>
                      </div>
                      <Dropdown
                        menu={{ items: getDropdownItems(project) }}
                        trigger={['click']}
                        placement="bottomRight"
                      >
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 text-zinc-600 hover:text-white hover:bg-zinc-700 rounded opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </Dropdown>
                    </div>

                    {/* 标题 */}
                    <h3 className="text-base font-bold text-zinc-100 mb-2 truncate group-hover:text-emerald-400 transition-colors">
                      {project.title}
                    </h3>

                    {/* 进度条 (仅生成中显示) */}
                    {project.status === 'generating' && (
                      <div className="h-1 bg-zinc-800 rounded-full mb-2 overflow-hidden">
                        <div className="h-full bg-orange-500 w-2/3 animate-pulse rounded-full" />
                      </div>
                    )}

                    {/* 标签和信息 */}
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span className="text-[10px] font-medium text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {project.genre}
                      </span>
                      {project.mode === 'narration' && (
                        <span className="text-[10px] font-medium text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded">
                          解说
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-600">{project.episodes} 集</span>
                    </div>

                    {/* 底部：时间 */}
                    <div className="flex items-center text-xs text-zinc-600">
                      <Clock className="w-3 h-3 mr-1" />
                      {project.lastEdited}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
        maskClosable={false}
      >
        <div className="py-4">
          <p className="text-zinc-400 mb-2">
            您确定要删除项目 <strong className="text-zinc-100">{projectToDelete?.title}</strong> 吗？
          </p>
          <p className="text-red-500 text-sm">
            此操作不可恢复，项目所有数据（包括剧本、分镜、素材）都将被永久删除。
          </p>
        </div>
      </Modal>
    </div>
  );
};
