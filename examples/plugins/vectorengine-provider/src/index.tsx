/**
 * VectorEngine Provider 插件
 * 提供视频生成渠道配置界面
 */

const React = (window as any).React;
const { useState, useEffect, useCallback } = React;
const {
  Card, Button, Form, Input, Select, Switch, Space, Typography,
  Divider, Tag, Spin, Alert, message, Tooltip, Row, Col, Statistic,
} = (window as any).antd;
const {
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  ApiOutlined, VideoCameraOutlined, UserOutlined, SettingOutlined,
  SaveOutlined, ReloadOutlined, LinkOutlined,
} = (window as any)['@ant-design/icons'] || {};

const { Title, Text, Paragraph } = Typography;

// 类型定义
interface PluginAPI {
  core: {
    getVersion(): Promise<string>;
    getHostInfo(): Promise<{ appVersion: string; platform: string; electronVersion: string }>;
    on(event: string, handler: Function): void;
    off(event: string, handler: Function): void;
  };
  settings: {
    get(keys?: string[]): Promise<Record<string, any>>;
    set(values: Record<string, any>): Promise<void>;
  };
  storage: {
    readFile(path: string): Promise<ArrayBuffer>;
    writeFile(path: string, data: ArrayBuffer): Promise<void>;
    listFiles(dir: string): Promise<string[]>;
    deleteFile(path: string): Promise<void>;
  };
  channels: {
    register(config: any): Promise<void>;
    test(channelId: string): Promise<{ success: boolean; latency: number; error?: string }>;
    invoke(channelId: string, action: string, params: any): Promise<any>;
  };
  ui: {
    showMessage(type: 'success' | 'error' | 'info' | 'warning', content: string): void;
    showModal(options: { title: string; content: any }): Promise<boolean>;
  };
}

interface VectorEngineConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  defaultOrientation: 'portrait' | 'landscape';
  defaultSize: 'small' | 'large';
  defaultDuration: number;
  watermark: boolean;
}

// 默认配置
const DEFAULT_CONFIG: VectorEngineConfig = {
  apiKey: '',
  baseUrl: 'https://api.vectorengine.ai',
  defaultModel: 'sora-2-all',
  defaultOrientation: 'landscape',
  defaultSize: 'small',
  defaultDuration: 10,
  watermark: true,
};

// 模型选项
const MODEL_OPTIONS = [
  { value: 'sora-2-all', label: 'Sora 2 All (推荐)' },
  { value: 'sora-2', label: 'Sora 2' },
];

// 方向选项
const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: '横屏 (16:9)' },
  { value: 'portrait', label: '竖屏 (9:16)' },
];

// 尺寸选项
const SIZE_OPTIONS = [
  { value: 'small', label: '标准 (720p)' },
  { value: 'large', label: '高清 (1080p)' },
];

// 时长选项
const DURATION_OPTIONS = [
  { value: 10, label: '10秒' },
  { value: 15, label: '15秒' },
  { value: 20, label: '20秒' },
];

interface VectorEngineProviderProps {
  api: PluginAPI;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

// 主组件
function VectorEngineProvider({ api }: VectorEngineProviderProps) {
  const [form] = Form.useForm();
  const [config, setConfig] = useState<VectorEngineConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionError, setConnectionError] = useState<string>('');
  const [registeredChannelId, setRegisteredChannelId] = useState<string>('');

