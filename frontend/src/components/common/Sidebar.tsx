import React from 'react';
import { Avatar, Tooltip } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { LayoutGrid, Scissors, Settings, ListTodo, Film } from 'lucide-react';

// 顶层导航仅保留核心三页 + 任务队列 + 短剧制作
export type AppView = 'projects' | 'overview' | 'editor' | 'tasks' | 'novel-promotion' | 'settings';

interface SidebarProps {
  view: AppView;
  onViewChange: (view: AppView) => void;
}

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
      {active && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-emerald-500 rounded-r-md"
          style={{ boxShadow: '0 0 12px rgba(16,185,129,0.5)' }}
        />
      )}
      <div
        className={`p-2.5 rounded-xl transition-all ${
          active ? 'bg-emerald-400/10' : 'hover:bg-zinc-800'
        }`}
      >
        {icon}
      </div>
    </button>
  </Tooltip>
);

export const Sidebar: React.FC<SidebarProps> = ({ view, onViewChange }) => {
  const navItems = [
    { key: 'projects' as const, icon: <LayoutGrid size={22} />, label: '项目总览' },
    { key: 'editor' as const, icon: <Scissors size={22} />, label: '创作工作台' },
    { key: 'novel-promotion' as const, icon: <Film size={22} />, label: '短剧制作' },
    { key: 'tasks' as const, icon: <ListTodo size={22} />, label: '任务队列' },
    { key: 'settings' as const, icon: <Settings size={22} />, label: '系统设置' },
  ];

  const isProjectsActive = view === 'projects' || view === 'overview';

  return (
    <div className="w-[var(--sidebar-width)] bg-zinc-950 border-r border-zinc-800 flex flex-col h-full z-40 shrink-0">
      <nav className="flex-1 flex flex-col py-2">
        <div className="space-y-1">
          {navItems.map((item) => {
            const active =
              item.key === 'projects'
                ? isProjectsActive
                : view === item.key;

            return (
              <NavItem
                key={item.key}
                active={active}
                icon={item.icon}
                label={item.label}
                onClick={() => onViewChange(item.key)}
              />
            );
          })}
        </div>

        <div className="flex-1" />
      </nav>

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
