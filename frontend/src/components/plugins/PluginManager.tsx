/**
 * 插件管理页面
 */
import React, { useState } from 'react';
import { Tabs, Empty, Input, Select, Modal, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { InstalledPlugin, PluginCategory } from '../../types/plugin';
import { usePluginStore } from '../../store/pluginStore';
import { PluginCard } from './PluginCard';
import { PluginImporter } from './PluginImporter';
import { unloadPlugin } from '../../services/plugin/PluginLoader';
import { cleanupPluginResources } from '../../services/plugin/PluginAPI';
import { electronService } from '../../services/electronService';

export const PluginManager: React.FC = () => {
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
  const handleToggle = (id: string, enabled: boolean) => {
    togglePlugin(id, enabled);
    if (!enabled) {
      unloadPlugin(id);
    }
    message.success(enabled ? '插件已启用' : '插件已禁用');
  };

  // 卸载插件
  const handleRemove = (id: string) => {
    const plugin = plugins.find(p => p.id === id);
    if (!plugin) return;

    Modal.confirm({
      title: '确认卸载',
      content: `确定要卸载插件 "${plugin.name}" 吗？这将删除插件文件。`,
      okText: '卸载',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          // 清理运行时资源
          unloadPlugin(id);
          cleanupPluginResources(id);

          // 删除插件文件
          await electronService.ipc.invoke('plugin:uninstall', plugin.rootPath);

          // 从 store 移除
          unregisterPlugin(id);

          message.success('插件已卸载');
        } catch (err: any) {
          message.error(`卸载失败: ${err.message}`);
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
          placeholder="搜索插件..."
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
            { value: 'all', label: '全部类型' },
            { value: 'global', label: '全局插件' },
            { value: 'provider', label: '服务提供' },
            { value: 'tool', label: '工具' },
          ]}
        />
      </div>

      {/* 插件列表 */}
      {filteredPlugins.length === 0 ? (
        <Empty
          description={searchText ? '未找到匹配的插件' : '暂无已安装的插件'}
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
        <h4 className="font-medium mb-2">插件开发说明</h4>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>• 插件包必须包含 <code>manifest.json</code> 清单文件</li>
          <li>• 全局插件需要导出 React 组件作为 default</li>
          <li>• 开发模式可直接从文件夹导入，方便调试</li>
          <li>• 查看文档了解 manifest 规范和 API 接口</li>
        </ul>
      </div>
    </div>
  );

  const tabItems = [
    { key: 'installed', label: '已安装', children: installedContent },
    { key: 'import', label: '导入插件', children: importContent },
  ];

  return (
    <div className="plugin-manager p-6 h-full overflow-auto">
      <h2 className="text-xl font-semibold mb-4">插件管理</h2>
      <Tabs defaultActiveKey="installed" items={tabItems} />
    </div>
  );
};

export default PluginManager;
