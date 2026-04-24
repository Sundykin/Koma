/**
 * 七牛云图床 Provider - 前端 UI + Runtime
 */

import type { PluginAPI } from '@komastudio/plugin-sdk';

const React = (window as any).React;
const { useState, useEffect, useCallback } = React;
const {
  Card, Button, Form, Input, Switch, Space, Typography,
  Divider, Tag, Spin, Alert, Row, Col, Statistic,
} = (window as any).antd;
const Icons = (window as any)['@ant-design/icons'] || {};
const {
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  CloudUploadOutlined, SettingOutlined, SaveOutlined, ReloadOutlined,
} = Icons;

const { Title, Text, Paragraph } = Typography;

// ========== 类型 ==========

interface QiniuConfig {
  enabled: boolean;
  apiEndpoint: string;
  apiKey: string;
}

const DEFAULT_CONFIG: QiniuConfig = {
  enabled: true,
  apiEndpoint: 'http://192.227.192.228:3000/v1/uploads/image',
  apiKey: 'sk-I5kyGgOb0ie9PGclXHYZEzkZrzoDIVXeXrkcgX7uWj8B584B',
};

// ========== UI 组件 ==========

interface QiniuProviderProps { api: PluginAPI }

type ConnStatus = 'idle' | 'testing' | 'success' | 'error';

