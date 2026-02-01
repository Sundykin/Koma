/**
 * SCDN Image Hosting Provider 插件
 * 图床服务配置面板
 */

import type { PluginAPI } from '@komastudio/plugin-sdk';

const React = window.React;
const { useState, useEffect, useCallback } = React;
const {
  Card, Button, Form, Input, Select, Switch, Space, Typography,
  Divider, Tag, Spin, Alert, Row, Col, Statistic,
} = window.antd;
const Icons = window['@ant-design/icons'] || {};
const {
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  CloudUploadOutlined, SettingOutlined,
  SaveOutlined, ReloadOutlined,
} = Icons;

const { Title, Text, Paragraph } = Typography;

// ========== 类型定义 ==========

interface SCDNConfig {
  enabled: boolean;
  apiEndpoint: string;
  outputFormat: 'auto' | 'jpeg' | 'png' | 'webp' | 'gif' | 'webp_animated';
  cdnDomain: string;
}

// ========== 常量 ==========

const DEFAULT_CONFIG: SCDNConfig = {
  enabled: false,
  apiEndpoint: 'https://img.scdn.io/api/v1.php',
  outputFormat: 'webp',
  cdnDomain: '',
};

const OUTPUT_FORMAT_OPTIONS = [
  { value: 'auto', label: '自动 (auto)' },
  { value: 'webp', label: 'WebP (推荐)' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'gif', label: 'GIF 动图' },
  { value: 'webp_animated', label: 'WebP 动图' },
];

const CDN_DOMAIN_OPTIONS = [
  { value: '', label: '默认 (自动选择)' },
  { value: 'img.scdn.io', label: '失控的防御系统' },
  { value: 'cloudflareimg.cdn.sn', label: 'CloudFlare' },
  { value: 'edgeoneimg.cdn.sn', label: 'EdgeOne' },
  { value: 'esaimg.cdn1.vip', label: 'ESA' },
];

// ========== UI 组件 ==========

interface SCDNProviderProps {
  api: PluginAPI;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

function SCDNProvider({ api }: SCDNProviderProps) {
  const [form] = Form.useForm();
  const [config, setConfig] = useState<SCDNConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionError, setConnectionError] = useState<string>('');

