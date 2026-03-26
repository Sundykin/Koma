import React, { useMemo } from 'react';
import { Avatar, Tooltip } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { LayoutGrid, Scissors, Settings, Puzzle, MessageCircle, PenTool } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Project, Episode } from '../../types';
import { usePluginStore } from '../../store/pluginStore';

// 视图类型：支持插件路由
export type AppView = 'projects' | 'overview' | 'editor' | 'settings' | 'plugins' | 'chat' | 'linghui' | `plugin:${string}`;

interface SidebarProps {
  view: AppView;
  activeProject: Project | null;
  activeEpisode: Episode | null;
  onViewChange: (view: AppView) => void;
  onEnterVideoTest: () => void;
}

// 导航项组件
interface NavItemProps {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ active, icon, label, onClick }) => (
  <Tooltip title={label} placement="right">
    <button
      onClick={onClick}
      className={`relative w-full flex justify-center py-2.5 cursor-pointer transition-colors ${
        active ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {/* 左侧激活指示条 */}
      {active && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-emerald-500 rounded-r-md"
          style={{ boxShadow: '0 0 12px rgba(16,185,129,0.5)' }}
        />
      )}
      {/* 图标容器 */}
      <div className={`p-2.5 rounded-xl transition-all ${
        active ? 'bg-emerald-400/10' : 'hover:bg-zinc-800'
      }`}>
        {icon}
      </div>
    </button>
  </Tooltip>
);

export const Sidebar: React.FC<SidebarProps> = ({
  view,
  activeProject: _activeProject,
  activeEpisode: _activeEpisode,
  onViewChange,
  onEnterVideoTest,
}) => {
  const { t } = useTranslation();
  const plugins = usePluginStore(state => state.plugins);

  const globalPlugins = useMemo(
    () => plugins.filter(p => p.category === 'global' && p.isEnabled),
    [plugins]
  );

  // 主导航项
  const mainNavItems = [
    { key: 'projects', icon: <LayoutGrid size={22} />, label: t('sidebar.projects') },
    { key: 'linghui', icon: <PenTool size={22} />, label: t('sidebar.linghui') },
    { key: 'chat', icon: <MessageCircle size={22} />, label: t('chat.title') },
  ];

  // 工具导航项
  const toolNavItems = [
    { key: 'video-test', icon: <Scissors size={22} />, label: t('sidebar.videoTest'), isAction: true },
  ];

  // 插件导航项
  const pluginNavItems = globalPlugins
    .sort((a, b) => (a.globalMeta?.navigation?.order || 50) - (b.globalMeta?.navigation?.order || 50))
    .map(plugin => ({
      key: `plugin:${plugin.id}`,
      icon: <Puzzle size={22} />,
      label: plugin.globalMeta?.navigation?.label || plugin.name,
    }));

  // 底部导航项
  const bottomNavItems = [
    { key: 'settings', icon: <Settings size={22} />, label: t('sidebar.settings') },
  ];

  const handleNavClick = (key: string, _isAction?: boolean) => {
    if (key === 'video-test') {
      onEnterVideoTest();
    } else {
      onViewChange(key as AppView);
    }
  };

  return (
    <div className="w-[var(--sidebar-width)] bg-zinc-950 border-r border-zinc-800 flex flex-col h-full z-40 shrink-0">
      {/* Logo 区域 */}
      <div className="h-14 w-full flex items-center justify-center">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-emerald-900/40">
          K
        </div>
      </div>

      {/* 主导航区 */}
      <nav className="flex-1 flex flex-col py-2">
        {/* 主导航 */}
        <div className="space-y-1">
          {mainNavItems.map(item => (
            <NavItem
              key={item.key}
              active={view === item.key}
              icon={item.icon}
              label={item.label}
              onClick={() => handleNavClick(item.key)}
            />
          ))}
        </div>

        {/* 分隔线 */}
        <div className="mx-4 my-3 border-t border-zinc-800" />

        {/* 工具导航 */}
        <div className="space-y-1">
          {toolNavItems.map(item => (
            <NavItem
              key={item.key}
              active={view === item.key}
              icon={item.icon}
              label={item.label}
              onClick={() => handleNavClick(item.key, item.isAction)}
            />
          ))}
        </div>

        {/* 插件导航 */}
        {pluginNavItems.length > 0 && (
          <>
            <div className="mx-4 my-3 border-t border-zinc-800" />
            <div className="space-y-1">
              {pluginNavItems.map(item => (
                <NavItem
                  key={item.key}
                  active={view === item.key}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => handleNavClick(item.key)}
                />
              ))}
            </div>
          </>
        )}

        {/* 弹性空间 */}
        <div className="flex-1" />

        {/* 分隔线 */}
        <div className="mx-4 my-3 border-t border-zinc-800" />

        {/* 底部导航 */}
        <div className="space-y-1">
          {bottomNavItems.map(item => (
            <NavItem
              key={item.key}
              active={view === item.key}
              icon={item.icon}
              label={item.label}
              onClick={() => handleNavClick(item.key)}
            />
          ))}
        </div>
      </nav>

      {/* 底部用户区 */}
      <div className="p-3 border-t border-zinc-800 flex items-center justify-center">
        <Tooltip title="Studio User" placement="right">
          <Avatar
            size={36}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
              cursor: 'pointer',
            }}
            icon={<UserOutlined />}
          />
        </Tooltip>
      </div>
    </div>
  );
};