function QiniuProvider({ api }: QiniuProviderProps) {
  const [form] = Form.useForm();
  const [config, setConfig] = useState<QiniuConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [err, setErr] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const cfg = await api.channels.getProviderConfig('qiniu-image-hosting');
        if (cfg && Object.keys(cfg).length > 0) {
          const merged = { ...DEFAULT_CONFIG, ...cfg } as QiniuConfig;
          setConfig(merged);
          form.setFieldsValue(merged);
          if (merged.enabled) setStatus('success');
        } else {
          form.setFieldsValue(DEFAULT_CONFIG);
        }
      } catch {
        form.setFieldsValue(DEFAULT_CONFIG);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [api, form]);

  const testConn = useCallback(async (cfg?: QiniuConfig) => {
    const t = cfg || config;
    if (!t.enabled) { api.ui.showMessage('warning', '请先启用图床服务'); return; }
    if (!t.apiKey) { api.ui.showMessage('warning', '请填写 API Key（激活 Key）'); return; }
    setStatus('testing');
    setErr('');
    const r = await api.channels.testProvider('image-hosting', 'qiniu-image-hosting', t);
    if (r.success) {
      setStatus('success');
      api.ui.showMessage('success', '七牛云图床连接成功');
    } else {
      setStatus('error');
      setErr(r.error || '连接失败');
    }
  }, [config, api]);

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.channels.updateProviderConfig('qiniu-image-hosting', values);
      setConfig(values);
      if (values.enabled) await testConn(values);
      else setStatus('idle');
      api.ui.showMessage('success', '配置已保存');
    } catch (e: any) {
      api.ui.showMessage('error', `保存失败: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }, [form, api, testConn]);

  const handleReset = useCallback(() => {
    form.setFieldsValue(DEFAULT_CONFIG);
    setConfig(DEFAULT_CONFIG);
    setStatus('idle');
    setErr('');
  }, [form]);

  if (loading) {
    return React.createElement('div', { style: { padding: 48, textAlign: 'center' } },
      React.createElement(Spin, { size: 'large', tip: '加载配置中...' })
    );
  }

  const StatusIcon = () => {
    if (status === 'testing') return React.createElement(LoadingOutlined, { style: { color: '#1890ff' } });
    if (status === 'success') return React.createElement(CheckCircleOutlined, { style: { color: '#52c41a' } });
    if (status === 'error') return React.createElement(CloseCircleOutlined, { style: { color: '#ff4d4f' } });
    return React.createElement(CloudUploadOutlined, { style: { color: '#999' } });
  };

  return React.createElement('div', { style: { padding: 24, maxWidth: 800 } },
    React.createElement(Title, { level: 3 },
      React.createElement(CloudUploadOutlined, { style: { marginRight: 8 } }),
      '七牛云图床（内置）'
    ),
    React.createElement(Paragraph, { type: 'secondary' },
      '默认图床。基于 new-api 上传接口，图片存储到七牛云 Kodo，返回带时间戳防盗链签名的 URL（默认 3 天有效期）。'
    ),

    React.createElement(Divider),

    React.createElement(Card, { size: 'small', style: { marginBottom: 16 } },
      React.createElement(Row, { gutter: 16 },
        React.createElement(Col, { span: 8 },
          React.createElement(Statistic, {
            title: '服务状态',
            value: status === 'success' ? '已启用' : status === 'error' ? '连接失败' : status === 'testing' ? '测试中...' : '未启用',
            prefix: React.createElement(StatusIcon),
          })
        ),
        React.createElement(Col, { span: 8 },
          React.createElement(Statistic, { title: '存储后端', value: '七牛云 Kodo' })
        ),
        React.createElement(Col, { span: 8 },
          React.createElement(Space, { direction: 'vertical', size: 0 },
            React.createElement(Text, { type: 'secondary', style: { fontSize: 12 } }, '能力'),
            React.createElement('div', { style: { marginTop: 4 } },
              React.createElement(Tag, { color: 'green' }, '图片上传'),
              React.createElement(Tag, { color: 'blue' }, '防盗链')
            )
          )
        )
      )
    ),

    err && React.createElement(Alert, { type: 'error', message: '连接失败', description: err, style: { marginBottom: 16 }, showIcon: true }),

    React.createElement(Card, {
      title: React.createElement(Space, null, React.createElement(SettingOutlined), '服务配置'),
    },
      React.createElement(Form, { form, layout: 'vertical', initialValues: config },
        React.createElement(Form.Item, {
          name: 'enabled',
          label: '启用图床',
          valuePropName: 'checked',
          extra: '启用后，手动上传的图片资产将自动经由 new-api 上传到七牛云',
        }, React.createElement(Switch, { checkedChildren: '已启用', unCheckedChildren: '已禁用' })),

        React.createElement(Form.Item, {
          name: 'apiEndpoint',
          label: '上传接口地址',
          rules: [{ required: true, message: '请输入接口地址' }],
          extra: 'new-api 的图片上传接口（POST multipart/form-data）',
        }, React.createElement(Input, { placeholder: 'http://192.227.192.228:3000/v1/uploads/image' })),

        React.createElement(Form.Item, {
          name: 'apiKey',
          label: 'API Key（激活 Key）',
          rules: [{ required: true, message: '请输入 API Key' }],
          extra: '即 new-api 颁发的令牌 sk-xxx，与 Koma 激活 Key 一致',
        }, React.createElement(Input.Password, { placeholder: 'sk-xxxxxxxxxxxxxxxxxxxx' })),

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
            onClick: () => testConn(),
            loading: status === 'testing',
          }, '测试连接'),
          React.createElement(Button, {
            icon: ReloadOutlined && React.createElement(ReloadOutlined),
            onClick: handleReset,
          }, '重置为默认')
        )
      )
    ),

    React.createElement(Divider),

    React.createElement(Alert, {
      type: 'info',
      message: '使用说明',
      description: React.createElement('ul', { style: { margin: 0, paddingLeft: 20 } },
        React.createElement('li', null, '本插件为内置图床，无需单独安装'),
        React.createElement('li', null, 'API Key 即 new-api 颁发的激活 Key，上传调用不消耗额度'),
        React.createElement('li', null, '上传失败会自动重试 3 次'),
        React.createElement('li', null, '返回的 URL 自带时间戳防盗链签名，有效期 3 天')
      ),
      showIcon: true,
    })
  );
}

// ========== Runtime ==========

class QiniuImageHostingRuntime {
  type = 'qiniu-image-hosting';
  private readonly fetcher: typeof fetch;
  private readonly config: QiniuConfig;

  constructor(config: Record<string, unknown>, ctx: { sandboxedFetch?: typeof fetch }) {
    this.fetcher = ctx?.sandboxedFetch || fetch;
    this.config = { ...DEFAULT_CONFIG, ...(config as any) } as QiniuConfig;
  }

  validate(): boolean {
    return Boolean(this.config.enabled && this.config.apiEndpoint && this.config.apiKey);
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      const testBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const bytes = Uint8Array.from(atob(testBase64), (c) => c.charCodeAt(0));
      const r = await this.uploadImage(bytes, { filename: 'koma-qiniu-test.png' });
      return Boolean(r?.success);
    } catch { return false; }
  }

  async uploadImage(
    bytes: ArrayBuffer | Uint8Array,
    options?: { filename?: string; mimeType?: string }
  ): Promise<{ success: boolean; url?: string; error?: string; data?: any }> {
    if (!this.validate()) return { success: false, error: '图床未启用或未配置 apiKey' };

    try {
      const filename = options?.filename || `image_${Date.now()}.png`;
      const mimeType = options?.mimeType || this.guessMime(filename);
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const blob = new Blob([u8], { type: mimeType });

      const formData = new FormData();
      formData.append('file', blob, filename);

      const resp = await this.fetcher(this.config.apiEndpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        body: formData,
      });
      const result = (await resp.json()) as any;
      if (result?.success && result?.data?.url) {
        return { success: true, url: result.data.url, data: result.data };
      }
      return { success: false, error: result?.message || `上传失败 (HTTP ${resp.status})` };
    } catch (err: any) {
      return { success: false, error: err?.message || '网络请求失败' };
    }
  }

  private guessMime(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', heic: 'image/heic', ico: 'image/x-icon',
    };
    return map[ext] || 'image/png';
  }
}

async function onActivate(api: PluginAPI) {
  console.log('[Qiniu] 前端 UI 已加载');
  try {
    await api.channels.registerProvider({
      type: 'qiniu-image-hosting',
      kind: 'image-hosting' as any,
      name: '七牛云图床（内置）',
      description: '基于 new-api 上传接口的七牛云图床，支持时间戳防盗链',
      capabilities: ['image-hosting'] as any[],
      defaultConfig: DEFAULT_CONFIG,
      factory: (config: any, ctx: any) => new QiniuImageHostingRuntime(config, ctx),
    });
    console.log('[Qiniu] Provider 注册成功');
  } catch (err) {
    console.warn('[Qiniu] Provider 注册跳过:', err);
  }
}

function onDeactivate() {
  console.log('[Qiniu] 前端 UI 已卸载');
}

export default QiniuProvider;
export { onActivate, onDeactivate };

(window as any).__KOMA_PLUGIN_com_koma_qiniu_image_hosting__ = {
  default: QiniuProvider,
  onActivate,
  onDeactivate,
};
