/**
 * Provider 插件配置弹窗
 * 用于在渠道管理页面加载和显示 provider 插件的配置 UI
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Modal, Spin, Result, Button } from 'antd';
import * as antd from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import * as antdIcons from '@ant-design/icons';
import type { InstalledPlugin, PluginExports, PluginAPI } from '../../types/plugin';
import { createPluginAPI } from '../../services/plugin/PluginAPI';
import { usePluginStore } from '../../store/pluginStore';
import { electronService } from '../../services/electronService';

// 暴露 React 和 antd 到全局，供插件使用
if (typeof window !== 'undefined') {
  (window as any).React = React;
  (window as any).antd = antd;
  (window as any)['@ant-design/icons'] = antdIcons;
}

interface ProviderPluginModalProps {
  visible: boolean;
  pluginId: string;
  onClose: () => void;
  onConfigSaved?: () => void;
}

// 加载 Provider 插件前端组件
async function loadProviderPluginComponent(plugin: InstalledPlugin): Promise<PluginExports | null> {
  if (!plugin.entry.frontend) {
    console.warn(`[ProviderPluginModal] 插件 ${plugin.id} 无前端入口`);
    return null;
  }

  // 规范化路径
  const frontendEntry = plugin.entry.frontend.replace(/^\.\//, '');
  const entryPath = `${plugin.rootPath}/${frontendEntry}`.replace(/\\/g, '/');

  // 通过 electronService 读取文件内容
  const scriptContent = await electronService.fs.readFile(entryPath);

  const globalKey = `__KOMA_PLUGIN_${plugin.id.replace(/[^a-zA-Z0-9]/g, '_')}__`;

  // 直接执行脚本内容
  try {
    // 使用 Function 构造器执行，确保在全局作用域
    const fn = new Function(scriptContent);
    fn.call(window);

    const module = (window as any)[globalKey];
    if (module) {
      return module;
    } else {
      throw new Error(`插件 ${plugin.id} 未正确导出到 window.${globalKey}`);
    }
  } catch (err: any) {
    console.error(`[ProviderPluginModal] 执行插件脚本失败:`, err);
    throw new Error(`加载插件脚本失败: ${err.message}`);
  }
}

export const ProviderPluginModal: React.FC<ProviderPluginModalProps> = ({
  visible,
  pluginId,
  onClose,
  onConfigSaved,
}) => {
  const plugin = usePluginStore(state => state.getPlugin(pluginId));

  const [Component, setComponent] = useState<React.ComponentType<{ api: PluginAPI }> | null>(null);
  const [api, setApi] = useState<PluginAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlugin = useCallback(async () => {
    if (!plugin) {
      setError('插件不存在');
      setLoading(false);
      return;
    }

    if (!plugin.entry.frontend) {
      setError('该插件没有配置界面');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const exports = await loadProviderPluginComponent(plugin);

      if (!exports || !exports.default) {
        setError('插件未导出有效组件');
        return;
      }

      // 创建 API 实例
      const pluginApi = createPluginAPI(plugin);
      setApi(pluginApi);

      // 调用 onActivate
      if (exports.onActivate) {
        await exports.onActivate(pluginApi);
      }

      setComponent(() => exports.default);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [plugin]);

  useEffect(() => {
    if (visible && pluginId) {
      loadPlugin();
    }
  }, [visible, pluginId, loadPlugin]);

  // 关闭时清理
  const handleClose = () => {
    setComponent(null);
    setApi(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      title={plugin?.name || '插件配置'}
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={720}
      destroyOnClose
      styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" tip="加载插件..." />
        </div>
      )}

      {error && (
        <Result
          status="error"
          title="加载失败"
          subTitle={error}
          extra={
            <Button icon={<ReloadOutlined />} onClick={loadPlugin}>
              重试
            </Button>
          }
        />
      )}

      {!loading && !error && Component && api && (
        <Component api={api} />
      )}
    </Modal>
  );
};

export default ProviderPluginModal;