  useEffect(() => {
    async function loadConfig() {
      try {
        const providerConfig = await api.channels.getProviderConfig('scdn-image-hosting');
        if (providerConfig && Object.keys(providerConfig).length > 0) {
          const merged = { ...DEFAULT_CONFIG, ...providerConfig };
          setConfig(merged);
          form.setFieldsValue(merged);

          if (merged.enabled) {
            setConnectionStatus('success');
          }
        }
      } catch (err) {
        console.log('[SCDN] 首次使用，无保存配置');
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, [api, form]);

  const testConnection = useCallback(async (cfg?: SCDNConfig) => {
    const testConfig = cfg || config;
    if (!testConfig.enabled) {
      api.ui.showMessage('warning', '请先启用图床服务');
      return;
    }

    setConnectionStatus('testing');
    setConnectionError('');

    const result = await api.channels.testProvider('image-hosting', 'scdn-image-hosting', testConfig);

    if (result.success) {
      setConnectionStatus('success');
      api.ui.showMessage('success', '连接成功');
    } else {
      setConnectionStatus('error');
      setConnectionError(result.error || '连接失败');
    }
  }, [config, api]);

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      await api.channels.updateProviderConfig('scdn-image-hosting', values);
      setConfig(values);

      if (values.enabled) {
        await testConnection(values);
      } else {
        setConnectionStatus('idle');
      }

      api.ui.showMessage('success', '配置已保存');
    } catch (err: any) {
      api.ui.showMessage('error', `保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [form, api, testConnection]);

  const handleReset = useCallback(() => {
    form.setFieldsValue(DEFAULT_CONFIG);
    setConfig(DEFAULT_CONFIG);
    setConnectionStatus('idle');
    setConnectionError('');
  }, [form]);

  if (loading) {
    return React.createElement('div', {
      style: { padding: 48, textAlign: 'center' },
    }, React.createElement(Spin, { size: 'large', tip: '加载配置中...' }));
  }

  const StatusIcon = () => {
    if (connectionStatus === 'testing') {
      return React.createElement(LoadingOutlined, { style: { color: '#1890ff' } });
    }
    if (connectionStatus === 'success') {
      return React.createElement(CheckCircleOutlined, { style: { color: '#52c41a' } });
    }
    if (connectionStatus === 'error') {
      return React.createElement(CloseCircleOutlined, { style: { color: '#ff4d4f' } });
    }
    return React.createElement(CloudUploadOutlined, { style: { color: '#999' } });
  };

  return React.createElement('div', { style: { padding: 24, maxWidth: 800 } },
    React.createElement(Title, { level: 3 },
      React.createElement(CloudUploadOutlined, { style: { marginRight: 8 } }),
      'SCDN 图床服务'
    ),
    React.createElement(Paragraph, { type: 'secondary' },
      '启用后，手动上传的角色定妆照、场景图、道具图将自动上传到图床，获取远程 URL 供 AI 生成使用。'
    ),

    React.createElement(Divider),

    React.createElement(Card, { size: 'small', style: { marginBottom: 16 } },
      React.createElement(Row, { gutter: 16 },
        React.createElement(Col, { span: 8 },
          React.createElement(Statistic, {
            title: '服务状态',
            value: connectionStatus === 'success' ? '已启用' :
                   connectionStatus === 'error' ? '连接失败' :
                   connectionStatus === 'testing' ? '测试中...' : '未启用',
            prefix: React.createElement(StatusIcon),
          })
        ),
        React.createElement(Col, { span: 8 },
          React.createElement(Statistic, { title: '支持能力', value: '1', suffix: '项' })
        ),
        React.createElement(Col, { span: 8 },
          React.createElement(Space, { direction: 'vertical', size: 0 },
            React.createElement(Text, { type: 'secondary', style: { fontSize: 12 } }, '能力列表'),
            React.createElement('div', { style: { marginTop: 4 } },
              React.createElement(Tag, { color: 'green' }, '图片上传')
            )
          )
        )
      )
    ),

    connectionError && React.createElement(Alert, {
      type: 'error',
      message: '连接失败',
      description: connectionError,
      style: { marginBottom: 16 },
      showIcon: true,
    }),

    React.createElement(Card, {
      title: React.createElement(Space, null,
        React.createElement(SettingOutlined),
        '服务配置'
      ),
    },
      React.createElement(Form, { form, layout: 'vertical', initialValues: config },
        React.createElement(Form.Item, {
          name: 'enabled',
          label: '启用图床',
          valuePropName: 'checked',
          extra: '启用后，手动上传的资产图片将自动上传到图床',
        },
          React.createElement(Switch, { checkedChildren: '已启用', unCheckedChildren: '已禁用' })
        ),

        React.createElement(Form.Item, {
          name: 'apiEndpoint',
          label: 'API 端点',
          rules: [{ required: true, message: '请输入 API 端点' }],
        },
          React.createElement(Input, { placeholder: 'https://img.scdn.io/api/v1.php' })
        ),

        React.createElement(Divider, { orientation: 'left' }, '输出设置'),

        React.createElement(Form.Item, {
          name: 'outputFormat',
          label: '输出格式',
          extra: '推荐使用 WebP 格式，压缩率高且兼容性好',
        },
          React.createElement(Select, {
            options: OUTPUT_FORMAT_OPTIONS,
            style: { width: '100%' },
          })
        ),

        React.createElement(Form.Item, {
          name: 'cdnDomain',
          label: 'CDN 域名',
          extra: '选择图片外链使用的 CDN 域名，默认自动选择',
        },
          React.createElement(Select, {
            options: CDN_DOMAIN_OPTIONS,
            style: { width: '100%' },
          })
        ),

        React.createElement(Divider),

        React.createElement(Space, null,
          React.createElement(Button, {
            type: 'primary',
            icon: SaveOutlined && React.createElement(SaveOutlined),
            onClick: handleSave,
            loading: saving,
          }, '保存配置'),
          React.createElement(Button, {
            icon: CloudUploadOutlined && React.createElement(CloudUploadOutlined),
            onClick: () => testConnection(),
            loading: connectionStatus === 'testing',
          }, '测试连接'),
          React.createElement(Button, {
            icon: ReloadOutlined && React.createElement(ReloadOutlined),
            onClick: handleReset,
          }, '重置')
        )
      )
    ),

    React.createElement(Divider),

    React.createElement(Alert, {
      type: 'info',
      message: '使用说明',
      description: React.createElement('ul', { style: { margin: 0, paddingLeft: 20 } },
        React.createElement('li', null, '启用图床后，在资产管理中手动上传图片时会自动上传到图床'),
        React.createElement('li', null, '上传失败会自动重试 3 次'),
        React.createElement('li', null, '远程 URL 会保存到资产的 xxxUrl 字段，供 AI 生成使用'),
        React.createElement('li', null, '图床 API 无需认证，免费使用')
      ),
      showIcon: true,
    })
  );
}

// ========== 生命周期 ==========

async function onActivate(api: PluginAPI) {
  console.log('[SCDN] 插件已激活');

  const providerDef = {
    type: 'scdn-image-hosting',
    kind: 'image-hosting',
    name: 'SCDN 图床',
    description: 'SCDN 图床服务，支持图片上传并获取远程 URL',
    capabilities: ['image-hosting'],
    defaultConfig: DEFAULT_CONFIG,
  };

  await api.channels.registerProvider(providerDef as any);
  console.log('[SCDN] Provider 已注册');
}

function onDeactivate() {
  console.log('[SCDN] 插件已停用');
}

export default SCDNProvider;
export { onActivate, onDeactivate };

(window as any).__KOMA_PLUGIN_com_koma_scdn_image_hosting__ = {
  default: SCDNProvider,
  onActivate,
  onDeactivate,
};
