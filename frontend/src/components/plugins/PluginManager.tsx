/**
 * 插件管理页面
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, Empty, Input, Select, Modal, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { InstalledPlugin, PluginCategory } from '../../types/plugin';
import { usePluginStore } from '../../store/pluginStore';
import { PluginCard } from './PluginCard';
import { PluginImporter } from './PluginImporter';
import { unloadPlugin } from '../../services/plugin/PluginLoader';
import { cleanupPluginResources } from '../../services/plugin/PluginAPI';
import { initializePlugin } from '../../services/plugin/PluginInitializer';
import { electronService } from '../../services/electronService';
import { toUserMessage } from '../../utils/errorMessages';

export const PluginManager: React.FC = () => {
  const { t } = useTranslation('plugin');
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PluginCategory | 'all'>('all');

  const plugins = usePluginStore(state => state.plugins);
  const togglePlugin = usePluginStore(state => state.togglePlugin);
  const unregisterPlugin = usePluginStore(state => state.unregisterPlugin);

  // 过滤插件
  const filteredPlugins = plugins.filter(p => {
    const matchSearch = !searchText ||
      p.name.toLowerCase().includes(searchText.toLowerCase()) ||
      p.id.toLowerCase().includes(searchText.toLowerCase());
    const matchCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  // 切换启用状态
  const handleToggle = async (id: string, enabled: boolean) => {
    togglePlugin(id, enabled);
    if (enabled) {
      // 启用时重新初始化插件（从 store 获取最新状态）
      const plugin = usePluginStore.getState().getPlugin(id);
      if (plugin) {
        const success = await initializePlugin(plugin);
        if (success) {
          message.success(t('manager.successEnabled'));
        } else {
          message.warning(t('manager.warnInitFailed'));
        }
      }
    } else {
      unloadPlugin(id);
      cleanupPluginResources(id);
      message.success(t('manager.successDisabled'));
    }
  };

  // 卸载插件
  const handleRemove = (id: string) => {
    const plugin = plugins.find(p => p.id === id);
    if (!plugin) return;

    Modal.confirm({
      title: t('manager.confirmUninstallTitle'),
      content: t('manager.confirmUninstallContent', { name: plugin.name }),
      okText: t('manager.uninstall'),
      okButtonProps: { danger: true },
      cancelText: t('common:cancel'),
      onOk: async () => {
        try {
          // 清理运行时资源
          unloadPlugin(id);
          cleanupPluginResources(id);

          // 删除插件文件
          await electronService.ipc.invoke('plugin:uninstall', plugin.rootPath);

          // 从 store 移除
          unregisterPlugin(id);

          message.success(t('manager.successUninstalled'));
        } catch (err: any) {
          message.error(t('manager.errorUninstall', { error: toUserMessage(err) }));
        }
      },
    });
  };

  // 打开插件目录
  const handleOpenFolder = async (id: string) => {
    const plugin = plugins.find(p => p.id === id);
    if (plugin) {
      await electronService.shell.openPath(plugin.rootPath);
    }
  };

  // 导入成功回调
  const handleImportSuccess = (pluginId: string) => {
    // 可以在这里做一些导入后的处理
    console.log('[PluginManager] 插件导入成功:', pluginId);
  };

  // 已安装插件列表内容
  const installedContent = (
    <>
      {/* 搜索和筛选 */}
      <div className="mb-4 flex gap-3">
        <Input
          placeholder={t('manager.searchPlaceholder')}
          prefix={<SearchOutlined className="text-gray-400" />}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ width: 240 }}
          allowClear
        />
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          style={{ width: 140 }}
          options={[
            { value: 'all', label: t('manager.filterAll') },
            { value: 'global', label: t('manager.filterGlobal') },
            { value: 'provider', label: t('manager.filterProvider') },
            { value: 'tool', label: t('manager.filterTool') },
          ]}
        />
      </div>

      {/* 插件列表 */}
      {filteredPlugins.length === 0 ? (
        <Empty
          description={searchText ? t('manager.emptyNoMatch') : t('manager.emptyNone')}
          className="my-12"
        />
      ) : (
        <div className="grid gap-3">
          {filteredPlugins.map(plugin => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onOpenFolder={handleOpenFolder}
            />
          ))}
        </div>
      )}
    </>
  );

  // 导入插件内容
  const importContent = (
    <div className="max-w-md mx-auto py-8">
      <PluginImporter onImportSuccess={handleImportSuccess} />

      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium mb-2">{t('manager.devGuideTitle')}</h4>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>• {t('manager.devGuide1')}</li>
          <li>• {t('manager.devGuide2')}</li>
          <li>• {t('manager.devGuide3')}</li>
          <li>• {t('manager.devGuide4')}</li>
        </ul>
      </div>
    </div>
  );

  const tabItems = [
    { key: 'installed', label: t('manager.tabInstalled'), children: installedContent },
    { key: 'import', label: t('manager.tabImport'), children: importContent },
  ];

  return (
    <div className="plugin-manager p-6 h-full overflow-auto">
      <h2 className="text-xl font-semibold mb-4">{t('manager.title')}</h2>
      <Tabs defaultActiveKey="installed" items={tabItems} />
    </div>
  );
};

export default PluginManager;
