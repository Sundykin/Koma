import React, { useMemo } from 'react';
import { Menu, Avatar, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  SettingOutlined,
  UserOutlined,
  AppstoreAddOutlined,
} from '@ant-design/icons';
import { Scissors } from 'lucide-react';
import { Project, Episode } from '../../types';
import { usePluginStore } from '../../store/pluginStore';

// 视图类型：支持插件路由
export type AppView = 'projects' | 'overview' | 'editor' | 'settings' | 'plugins' | `plugin:${string}`;

interface SidebarProps {
  view: AppView;
  activeProject: Project | null;
  activeEpisode: Episode | null;
  onViewChange: (view: AppView) => void;
  onEnterVideoTest: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  view,
  activeProject,
  activeEpisode,
  onViewChange,
  onEnterVideoTest,
}) => {
  // 订阅 plugins 数组（稳定引用）
  const plugins = usePluginStore(state => state.plugins);

  // 使用 useMemo 过滤全局插件，避免每次渲染创建新数组
  const globalPlugins = useMemo(
    () => plugins.filter(p => p.category === 'global' && p.isEnabled),
    [plugins]
  );

  // 构建动态插件菜单项
  const pluginMenuItems = globalPlugins
    .sort((a, b) => (a.globalMeta?.navigation?.order || 50) - (b.globalMeta?.navigation?.order || 50))
    .map(plugin => ({
      key: `plugin:${plugin.id}`,
      icon: <AppstoreAddOutlined />,
      label: plugin.globalMeta?.navigation?.label || plugin.name,
    }));

  return (
    <div className="w-16 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full z-40 shrink-0">
      {/* Logo 区域 */}
      <div className="h-16 w-full flex items-center justify-center border-b border-zinc-800">
        <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-emerald-900/30">
          A
        </div>
      </div>

      {/* Antd Menu 导航 - 永久收起 */}
      <Menu
        mode="inline"
        inlineCollapsed={true}
        selectedKeys={[view]}
        onClick={({ key }) => {
          if (key === 'video-test') {
            onEnterVideoTest();
          } else {
            onViewChange(key as AppView);
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
          { type: 'divider' as const },
          {
            key: 'video-test',
            icon: <Scissors size={16} />,
            label: '剪辑测试',
          },
          // 动态插件菜单
          ...(pluginMenuItems.length > 0
            ? [
                { type: 'divider' as const },
                ...pluginMenuItems,
              ]
            : []),
          { type: 'divider' as const },
          {
            key: 'settings',
            icon: <SettingOutlined />,
            label: '全局设置',
          },
        ]}
      />

      {/* 底部用户区 */}
      <div className="p-4 border-t border-zinc-800 flex items-center justify-center">
        <Tooltip title="Studio User" placement="right">
          <Avatar
            size={32}
            style={{
              background: 'linear-gradient(to top right, #8b5cf6, #3b82f6)',
            }}
            icon={<UserOutlined />}
          />
        </Tooltip>
      </div>
    </div>
  );
};
