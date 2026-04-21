import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Avatar, Tooltip, Popover, Input, Button, App, Space, Tag, Spin } from 'antd';
import { UserOutlined, CheckCircleOutlined, KeyOutlined, DollarOutlined } from '@ant-design/icons';
import { LayoutGrid, Scissors, Settings, Puzzle, MessageCircle, PenTool } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Project, Episode } from '../../types';
import { usePluginStore } from '../../store/pluginStore';
import {
  testKomaApiKey,
  activateKomaOfficial,
  deactivateKomaOfficial,
  getKomaOfficialStatus,
  queryKomaQuota,
} from '../../store/settings/channelConfig';

// 视图类型：支持插件路由
export type AppView = 'projects' | 'overview' | 'editor' | 'settings' | 'plugins' | 'chat' | 'linghui' | `plugin:${string}`;

interface SidebarProps {
  view: AppView;
  activeProject: Project | null;
  activeEpisode: Episode | null;
  onViewChange: (view: AppView) => void;
  onEnterVideoTest: () => void;
  onConfigChange?: () => void;
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
      {active && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-emerald-500 rounded-r-md"
          style={{ boxShadow: '0 0 12px rgba(16,185,129,0.5)' }}
        />
      )}
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
  onConfigChange,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const plugins = usePluginStore(state => state.plugins);

  // 官方渠道状态
  const [activated, setActivated] = useState(false);
  const [storedApiKey, setStoredApiKey] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [quota, setQuota] = useState<{ balanceUSD: number; quota: number; usedQuota: number } | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  // 初始化：检查激活状态
  useEffect(() => {
    getKomaOfficialStatus().then(status => {
      setActivated(status.activated);
      setStoredApiKey(status.apiKey);
    });
  }, []);

  // 打开 Popover 时，如果已激活则查询额度
  const handlePopoverChange = useCallback((open: boolean) => {
    setPopoverOpen(open);
    if (open && activated && storedApiKey) {
      setQuotaLoading(true);
      queryKomaQuota(storedApiKey)
        .then(q => setQuota(q))
        .finally(() => setQuotaLoading(false));
    }
  }, [activated, storedApiKey]);

  // 测试并激活
  const handleActivate = useCallback(async () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    setLoading(true);
    try {
      // 先测试
      const ok = await testKomaApiKey(key);
      if (!ok) {
        message.error('API Key 验证失败，请检查后重试');
        return;
      }
      // 测试通过，激活
      const result = await activateKomaOfficial(key);
      if (result.activated.length > 0) {
        message.success(`已激活 ${result.activated.length} 个官方渠道`);
        setActivated(true);
        setStoredApiKey(key);
        setApiKeyInput('');
        onConfigChange?.();
        // 立即查额度
        queryKomaQuota(key).then(q => setQuota(q));
      }
      if (result.errors.length > 0) {
        message.warning(result.errors.join('; '));
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '激活失败');
    } finally {
      setLoading(false);
    }
  }, [apiKeyInput, message, onConfigChange]);

  // 取消激活
  const handleDeactivate = useCallback(async () => {
    setLoading(true);
    try {
      await deactivateKomaOfficial();
      setActivated(false);
      setStoredApiKey(null);
      setQuota(null);
      setPopoverOpen(false);
      onConfigChange?.();
      message.success('已取消激活官方渠道');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '取消激活失败');
    } finally {
      setLoading(false);
    }
  }, [message, onConfigChange]);

  const globalPlugins = useMemo(
    () => plugins.filter(p => p.category === 'global' && p.isEnabled),
    [plugins]
  );

  const mainNavItems = [
    { key: 'projects', icon: <LayoutGrid size={22} />, label: t('sidebar.projects') },
    { key: 'linghui', icon: <PenTool size={22} />, label: t('sidebar.linghui') },
    { key: 'chat', icon: <MessageCircle size={22} />, label: t('chat.title') },
  ];

  const toolNavItems = [
    { key: 'video-test', icon: <Scissors size={22} />, label: t('sidebar.videoTest'), isAction: true },
  ];

  const pluginNavItems = globalPlugins
    .sort((a, b) => (a.globalMeta?.navigation?.order || 50) - (b.globalMeta?.navigation?.order || 50))
    .map(plugin => ({
      key: `plugin:${plugin.id}`,
      icon: <Puzzle size={22} />,
      label: plugin.globalMeta?.navigation?.label || plugin.name,
    }));

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

  // Popover 内容：已激活显示额度，未激活显示输入框
  const popoverContent = activated ? (
    <div style={{ width: 220 }}>
      <div className="flex items-center gap-2 mb-2">
        <Tag icon={<CheckCircleOutlined />} color="success">已激活</Tag>
      </div>
      {quotaLoading ? (
        <Spin size="small" />
      ) : quota ? (
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-zinc-400">余额</span>
            <span className="text-emerald-400 font-medium">${quota.balanceUSD.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">已用</span>
            <span className="text-zinc-300">${(quota.usedQuota / 500000).toFixed(2)}</span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-500">额度查询不可用</div>
      )}
      <Button
        type="text"
        danger
        size="small"
        loading={loading}
        onClick={handleDeactivate}
        style={{ marginTop: 8, width: '100%' }}
      >
        取消激活
      </Button>
    </div>
  ) : (
    <div style={{ width: 260 }}>
      <div className="mb-2 text-sm font-medium">激活 Koma 官方渠道</div>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          prefix={<KeyOutlined />}
          placeholder="输入 API Key"
          value={apiKeyInput}
          onChange={e => setApiKeyInput(e.target.value)}
          onPressEnter={handleActivate}
          type="password"
        />
        <Button type="primary" loading={loading} onClick={handleActivate}>
          激活
        </Button>
      </Space.Compact>
      <div className="mt-2 text-xs text-zinc-500">
        一键激活 LLM、文生图、图生视频三个渠道
      </div>
    </div>
  );

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

        <div className="mx-4 my-3 border-t border-zinc-800" />

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

        <div className="flex-1" />
        <div className="mx-4 my-3 border-t border-zinc-800" />

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

      {/* 底部用户区 - 官方渠道激活入口 */}
      <div className="p-3 border-t border-zinc-800 flex items-center justify-center">
        <Popover
          open={popoverOpen}
          onOpenChange={handlePopoverChange}
          trigger="click"
          placement="rightBottom"
          content={popoverContent}
        >
          <Avatar
            size={36}
            style={{
              background: activated
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
              cursor: 'pointer',
            }}
            icon={activated ? <CheckCircleOutlined /> : <UserOutlined />}
          />
        </Popover>
      </div>
    </div>
  );
};
