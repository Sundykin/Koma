/**
 * 项目级媒体配置选择器
 * 允许在项目设置中选择使用哪个 TTI/ITV/TTS/LLM 配置
 * 支持内置配置和插件渠道
 */
import React, { useState, useEffect } from 'react';
import { Select, Space, Tag, Tooltip, Button } from 'antd';
import {
  PictureOutlined,
  VideoCameraOutlined,
  SoundOutlined,
  ExperimentOutlined,
  SettingOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type {
  LLMModelConfig,
  TTIModelConfig,
  ITVModelConfig,
  TTSModelConfig,
} from '../../types';
import type { ChannelConfig } from '../../providers/channel/types';
import { loadSettings, getChannelConfigs } from '../../store/globalStore';

// 统一的配置项接口
interface UnifiedConfigOption {
  id: string;
  name: string;
  isDefault?: boolean;
  source: 'builtin' | 'plugin';
  providerType?: string;
}

interface ProjectMediaSelectorProps {
  llmConfigId?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  ttsConfigId?: string;
  onChange: (configs: {
    llmConfigId?: string;
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  }) => void;
  onGoToSettings?: () => void;
}

export const ProjectMediaSelector: React.FC<ProjectMediaSelectorProps> = ({
  llmConfigId,
  ttiConfigId,
  itvConfigId,
  ttsConfigId,
  onChange,
  onGoToSettings,
}) => {
  const [llmConfigs, setLLMConfigs] = useState<LLMModelConfig[]>([]);
  const [ttiOptions, setTTIOptions] = useState<UnifiedConfigOption[]>([]);
  const [itvOptions, setITVOptions] = useState<UnifiedConfigOption[]>([]);
  const [ttsConfigs, setTTSConfigs] = useState<TTSModelConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const settings = await loadSettings();
      const channelConfigs = await getChannelConfigs();

      setLLMConfigs(settings.llmConfigs || []);
      setTTSConfigs(settings.ttsConfigs || []);

      // 合并内置 TTI 配置和插件渠道
      const builtinTTI: UnifiedConfigOption[] = (settings.ttiConfigs || []).map(c => ({
        id: c.id,
        name: c.name,
        isDefault: c.isDefault,
        source: 'builtin' as const,
        providerType: c.provider,
      }));
      const pluginTTI: UnifiedConfigOption[] = channelConfigs
        .filter(c => c.source === 'plugin' && c.enabled && c.capabilities.includes('tti'))
        .map(c => ({
          id: c.id,
          name: c.name,
          isDefault: c.isDefault,
          source: 'plugin' as const,
          providerType: c.providerType,
        }));
      setTTIOptions([...builtinTTI, ...pluginTTI]);

      // 合并内置 ITV 配置和插件渠道
      const builtinITV: UnifiedConfigOption[] = (settings.itvConfigs || []).map(c => ({
        id: c.id,
        name: c.name,
        isDefault: c.isDefault,
        source: 'builtin' as const,
        providerType: c.provider,
      }));
      const pluginITV: UnifiedConfigOption[] = channelConfigs
        .filter(c => c.source === 'plugin' && c.enabled && c.capabilities.includes('itv'))
        .map(c => ({
          id: c.id,
          name: c.name,
          isDefault: c.isDefault,
          source: 'plugin' as const,
          providerType: c.providerType,
        }));
      setITVOptions([...builtinITV, ...pluginITV]);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultLabel = (configs: { isDefault?: boolean; name: string }[]) => {
    const defaultConfig = configs.find(c => c.isDefault);
    return defaultConfig ? `使用全局默认 (${defaultConfig.name})` : '使用全局默认';
  };

  const renderLLMOption = (config: LLMModelConfig) => (
    <Select.Option key={config.id} value={config.id}>
      <Space>
        {config.name}
        {config.isDefault && <Tag color="gold" style={{ marginLeft: 4 }}>默认</Tag>}
      </Space>
    </Select.Option>
  );

  const renderTTSOption = (config: TTSModelConfig) => (
    <Select.Option key={config.id} value={config.id}>
      <Space>
        {config.name}
        {config.isDefault && <Tag color="gold" style={{ marginLeft: 4 }}>默认</Tag>}
      </Space>
    </Select.Option>
  );

  const renderUnifiedOption = (option: UnifiedConfigOption) => (
    <Select.Option key={option.id} value={option.id}>
      <Space>
        {option.source === 'plugin' && <AppstoreOutlined style={{ color: '#1890ff' }} />}
        {option.name}
        {option.source === 'plugin' && <Tag color="blue" style={{ marginLeft: 4 }}>插件</Tag>}
        {option.isDefault && <Tag color="gold" style={{ marginLeft: 4 }}>默认</Tag>}
      </Space>
    </Select.Option>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* LLM 配置选择 */}
      <div>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ExperimentOutlined />
          <span style={{ fontWeight: 500 }}>LLM 大模型</span>
          {llmConfigs.length === 0 && (
            <Tag color="orange">未配置</Tag>
          )}
        </div>
        <Select
          value={llmConfigId || undefined}
          onChange={(value) => onChange({ llmConfigId: value, ttiConfigId, itvConfigId, ttsConfigId })}
          placeholder={getDefaultLabel(llmConfigs)}
          allowClear
          style={{ width: '100%' }}
          loading={loading}
          disabled={llmConfigs.length === 0}
        >
          {llmConfigs.map(renderLLMOption)}
        </Select>
      </div>

      {/* TTI 配置选择（包含插件渠道） */}
      <div>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <PictureOutlined />
          <span style={{ fontWeight: 500 }}>文生图 (TTI)</span>
          {ttiOptions.length === 0 && (
            <Tag color="orange">未配置</Tag>
          )}
        </div>
        <Select
          value={ttiConfigId || undefined}
          onChange={(value) => onChange({ llmConfigId, ttiConfigId: value, itvConfigId, ttsConfigId })}
          placeholder={getDefaultLabel(ttiOptions)}
          allowClear
          style={{ width: '100%' }}
          loading={loading}
          disabled={ttiOptions.length === 0}
        >
          {ttiOptions.map(renderUnifiedOption)}
        </Select>
      </div>

      {/* ITV 配置选择（包含插件渠道） */}
      <div>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <VideoCameraOutlined />
          <span style={{ fontWeight: 500 }}>图生视频 (ITV)</span>
          {itvOptions.length === 0 && (
            <Tag color="orange">未配置</Tag>
          )}
        </div>
        <Select
          value={itvConfigId || undefined}
          onChange={(value) => onChange({ llmConfigId, ttiConfigId, itvConfigId: value, ttsConfigId })}
          placeholder={getDefaultLabel(itvOptions)}
          allowClear
          style={{ width: '100%' }}
          loading={loading}
          disabled={itvOptions.length === 0}
        >
          {itvOptions.map(renderUnifiedOption)}
        </Select>
      </div>

      {/* TTS 配置选择 */}
      <div>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <SoundOutlined />
          <span style={{ fontWeight: 500 }}>语音合成 (TTS)</span>
          {ttsConfigs.length === 0 && (
            <Tag color="orange">未配置</Tag>
          )}
        </div>
        <Select
          value={ttsConfigId || undefined}
          onChange={(value) => onChange({ llmConfigId, ttiConfigId, itvConfigId, ttsConfigId: value })}
          placeholder={getDefaultLabel(ttsConfigs)}
          allowClear
          style={{ width: '100%' }}
          loading={loading}
          disabled={ttsConfigs.length === 0}
        >
          {ttsConfigs.map(renderTTSOption)}
        </Select>
      </div>

      {/* 前往设置 */}
      {onGoToSettings && (
        <div style={{ marginTop: 8 }}>
          <Tooltip title="在全局设置中管理所有媒体配置">
            <Button
              type="link"
              icon={<SettingOutlined />}
              onClick={onGoToSettings}
              style={{ padding: 0 }}
            >
              前往全局设置
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  );
};
