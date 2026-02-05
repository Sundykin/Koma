import React, { useState, useEffect } from 'react';
import { Select, Space, Tag, Typography, Alert } from 'antd';
import { RobotOutlined, StarFilled } from '@ant-design/icons';
import type { LLMModelConfig } from '../../types';
import { loadSettings } from '../../store/globalStore';

const { Text } = Typography;

interface ProjectLLMSelectorProps {
  projectId: string;
  currentConfigId?: string;
  onChange: (configId: string | null) => void;
  disabled?: boolean;
}

export const ProjectLLMSelector: React.FC<ProjectLLMSelectorProps> = ({
  projectId: _projectId,
  currentConfigId,
  onChange,
  disabled = false,
}) => {
  const [configs, setConfigs] = useState<LLMModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConfig, setSelectedConfig] = useState<LLMModelConfig | null>(null);
  const [configDeleted, setConfigDeleted] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  useEffect(() => {
    updateSelectedConfig();
  }, [currentConfigId, configs]);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const settings = await loadSettings();
      setConfigs(settings.llmConfigs || []);
    } finally {
      setLoading(false);
    }
  };

  const updateSelectedConfig = async () => {
    if (!currentConfigId) {
      // 使用默认
      const defaultConfig = configs.find(c => c.isDefault) || configs[0];
      setSelectedConfig(defaultConfig || null);
      setConfigDeleted(false);
    } else {
      const config = configs.find(c => c.id === currentConfigId);
      if (config) {
        setSelectedConfig(config);
        setConfigDeleted(false);
      } else if (configs.length > 0) {
        // 配置已被删除
        setSelectedConfig(null);
        setConfigDeleted(true);
      }
    }
  };

  const handleChange = (value: string) => {
    if (value === '__default__') {
      onChange(null);
    } else {
      onChange(value);
    }
    setConfigDeleted(false);
  };

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'gemini': return 'Gemini';
      case 'openai': return 'OpenAI';
      case 'openai-compatible': return '兼容';
      default: return provider;
    }
  };

  if (configs.length === 0 && !loading) {
    return (
      <Alert
        type="warning"
        message="未配置 LLM 模型"
        description="请先在全局设置中添加 LLM 模型配置"
        showIcon
      />
    );
  }

  return (
    <div>
      <Space orientation="vertical" style={{ width: '100%' }} size="small">
        <Select
          style={{ width: '100%' }}
          loading={loading}
          disabled={disabled || loading}
          value={currentConfigId || '__default__'}
          onChange={handleChange}
          placeholder="选择 LLM 模型"
        >
          <Select.Option value="__default__">
            <Space>
              <StarFilled style={{ color: '#faad14' }} />
              <span>使用全局默认</span>
            </Space>
          </Select.Option>
          {configs.map(config => (
            <Select.Option key={config.id} value={config.id}>
              <Space>
                <RobotOutlined />
                <span>{config.name}</span>
                <Tag color="blue" style={{ fontSize: 10 }}>{getProviderLabel(config.provider)}</Tag>
                {config.isDefault && <Tag color="gold" style={{ fontSize: 10 }}>默认</Tag>}
              </Space>
            </Select.Option>
          ))}
        </Select>

        {configDeleted && (
          <Alert
            type="error"
            message="配置已失效"
            description="项目关联的 LLM 配置已被删除，请重新选择"
            showIcon
            style={{ marginTop: 8 }}
          />
        )}

        {selectedConfig && !configDeleted && (
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            <Space split="·">
              <Text type="secondary">模型: {selectedConfig.modelName}</Text>
              {selectedConfig.baseUrl && (
                <Text type="secondary" style={{ maxWidth: 200 }} ellipsis>
                  {selectedConfig.baseUrl.replace(/https?:\/\//, '')}
                </Text>
              )}
            </Space>
          </div>
        )}
      </Space>
    </div>
  );
};
