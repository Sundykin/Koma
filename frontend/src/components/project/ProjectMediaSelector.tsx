/**
 * 项目级媒体配置选择器
 * 允许在项目设置中选择使用哪个 TTI/ITV/TTS/LLM 配置
 */
import React, { useState, useEffect } from 'react';
import { Select, Space, Tag, Tooltip, Button } from 'antd';
import {
  PictureOutlined,
  VideoCameraOutlined,
  SoundOutlined,
  ExperimentOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type {
  LLMModelConfig,
  TTIModelConfig,
  ITVModelConfig,
  TTSModelConfig,
} from '../../types';
import { loadSettings } from '../../store/globalStore';

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
  const [ttiConfigs, setTTIConfigs] = useState<TTIModelConfig[]>([]);
  const [itvConfigs, setITVConfigs] = useState<ITVModelConfig[]>([]);
  const [ttsConfigs, setTTSConfigs] = useState<TTSModelConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const settings = await loadSettings();
      setLLMConfigs(settings.llmConfigs || []);
      setTTIConfigs(settings.ttiConfigs || []);
      setITVConfigs(settings.itvConfigs || []);
      setTTSConfigs(settings.ttsConfigs || []);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultLabel = (configs: { isDefault?: boolean; name: string }[]) => {
    const defaultConfig = configs.find(c => c.isDefault);
    return defaultConfig ? `使用全局默认 (${defaultConfig.name})` : '使用全局默认';
  };

  const renderConfigOption = (config: { id: string; name: string; isDefault?: boolean }) => (
    <Select.Option key={config.id} value={config.id}>
      <Space>
        {config.name}
        {config.isDefault && <Tag color="gold" style={{ marginLeft: 4 }}>默认</Tag>}
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
          {llmConfigs.map(renderConfigOption)}
        </Select>
      </div>

      {/* TTI 配置选择 */}
      <div>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <PictureOutlined />
          <span style={{ fontWeight: 500 }}>文生图 (TTI)</span>
          {ttiConfigs.length === 0 && (
            <Tag color="orange">未配置</Tag>
          )}
        </div>
        <Select
          value={ttiConfigId || undefined}
          onChange={(value) => onChange({ llmConfigId, ttiConfigId: value, itvConfigId, ttsConfigId })}
          placeholder={getDefaultLabel(ttiConfigs)}
          allowClear
          style={{ width: '100%' }}
          loading={loading}
          disabled={ttiConfigs.length === 0}
        >
          {ttiConfigs.map(renderConfigOption)}
        </Select>
      </div>

      {/* ITV 配置选择 */}
      <div>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <VideoCameraOutlined />
          <span style={{ fontWeight: 500 }}>图生视频 (ITV)</span>
          {itvConfigs.length === 0 && (
            <Tag color="orange">未配置</Tag>
          )}
        </div>
        <Select
          value={itvConfigId || undefined}
          onChange={(value) => onChange({ llmConfigId, ttiConfigId, itvConfigId: value, ttsConfigId })}
          placeholder={getDefaultLabel(itvConfigs)}
          allowClear
          style={{ width: '100%' }}
          loading={loading}
          disabled={itvConfigs.length === 0}
        >
          {itvConfigs.map(renderConfigOption)}
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
          {ttsConfigs.map(renderConfigOption)}
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
