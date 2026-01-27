/**
 * Seedream TTI Provider 插件
 * 豆包 Seedream 4.0 文生图/图生图服务
 * API: doubao-seedream-4-0-250828
 */

import type { PluginAPI, ProviderDefinition, ProviderContext } from '@komastudio/plugin-sdk';
import '@komastudio/plugin-sdk';

const React = window.React;
const { useState, useEffect, useCallback } = React;
const {
  Card, Button, Form, Input, Select, Switch, Space, Typography,
  Divider, Tag, Spin, Alert, Row, Col, Statistic, InputNumber,
} = window.antd;
const Icons = window['@ant-design/icons'] || {};
const {
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  ApiOutlined, PictureOutlined, SettingOutlined,
  SaveOutlined, ReloadOutlined,
} = Icons;

const { Title, Text, Paragraph } = Typography;

// ========== 类型定义 ==========

interface SeedreamConfig {
  apiKey: string;
  baseUrl: string;
  sizeMode: 'preset' | 'custom';
  sizePreset: string;
  customWidth: number;
  customHeight: number;
  watermark: boolean;
}

interface SeedreamOptions {
  width?: number;
  height?: number;
  imageUrls?: string[];
  imageSize?: string;
}

interface ImageResult {
  path: string;
  width: number;
  height: number;
  seed?: number;
}

// ========== 常量 ==========

const MODEL_ID = 'doubao-seedream-4-0-250828';

const DEFAULT_CONFIG: SeedreamConfig = {
  apiKey: '',
  baseUrl: 'https://api.vectorengine.ai',
  sizeMode: 'preset',
  sizePreset: '2K',
  customWidth: 2048,
  customHeight: 2048,
  watermark: true,
};

const SIZE_PRESETS = [
  { value: '1K', label: '1K 标准 (1024×1024)', width: 1024, height: 1024 },
  { value: '2K', label: '2K 高清 (2048×2048)', width: 2048, height: 2048 },
  { value: '4K', label: '4K 超清 (4096×4096)', width: 4096, height: 4096 },
  { value: 'custom', label: '自定义尺寸...' },
];

const MIN_DIMENSION = 1024;
const MAX_DIMENSION = 4096;
const MIN_ASPECT_RATIO = 1 / 16;
const MAX_ASPECT_RATIO = 16;

// ========== 工具函数 ==========

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function normalizeApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return trimmed;
  }
  return trimmed;
}

function getAuthorizationHeader(apiKey: string): string {
  const normalized = normalizeApiKey(apiKey);
  if (!normalized) return '';
  if (normalized.toLowerCase().startsWith('bearer ')) {
    return normalized;
  }
  return `Bearer ${normalized}`;
}

function normalizeDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { width: 2048, height: 2048 };
  }
  const safeWidth = Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(width)));
  const safeHeight = Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(height)));
  const ratio = safeWidth / safeHeight;
  if (ratio < MIN_ASPECT_RATIO || ratio > MAX_ASPECT_RATIO) {
    return { width: 2048, height: 2048 };
  }
  return { width: safeWidth, height: safeHeight };
}

function resolveSize(config: SeedreamConfig, options?: SeedreamOptions): { size: string; width: number; height: number } {
  if (options?.width && options?.height) {
    const normalized = normalizeDimensions(options.width, options.height);
    return {
      size: `${normalized.width}x${normalized.height}`,
      width: normalized.width,
      height: normalized.height,
    };
  }
  if (options?.imageSize) {
    const preset = SIZE_PRESETS.find(p => p.value === options.imageSize);
    if (preset && preset.width) {
      return { size: options.imageSize, width: preset.width, height: preset.height! };
    }
    const match = options.imageSize.match(/^(\d+)x(\d+)$/i);
    if (match) {
      const normalized = normalizeDimensions(Number(match[1]), Number(match[2]));
      return { size: `${normalized.width}x${normalized.height}`, width: normalized.width, height: normalized.height };
    }
  }

  if (config.sizeMode === 'custom') {
    const normalized = normalizeDimensions(config.customWidth, config.customHeight);
    return {
      size: `${normalized.width}x${normalized.height}`,
      width: normalized.width,
      height: normalized.height,
    };
  }

  const preset = SIZE_PRESETS.find(p => p.value === config.sizePreset);
  if (preset && preset.width) {
    return { size: config.sizePreset, width: preset.width, height: preset.height! };
  }

  return { size: '2K', width: 2048, height: 2048 };
}

// ========== Provider 类 ==========

