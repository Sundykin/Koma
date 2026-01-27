/**
 * VectorEngine Provider 插件
 * 使用 @komastudio/plugin-sdk 开发
 */

import type { PluginAPI, ProviderDefinition, ProviderContext } from '@komastudio/plugin-sdk';
import '@komastudio/plugin-sdk';

const React = window.React;
const { useState, useEffect, useCallback } = React;
const {
  Card, Button, Form, Input, Select, Switch, Space, Typography,
  Divider, Tag, Spin, Alert, Row, Col, Statistic,
} = window.antd;
const Icons = window['@ant-design/icons'] || {};
const {
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  ApiOutlined, VideoCameraOutlined, SettingOutlined,
  SaveOutlined, ReloadOutlined,
} = Icons;

const { Title, Text, Paragraph } = Typography;

interface VectorEngineConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  defaultOrientation: 'portrait' | 'landscape';
  defaultSize: 'small' | 'large';
  defaultDuration: number;
  watermark: boolean;
}

const DEFAULT_CONFIG: VectorEngineConfig = {
  apiKey: '',
  baseUrl: 'https://api.vectorengine.ai',
  defaultModel: 'sora-2-all',
  defaultOrientation: 'landscape',
  defaultSize: 'small',
  defaultDuration: 10,
  watermark: true,
};

const MODEL_OPTIONS = [
  { value: 'sora-2-all', label: 'Sora 2 All (推荐)' },
  { value: 'sora-2', label: 'Sora 2' },
];

const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: '横屏 (16:9)' },
  { value: 'portrait', label: '竖屏 (9:16)' },
];

const SIZE_OPTIONS = [
  { value: 'small', label: '标准 (720p)' },
  { value: 'large', label: '高清 (1080p)' },
];

const DURATION_OPTIONS = [
  { value: 10, label: '10秒' },
  { value: 15, label: '15秒' },
  { value: 20, label: '20秒' },
];

/**
 * VectorEngine ITV Provider 类
 */
class VectorEngineITVProvider {
  type = 'vectorengine';
  config: VectorEngineConfig;
  ctx: ProviderContext;

