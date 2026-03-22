/**
 * 共享的媒体配置管理 hook
 * 用于 ITVConfigManager 和 TTIConfigManager 中的通用逻辑
 */
import { useState, useEffect, useCallback } from 'react';
import { Form } from 'antd';
import type { ChannelConfig } from '../../providers/channel/types';
import {
  loadSettings,
  setDefaultChannelConfig,
} from '../../store/globalStore';
import { getChannelConfigs, updateChannelConfig } from '../../store/settings/channelConfig';

type MediaCapability = 'tti' | 'itv';

interface ConfigActions<TConfig extends { id: string; isDefault?: boolean }> {
  /** 从 settings 中提取该类型的配置列表 */
  getConfigs: (settings: any) => TConfig[];
  /** 更新配置 */
  updateConfig: (id: string, data: Partial<TConfig>) => Promise<any>;
  /** 设置默认内置配置 */
  setDefaultConfig: (id: string) => Promise<any>;
  /** 媒体能力标识 */
  capability: MediaCapability;
}

export function useMediaConfigManager<TConfig extends { id: string; isDefault?: boolean }>(
  actions: ConfigActions<TConfig>,
  onConfigChange?: () => void,
) {
  const [configs, setConfigs] = useState<TConfig[]>([]);
  const [pluginChannels, setPluginChannels] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<TConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  // 插件配置弹窗状态
  const [pluginModalVisible, setPluginModalVisible] = useState(false);
  const [activePluginId, setActivePluginId] = useState<string>('');

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await loadSettings();
      setConfigs(actions.getConfigs(settings));
      const channels = await getChannelConfigs();
      const filtered = channels.filter(c =>
        c.source === 'plugin' &&
        c.enabled &&
        c.capabilities.includes(actions.capability)
      );
      setPluginChannels(filtered);
    } finally {
      setLoading(false);
    }
  }, [actions]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const openPluginModal = useCallback((pluginId: string) => {
    setActivePluginId(pluginId);
    setPluginModalVisible(true);
  }, []);

  const closePluginModal = useCallback(() => {
    setPluginModalVisible(false);
    setActivePluginId('');
  }, []);

  const handlePluginConfigSaved = useCallback(async () => {
    await loadConfigs();
    onConfigChange?.();
  }, [loadConfigs, onConfigChange]);

  /** 设置内置配置为默认（同时清除插件渠道的默认状态） */
  const handleSetDefault = useCallback(async (id: string, messageApi: any, t: any) => {
    try {
      for (const channel of pluginChannels) {
        if (channel.isDefault) {
          await updateChannelConfig(channel.id, { isDefault: false });
        }
      }
      await actions.setDefaultConfig(id);
      messageApi.success(t('settings.defaultSet'));
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      messageApi.error(`${t('common.error')}: ${err.message}`);
    }
  }, [pluginChannels, actions, loadConfigs, onConfigChange]);

  /** 设置插件渠道为默认（同时清除内置配置的默认状态） */
  const handleSetChannelDefault = useCallback(async (id: string, messageApi: any, t: any) => {
    try {
      for (const config of configs) {
        if (config.isDefault) {
          await actions.updateConfig(config.id, { isDefault: false } as Partial<TConfig>);
        }
      }
      await setDefaultChannelConfig(id, actions.capability);
      messageApi.success(t('settings.defaultSet'));
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      messageApi.error(`${t('common.error')}: ${err.message}`);
    }
  }, [configs, actions, loadConfigs, onConfigChange]);

  return {
    configs,
    pluginChannels,
    loading,
    modalVisible,
    setModalVisible,
    editingConfig,
    setEditingConfig,
    testingId,
    setTestingId,
    form,
    pluginModalVisible,
    activePluginId,
    loadConfigs,
    openPluginModal,
    closePluginModal,
    handlePluginConfigSaved,
    handleSetDefault,
    handleSetChannelDefault,
  };
}