class SeedreamTTIProvider {
  type = 'seedream-tti';
  config: SeedreamConfig;
  ctx: ProviderContext;

  constructor(config: Record<string, any>, ctx: ProviderContext) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ctx = ctx;
  }

  private getBaseUrl(): string {
    return normalizeBaseUrl(this.config.baseUrl);
  }

  private getAuthorization(): string {
    return getAuthorizationHeader(this.config.apiKey);
  }

  validate(): boolean {
    return !!this.getAuthorization() && !!this.getBaseUrl();
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    const baseUrl = this.getBaseUrl();
    const authHeader = this.getAuthorization();

    try {
      const response = await this.ctx.sandboxedFetch(
        `${baseUrl}/v1/images/generations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            model: MODEL_ID,
            prompt: 'test connection',
            size: '1K',
            sequential_image_generation: 'disabled',
            stream: false,
            response_format: 'url',
            watermark: true,
          }),
        }
      );
      if (response.status === 401 || response.status === 403) return false;
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateImage(prompt: string, options?: SeedreamOptions): Promise<ImageResult> {
    const baseUrl = this.getBaseUrl();
    const authHeader = this.getAuthorization();

    if (!this.validate() || !authHeader || !baseUrl) {
      throw new Error('API Key 未配置');
    }

    const { size, width, height } = resolveSize(this.config, options);
    const imageInput = options?.imageUrls?.[0];

    const body: Record<string, any> = {
      model: MODEL_ID,
      prompt,
      size,
      sequential_image_generation: 'disabled',
      stream: false,
      response_format: 'url',
      watermark: this.config.watermark,
    };

    if (imageInput) {
      body.image = imageInput;
    }

    const response = await this.ctx.sandboxedFetch(
      `${baseUrl}/v1/images/generations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`图像生成失败: ${errorText}`);
    }

    const data = await response.json().catch(() => null);
    const imageUrl = data?.data?.[0]?.url;

    if (!imageUrl) {
      const apiError = data?.error?.message || data?.error || data?.message;
      if (apiError) {
        throw new Error(`图像生成失败: ${apiError}`);
      }
      throw new Error('返回数据中未找到图像 URL');
    }

    return { path: imageUrl, width, height };
  }
}

// ========== UI 组件 ==========

interface SeedreamProviderProps {
  api: PluginAPI;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

function SeedreamProvider({ api }: SeedreamProviderProps) {
  const [form] = Form.useForm();
  const [config, setConfig] = useState<SeedreamConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionError, setConnectionError] = useState<string>('');

  const sizeMode = Form.useWatch('sizeMode', form);