  constructor(config: Record<string, any>, ctx: ProviderContext) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ctx = ctx;
  }

  validate(): boolean {
    return !!this.config.apiKey && !!this.config.baseUrl;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.ctx.sandboxedFetch(
        `${this.config.baseUrl}/v1/video/query?id=test`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        }
      );
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  async generateVideo(input: { imageUrl?: string; prompt: string; options?: any }): Promise<any> {
    const { prompt, imageUrl, options } = input;

    const response = await this.ctx.sandboxedFetch(
      `${this.config.baseUrl}/v1/video/create`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          images: imageUrl ? [imageUrl] : [],
          model: this.config.defaultModel,
          orientation: this.config.defaultOrientation,
          prompt,
          size: this.config.defaultSize,
          duration: options?.duration || this.config.defaultDuration,
          watermark: this.config.watermark,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`生成失败: ${response.status}`);
    }

    const data = await response.json();
    const taskId = data.id;

    const polling = this.polling;
    const startTime = Date.now();

    if (polling.initialDelay) {
      await this.delay(polling.initialDelay);
    }

    while (Date.now() - startTime < polling.maxDuration) {
      const progress = await this.checkProgress(taskId);

      if (progress.status === 'completed') {
        return { url: progress.resultUrl, taskId };
      }

      if (progress.status === 'failed') {
        throw new Error(progress.error || '生成失败');
      }

      await this.delay(polling.interval);
    }

    throw new Error('生成超时');
  }

  async checkProgress(taskId: string): Promise<any> {
    const response = await this.ctx.sandboxedFetch(
      `${this.config.baseUrl}/v1/video/query?id=${taskId}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      }
    );

    if (!response.ok) {
      return { taskId, status: 'failed', progress: 0, error: '查询失败' };
    }

    const data = await response.json();

    const statusMap: Record<string, string> = {
      'pending': 'queued',
      'queued': 'queued',
      'processing': 'processing',
      'in_progress': 'processing',
      'completed': 'completed',
      'succeeded': 'completed',
      'failed': 'failed',
      'error': 'failed',
    };

    return {
      taskId,
      status: statusMap[data.status] || 'processing',
      progress: data.detail?.pending_info?.progress_pct || 0,
      resultUrl: data.video_url,
      error: data.detail?.failure_reason,
    };
  }

  get polling() {
    return {
      interval: 5000,
      maxDuration: 600000,
      initialDelay: 3000,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========== UI 组件 ==========

interface VectorEngineProviderProps {
  api: PluginAPI;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

function VectorEngineProvider({ api }: VectorEngineProviderProps) {
  const [form] = Form.useForm();
  const [config, setConfig] = useState<VectorEngineConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionError, setConnectionError] = useState<string>('');

  useEffect(() => {
    async function loadConfig() {
      try {
        const providerConfig = await api.channels.getProviderConfig('vectorengine');
        if (providerConfig && Object.keys(providerConfig).length > 0) {
          const saved = { ...DEFAULT_CONFIG, ...providerConfig };
          setConfig(saved);
          form.setFieldsValue(saved);

          if (saved.apiKey) {
            testConnection(saved);
          }
        }
      } catch (err) {
        console.log('[VectorEngine] 首次使用，无保存配置');
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, [api, form]);

  const testConnection = useCallback(async (cfg?: VectorEngineConfig) => {
    const testConfig = cfg || config;
    if (!testConfig.apiKey) {
      api.ui.showMessage('warning', '请先输入 API Key');
      return;
    }

    setConnectionStatus('testing');
    setConnectionError('');

    const result = await api.channels.testProvider('itv', 'vectorengine', testConfig);

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

      await api.channels.updateProviderConfig('vectorengine', values);
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
      React.createElement(VideoCameraOutlined, { style: { marginRight: 8 } }),
      'VectorEngine 视频服务'
    ),
    React.createElement(Paragraph, { type: 'secondary' },
      '配置 VectorEngine.ai 视频生成服务，支持 Sora-2 图生视频和角色提取功能。'
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
              React.createElement(Tag, { color: 'blue' }, '图生视频'),
              React.createElement(Tag, { color: 'purple' }, '角色提取')
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

        React.createElement(Form.Item, { name: 'baseUrl', label: '服务地址' },
          React.createElement(Input, { placeholder: 'https://api.vectorengine.ai' })
        ),

        React.createElement(Divider, { orientation: 'left' }, '默认参数'),

        React.createElement(Row, { gutter: 16 },
          React.createElement(Col, { span: 12 },
            React.createElement(Form.Item, { name: 'defaultModel', label: '默认模型' },
              React.createElement(Select, { options: MODEL_OPTIONS })
            )
          ),
          React.createElement(Col, { span: 12 },
            React.createElement(Form.Item, { name: 'defaultOrientation', label: '默认画面方向' },
              React.createElement(Select, { options: ORIENTATION_OPTIONS })
            )
          )
        ),

        React.createElement(Row, { gutter: 16 },
          React.createElement(Col, { span: 12 },
            React.createElement(Form.Item, { name: 'defaultSize', label: '默认分辨率' },
              React.createElement(Select, { options: SIZE_OPTIONS })
            )
          ),
          React.createElement(Col, { span: 12 },
            React.createElement(Form.Item, { name: 'defaultDuration', label: '默认时长' },
              React.createElement(Select, { options: DURATION_OPTIONS })
            )
          )
        ),

        React.createElement(Form.Item, {
          name: 'watermark',
          label: '视频水印',
          valuePropName: 'checked',
        },
          React.createElement(Switch, { checkedChildren: '保留', unCheckedChildren: '移除' })
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
  console.log('[VectorEngine] 插件已激活');

  const providerDef: ProviderDefinition = {
    type: 'vectorengine',
    kind: 'itv',
    name: 'VectorEngine (Sora-2)',
    description: 'VectorEngine.ai 视频生成服务 - 支持图生视频和角色提取',
    factory: (config, ctx) => new VectorEngineITVProvider(config, ctx),
    capabilities: ['itv', 'character-extract'],
    defaultConfig: DEFAULT_CONFIG,
    polling: {
      interval: 5000,
      maxDuration: 600000,
      initialDelay: 3000,
    },
  };

  await api.channels.registerProvider(providerDef);
  console.log('[VectorEngine] Provider 已注册');
}

function onDeactivate() {
  console.log('[VectorEngine] 插件已停用');
}

export default VectorEngineProvider;
export { onActivate, onDeactivate };

(window as any).__KOMA_PLUGIN_com_koma_vectorengine_provider__ = {
  default: VectorEngineProvider,
  onActivate,
  onDeactivate,
};
