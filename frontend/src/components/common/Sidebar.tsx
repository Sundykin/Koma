import React from 'react';
import { Menu, Avatar, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Scissors, FileText, FolderOpen } from 'lucide-react';
import { Project, Episode } from '../../types';

interface SidebarProps {
  view: 'projects' | 'overview' | 'editor' | 'settings';
  activeProject: Project | null;
  activeEpisode: Episode | null;
  isSidebarCollapsed: boolean;
  onViewChange: (view: 'projects' | 'settings') => void;
  onEnterVideoTest: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  view,
  activeProject,
  activeEpisode,
  isSidebarCollapsed,
  onViewChange,
  onEnterVideoTest,
}) => {
  return (
    <div
      className={`${
        isSidebarCollapsed ? 'w-16' : 'w-64'
      } bg-zinc-900 border-r border-zinc-800 flex flex-col h-full z-40 transition-all duration-300 ease-in-out`}
    >
      {/* Logo 区域 */}
      <div className="h-16 w-full flex items-center justify-center border-b border-zinc-800 relative px-3">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-lg shadow-emerald-900/30">
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
            onEnterVideoTest();
          } else if (key === 'overview' || key === 'editor') {
            // 这些是项目内视图，保持不变
          } else {
            onViewChange(key as 'projects' | 'settings');
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
        className={`p-4 border-t border-zinc-800 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}
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
          <div className="text-xs text-zinc-500 whitespace-nowrap">专业版会员</div>
        </div>
      </div>
    </div>
  );
};