  useEffect(() => {
    async function loadConfig() {
      try {
        const providerConfig = await api.channels.getProviderConfig('seedream-tti');
        if (providerConfig && Object.keys(providerConfig).length > 0) {
          const merged = { ...DEFAULT_CONFIG, ...providerConfig };
          setConfig(merged);
          form.setFieldsValue(merged);

          if (merged.apiKey) {
            testConnection(merged);
          }
        }
      } catch (err) {
        console.log('[Seedream] 首次使用，无保存配置');
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, [api, form]);

  const testConnection = useCallback(async (cfg?: SeedreamConfig) => {
    const testConfig = cfg || config;
    if (!testConfig.apiKey) {
      api.ui.showMessage('warning', '请先输入 API Key');
      return;
    }

    setConnectionStatus('testing');
    setConnectionError('');

    const result = await api.channels.testProvider('tti', 'seedream-tti', testConfig);

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

      await api.channels.updateProviderConfig('seedream-tti', values);
      setConfig(values);

      await testConnection(values);
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

  const handleSizePresetChange = useCallback((value: string) => {
    if (value === 'custom') {
      form.setFieldsValue({ sizeMode: 'custom' });
    } else {
      const preset = SIZE_PRESETS.find(p => p.value === value);
      if (preset && preset.width) {
        form.setFieldsValue({
          sizeMode: 'preset',
          customWidth: preset.width,
          customHeight: preset.height,
        });
      }
    }
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
    return React.createElement(ApiOutlined, { style: { color: '#999' } });
  };

  return React.createElement('div', { style: { padding: 24, maxWidth: 800 } },
    React.createElement(Title, { level: 3 },
      React.createElement(PictureOutlined, { style: { marginRight: 8 } }),
      'Seedream 文生图服务'
    ),
    React.createElement(Paragraph, { type: 'secondary' },
      '豆包 Seedream 4.0 文生图/图生图服务，支持 1K-4K 分辨率。'
    ),

    React.createElement(Divider),

    React.createElement(Card, { size: 'small', style: { marginBottom: 16 } },
      React.createElement(Row, { gutter: 16 },
        React.createElement(Col, { span: 8 },
          React.createElement(Statistic, {
            title: '连接状态',
            value: connectionStatus === 'success' ? '已连接' :
                   connectionStatus === 'error' ? '连接失败' :
                   connectionStatus === 'testing' ? '测试中...' : '未连接',
            prefix: React.createElement(StatusIcon),
          })
        ),
        React.createElement(Col, { span: 8 },
          React.createElement(Statistic, { title: '支持能力', value: '2', suffix: '项' })
        ),
        React.createElement(Col, { span: 8 },
          React.createElement(Space, { direction: 'vertical', size: 0 },
            React.createElement(Text, { type: 'secondary', style: { fontSize: 12 } }, '能力列表'),
            React.createElement('div', { style: { marginTop: 4 } },
              React.createElement(Tag, { color: 'blue' }, '文生图'),
              React.createElement(Tag, { color: 'purple' }, '图生图')
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
          name: 'apiKey',
          label: 'API Key',
          rules: [{ required: true, message: '请输入 API Key' }],
        },
          React.createElement(Input.Password, { placeholder: 'Bearer YOUR_API_KEY', size: 'large' })
        ),

        React.createElement(Form.Item, {
          name: 'baseUrl',
          label: '服务地址',
          rules: [{ required: true, message: '请输入服务地址' }],
        },
          React.createElement(Input, { placeholder: 'https://api.vectorengine.ai' })
        ),

        React.createElement(Divider, { orientation: 'left' }, '默认参数'),

        React.createElement(Form.Item, { label: '默认尺寸' },
          React.createElement(Space, { direction: 'vertical', style: { width: '100%' } },
            React.createElement(Form.Item, { name: 'sizePreset', noStyle: true },
              React.createElement(Select, {
                style: { width: '100%' },
                options: SIZE_PRESETS.map(p => ({ value: p.value, label: p.label })),
                onChange: handleSizePresetChange,
              })
            ),
            sizeMode === 'custom' && React.createElement(Space, null,
              React.createElement(Form.Item, { name: 'customWidth', noStyle: true },
                React.createElement(InputNumber, {
                  min: 512,
                  max: 4096,
                  step: 64,
                  placeholder: '宽度',
                  addonAfter: 'px',
                })
              ),
              React.createElement(Text, { type: 'secondary' }, '×'),
              React.createElement(Form.Item, { name: 'customHeight', noStyle: true },
                React.createElement(InputNumber, {
                  min: 512,
                  max: 4096,
                  step: 64,
                  placeholder: '高度',
                  addonAfter: 'px',
                })
              )
            ),
            React.createElement(Form.Item, { name: 'sizeMode', hidden: true },
              React.createElement(Input)
            )
          )
        ),

        React.createElement(Form.Item, {
          name: 'watermark',
          label: '水印',
          valuePropName: 'checked',
          extra: '开启后生成的图片右下角会带有"AI生成"水印',
        },
          React.createElement(Switch, { checkedChildren: '开启', unCheckedChildren: '关闭' })
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
            icon: ApiOutlined && React.createElement(ApiOutlined),
            onClick: () => testConnection(),
            loading: connectionStatus === 'testing',
          }, '测试连接'),
          React.createElement(Button, {
            icon: ReloadOutlined && React.createElement(ReloadOutlined),
            onClick: handleReset,
          }, '重置')
        )
      )
    )
  );
}

// ========== 生命周期 ==========

async function onActivate(api: PluginAPI) {
  console.log('[Seedream] 插件已激活');

  const providerDef: ProviderDefinition = {
    type: 'seedream-tti',
    kind: 'tti',
    name: 'Seedream 文生图',
    description: '豆包 Seedream 4.0 文生图/图生图服务',
    factory: (config, ctx) => new SeedreamTTIProvider(config, ctx),
    capabilities: ['tti'],
    defaultConfig: DEFAULT_CONFIG,
  };

  await api.channels.registerProvider(providerDef);
  console.log('[Seedream] Provider 已注册');
}

function onDeactivate() {
  console.log('[Seedream] 插件已停用');
}

export default SeedreamProvider;
export { onActivate, onDeactivate };

(window as any).__KOMA_PLUGIN_com_koma_seedream_tti_provider__ = {
  default: SeedreamProvider,
  onActivate,
  onDeactivate,
};
