/**
 * 插件权限确认弹窗
 */
import React from 'react';
import { Modal, List, Tag, Space, Typography } from 'antd';
import {
  SafetyOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { PluginManifest, PluginScope } from '../../types/plugin';
import { SCOPE_DESCRIPTIONS } from '../../services/plugin/PluginSandbox';

const { Text } = Typography;

interface PluginPermissionsProps {
  visible: boolean;
  manifest: PluginManifest;
  onConfirm: () => void;
  onCancel: () => void;
}

const levelIcons = {
  safe: <SafetyOutlined style={{ color: '#52c41a' }} />,
  warning: <WarningOutlined style={{ color: '#faad14' }} />,
  danger: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
};

const levelColors = {
  safe: 'success',
  warning: 'warning',
  danger: 'error',
} as const;

export const PluginPermissions: React.FC<PluginPermissionsProps> = ({
  visible,
  manifest,
  onConfirm,
  onCancel,
}) => {
  const hasDangerScope = manifest.scopes.some(
    scope => SCOPE_DESCRIPTIONS[scope as PluginScope]?.level === 'danger'
  );

  return (
    <Modal
      title={
        <Space>
          <span>安装插件</span>
          <Tag color="blue">{manifest.name}</Tag>
        </Space>
      }
      open={visible}
      onOk={onConfirm}
      onCancel={onCancel}
      okText={hasDangerScope ? '我了解风险，继续安装' : '安装'}
      okButtonProps={{ danger: hasDangerScope }}
      cancelText="取消"
      width={500}
    >
      <div className="mb-4">
        <Text type="secondary">
          版本: {manifest.version}
          {manifest.author && ` · 作者: ${manifest.author.name}`}
        </Text>
      </div>

      {manifest.description && (
        <div className="mb-4">
          <Text>{manifest.description}</Text>
        </div>
      )}

      <div className="mb-2">
        <Text strong>该插件请求以下权限：</Text>
      </div>

      <List
        size="small"
        bordered
        dataSource={manifest.scopes}
        renderItem={(scope) => {
          const info = SCOPE_DESCRIPTIONS[scope as PluginScope];
          if (!info) return null;

          return (
            <List.Item>
              <Space>
                {levelIcons[info.level]}
                <div>
                  <Tag color={levelColors[info.level]}>{info.label}</Tag>
                  <Text type="secondary" className="text-xs">
                    {info.description}
                  </Text>
                </div>
              </Space>
            </List.Item>
          );
        }}
      />

      {hasDangerScope && (
        <div className="mt-4 p-3 bg-red-50 rounded border border-red-200">
          <Space>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
            <Text type="danger">
              此插件请求了高风险权限，请确保您信任该插件来源
            </Text>
          </Space>
        </div>
      )}
    </Modal>
  );
};

export default PluginPermissions;