  // 加载配置
  useEffect(() => {
    async function loadConfig() {
      try {
        const files = await api.storage.listFiles('/');
        if (files.includes('config.json')) {
          const data = await api.storage.readFile('/config.json');
          const text = new TextDecoder().decode(data);
          const saved = JSON.parse(text);
          setConfig({ ...DEFAULT_CONFIG, ...saved });
          form.setFieldsValue({ ...DEFAULT_CONFIG, ...saved });

          // 如果有 API Key，自动测试连接
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

  // 测试连接
  const testConnection = useCallback(async (cfg?: VectorEngineConfig) => {
    const testConfig = cfg || config;
    if (!testConfig.apiKey) {
      api.ui.showMessage('warning', '请先输入 API Key');
      return;
    }

    setConnectionStatus('testing');
    setConnectionError('');

    try {
      // 发送测试请求
      const response = await fetch(`${testConfig.baseUrl}/v1/video/query?id=test`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${testConfig.apiKey}`,
        },
      });

      // 401/403 表示 API Key 无效
      if (response.status === 401 || response.status === 403) {
        setConnectionStatus('error');
        setConnectionError('API Key 无效或已过期');
        return;
      }

      // 404 或其他错误（但连接成功）
      if (response.status === 404 || response.ok) {
        setConnectionStatus('success');
        api.ui.showMessage('success', '连接成功');

        // 注册渠道
        await registerChannel(testConfig);
        return;
      }

      setConnectionStatus('error');
      setConnectionError(`服务器返回 ${response.status}`);
    } catch (err: any) {
      setConnectionStatus('error');
      setConnectionError(err.message || '网络错误');
    }
  }, [config, api]);

  // 注册渠道到系统
  const registerChannel = useCallback(async (cfg: VectorEngineConfig) => {
    const channelConfig = {
      id: 'vectorengine-itv',
      type: 'itv',
      name: 'VectorEngine (Sora-2)',
      config: {
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        defaultModel: cfg.defaultModel,
        defaultOrientation: cfg.defaultOrientation,
        defaultSize: cfg.defaultSize,
        defaultDuration: cfg.defaultDuration,
        watermark: cfg.watermark,
      },
    };

    try {
      await api.channels.register(channelConfig);
      setRegisteredChannelId('vectorengine-itv');
      console.log('[VectorEngine] 渠道已注册');
    } catch (err) {
      console.error('[VectorEngine] 渠道注册失败:', err);
    }
  }, [api]);

  // 保存配置
  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      // 保存到存储
      const data = new TextEncoder().encode(JSON.stringify(values));
      await api.storage.writeFile('/config.json', data.buffer);
      setConfig(values);

      // 测试并注册
      await testConnection(values);

      api.ui.showMessage('success', '配置已保存');
    } catch (err: any) {
      api.ui.showMessage('error', `保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [form, api, testConnection]);

  // 重置配置
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

  // 连接状态图标
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
    // 标题
    React.createElement(Title, { level: 3 },
      React.createElement(VideoCameraOutlined, { style: { marginRight: 8 } }),
      'VectorEngine 视频服务'
    ),
    React.createElement(Paragraph, { type: 'secondary' },
      '配置 VectorEngine.ai 视频生成服务，支持 Sora-2 图生视频和角色提取功能。'
    ),

    React.createElement(Divider),

    // 连接状态卡片
    React.createElement(Card, {
      size: 'small',
      style: { marginBottom: 16 },
    },
      React.createElement(Row, { gutter: 16 },
        React.createElement(Col, { span: 8 },
          React.createElement(Statistic, {
            title: '连接状态',
            value: connectionStatus === 'success' ? '已连接' :
                   connectionStatus === 'error' ? '连接失败' :
                   connectionStatus === 'testing' ? '测试中...' : '未连接',
            prefix: React.createElement(StatusIcon),
            valueStyle: {
              color: connectionStatus === 'success' ? '#52c41a' :
                     connectionStatus === 'error' ? '#ff4d4f' : '#666',
            },
          })
        ),
        React.createElement(Col, { span: 8 },
          React.createElement(Statistic, {
            title: '支持能力',
            value: '2',
            suffix: '项',
          })
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

    // 错误提示
    connectionError && React.createElement(Alert, {
      type: 'error',
      message: '连接失败',
      description: connectionError,
      style: { marginBottom: 16 },
      showIcon: true,
    }),

    // 配置表单
    React.createElement(Card, {
      title: React.createElement(Space, null,
        React.createElement(SettingOutlined),
        '服务配置'
      ),
    },
      React.createElement(Form, {
        form,
        layout: 'vertical',
        initialValues: config,
      },
        // API Key
        React.createElement(Form.Item, {
          name: 'apiKey',
          label: 'API Key',
          rules: [{ required: true, message: '请输入 API Key' }],
          extra: React.createElement(Space, null,
            React.createElement(Text, { type: 'secondary' }, '从 VectorEngine.ai 获取'),
            React.createElement(Tooltip, { title: '访问 VectorEngine.ai 控制台获取 API Key' },
              LinkOutlined && React.createElement(LinkOutlined)
            )
          ),
        },
          React.createElement(Input.Password, {
            placeholder: 'Bearer YOUR_API_KEY',
            size: 'large',
          })
        ),

        // Base URL
        React.createElement(Form.Item, {
          name: 'baseUrl',
          label: '服务地址',
          rules: [{ required: true, message: '请输入服务地址' }],
        },
          React.createElement(Input, {
            placeholder: 'https://api.vectorengine.ai',
            addonBefore: 'URL',
          })
        ),

        React.createElement(Divider, { orientation: 'left' }, '默认参数'),

        React.createElement(Row, { gutter: 16 },
          // 默认模型
          React.createElement(Col, { span: 12 },
            React.createElement(Form.Item, {
              name: 'defaultModel',
              label: '默认模型',
            },
              React.createElement(Select, {
                options: MODEL_OPTIONS,
              })
            )
          ),
          // 默认方向
          React.createElement(Col, { span: 12 },
            React.createElement(Form.Item, {
              name: 'defaultOrientation',
              label: '默认画面方向',
            },
              React.createElement(Select, {
                options: ORIENTATION_OPTIONS,
              })
            )
          )
        ),

        React.createElement(Row, { gutter: 16 },
          // 默认尺寸
          React.createElement(Col, { span: 12 },
            React.createElement(Form.Item, {
              name: 'defaultSize',
              label: '默认分辨率',
            },
              React.createElement(Select, {
                options: SIZE_OPTIONS,
              })
            )
          ),
          // 默认时长
          React.createElement(Col, { span: 12 },
            React.createElement(Form.Item, {
              name: 'defaultDuration',
              label: '默认时长',
            },
              React.createElement(Select, {
                options: DURATION_OPTIONS,
              })
            )
          )
        ),

        // 水印
        React.createElement(Form.Item, {
          name: 'watermark',
          label: '视频水印',
          valuePropName: 'checked',
          extra: '关闭后将尝试生成无水印视频（遇到去水印错误会自动重试）',
        },
          React.createElement(Switch, {
            checkedChildren: '保留',
            unCheckedChildren: '移除',
          })
        ),

        React.createElement(Divider),

        // 操作按钮
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
    ),

    // 权限说明
    React.createElement(Card, {
      title: '插件权限',
      size: 'small',
      style: { marginTop: 16 },
    },
      React.createElement(Space, { wrap: true },
        React.createElement(Tag, { color: 'green' }, 'settings:read'),
        React.createElement(Tag, { color: 'orange' }, 'settings:write'),
        React.createElement(Tag, { color: 'green' }, 'storage:limited'),
        React.createElement(Tag, { color: 'red' }, 'network:external')
      ),
      React.createElement(Paragraph, {
        type: 'secondary',
        style: { marginTop: 8, marginBottom: 0, fontSize: 12 },
      },
        '• network:external - 访问 VectorEngine.ai API',
        React.createElement('br'),
        '• storage:limited - 保存配置到插件沙箱'
      )
    )
  );
}

// 生命周期钩子
function onActivate(api: PluginAPI) {
  console.log('[VectorEngine] 插件已激活');
}

function onDeactivate() {
  console.log('[VectorEngine] 插件已停用');
}

// 导出
export default VectorEngineProvider;
export { onActivate, onDeactivate };

// UMD 全局导出
(window as any).__KOMA_PLUGIN_com_koma_vectorengine_provider__ = {
  default: VectorEngineProvider,
  onActivate,
  onDeactivate,
};
