/**
 * Hello World 插件
 * 展示 Koma 插件 API 的基本用法
 */

// 从 Host 应用获取 React 和 Antd
const React = (window as any).React;
const { useState, useEffect } = React;
const { Card, Button, Typography, Space, Statistic, Divider, Tag, message } = (window as any).antd;
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
  };
  storage: {
    readFile(path: string): Promise<ArrayBuffer>;
    writeFile(path: string, data: ArrayBuffer): Promise<void>;
    listFiles(dir: string): Promise<string[]>;
  };
  ui: {
    showMessage(type: 'success' | 'error' | 'info' | 'warning', content: string): void;
    showModal(options: { title: string; content: any }): Promise<boolean>;
  };
}

interface HelloWorldProps {
  api: PluginAPI;
}

// 主组件
function HelloWorld({ api }: HelloWorldProps) {
  const [hostInfo, setHostInfo] = useState<any>(null);
  const [sdkVersion, setSdkVersion] = useState('');
  const [clickCount, setClickCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);

  // 初始化时获取主机信息
  useEffect(() => {
    async function init() {
      try {
        const info = await api.core.getHostInfo();
        setHostInfo(info);

        const version = await api.core.getVersion();
        setSdkVersion(version);

        // 尝试读取保存的计数
        try {
          const files = await api.storage.listFiles('/');
          if (files.includes('count.txt')) {
            const data = await api.storage.readFile('/count.txt');
            const text = new TextDecoder().decode(data);
            const count = parseInt(text, 10);
            if (!isNaN(count)) {
              setClickCount(count);
              setSavedCount(count);
            }
          }
        } catch (e) {
          // 首次运行，无保存数据
        }
      } catch (err) {
        console.error('初始化失败:', err);
      }
    }
    init();
  }, [api]);

  // 点击按钮
  const handleClick = () => {
    setClickCount(prev => prev + 1);
    api.ui.showMessage('success', `点击次数: ${clickCount + 1}`);
  };

  // 保存计数到沙箱存储
  const handleSave = async () => {
    try {
      const data = new TextEncoder().encode(String(clickCount));
      await api.storage.writeFile('/count.txt', data.buffer);
      setSavedCount(clickCount);
      api.ui.showMessage('success', '已保存到插件存储');
    } catch (err: any) {
      api.ui.showMessage('error', `保存失败: ${err.message}`);
    }
  };

  // 显示 Modal
  const handleShowModal = async () => {
    const confirmed = await api.ui.showModal({
      title: '确认操作',
      content: '这是一个由插件触发的确认弹窗。点击确定或取消。',
    });
    api.ui.showMessage('info', confirmed ? '你点击了确定' : '你点击了取消');
  };

  return React.createElement('div', { style: { padding: 24, maxWidth: 800 } },
    React.createElement(Title, { level: 3 }, '👋 Hello World Plugin'),
    React.createElement(Paragraph, { type: 'secondary' },
      '这是一个示例插件，展示了 Koma 插件系统的基本能力。'
    ),

    React.createElement(Divider, null),

    // 主机信息卡片
    React.createElement(Card, { title: '主机信息', style: { marginBottom: 16 } },
      hostInfo ? React.createElement(Space, { size: 'large' },
        React.createElement(Statistic, { title: '应用版本', value: hostInfo.appVersion }),
        React.createElement(Statistic, { title: '平台', value: hostInfo.platform }),
        React.createElement(Statistic, { title: 'Electron', value: hostInfo.electronVersion }),
        React.createElement(Statistic, { title: 'SDK 版本', value: sdkVersion })
      ) : React.createElement(Text, { type: 'secondary' }, '加载中...')
    ),

    // 交互示例卡片
    React.createElement(Card, { title: '交互示例', style: { marginBottom: 16 } },
      React.createElement(Space, { direction: 'vertical', style: { width: '100%' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
          React.createElement(Text, null, '点击计数:'),
          React.createElement(Tag, { color: 'blue', style: { fontSize: 16 } }, clickCount),
          savedCount !== clickCount && React.createElement(Tag, { color: 'orange' }, '未保存')
        ),
        React.createElement(Space, null,
          React.createElement(Button, { type: 'primary', onClick: handleClick }, '点击 +1'),
          React.createElement(Button, { onClick: handleSave, disabled: savedCount === clickCount }, '保存到存储'),
          React.createElement(Button, { onClick: handleShowModal }, '显示弹窗')
        )
      )
    ),

    // 权限说明
    React.createElement(Card, { title: '本插件申请的权限', size: 'small' },
      React.createElement(Space, null,
        React.createElement(Tag, { color: 'green' }, 'settings:read'),
        React.createElement(Tag, { color: 'green' }, 'storage:limited')
      ),
      React.createElement(Paragraph, { type: 'secondary', style: { marginTop: 8, marginBottom: 0 } },
        '• settings:read - 读取应用设置（只读）',
        React.createElement('br', null),
        '• storage:limited - 访问插件专属沙箱存储'
      )
    )
  );
}

// 生命周期钩子
function onActivate(api: PluginAPI) {
  console.log('[HelloWorld] 插件已激活');
  api.ui.showMessage('info', 'Hello World 插件已加载');
}

function onDeactivate() {
  console.log('[HelloWorld] 插件已停用');
}

// 导出
export default HelloWorld;
export { onActivate, onDeactivate };

// UMD 全局导出
(window as any).__KOMA_PLUGIN_com_koma_hello_world__ = {
  default: HelloWorld,
  onActivate,
  onDeactivate,
};
