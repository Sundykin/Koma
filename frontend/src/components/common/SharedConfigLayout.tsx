/**
 * SharedConfigLayout - 统一配置页面/弹窗布局
 * 确保所有设置界面样式一致
 */
import React from 'react';
import { Button, Space, Spin, Typography } from 'antd';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface SharedConfigLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  loading?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  saveText?: string;
  cancelText?: string;
  showFooter?: boolean;
  extra?: React.ReactNode;
  footerExtra?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const SharedConfigLayout: React.FC<SharedConfigLayoutProps> = ({
  title,
  description,
  children,
  loading = false,
  onSave,
  onCancel,
  saveText = '保存',
  cancelText = '取消',
  showFooter = true,
  extra,
  footerExtra,
  className,
  style,
}) => {
  return (
    <div
      className={`sharedConfigLayout ${className || ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#18181b',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexShrink: 0,
        }}
      >
        <div>
          <Title
            level={4}
            style={{
              margin: 0,
              color: '#fafafa',
              fontWeight: 600,
            }}
          >
            {title}
          </Title>
          {description && (
            <Text
              style={{
                color: '#71717a',
                fontSize: 13,
                marginTop: 4,
                display: 'block',
              }}
            >
              {description}
            </Text>
          )}
        </div>
        {extra && <div>{extra}</div>}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px',
        }}
      >
        <Spin spinning={loading}>{children}</Spin>
      </div>

      {/* Footer */}
      {showFooter && (onSave || onCancel) && (
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #27272a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#18181b',
            flexShrink: 0,
          }}
        >
          <div>{footerExtra}</div>
          <Space className="btnGroupRight">
            {onCancel && (
              <Button icon={<CloseOutlined />} onClick={onCancel}>
                {cancelText}
              </Button>
            )}
            {onSave && (
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={onSave}
                loading={loading}
              >
                {saveText}
              </Button>
            )}
          </Space>
        </div>
      )}
    </div>
  );
};

export default SharedConfigLayout;
