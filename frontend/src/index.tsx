import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './index.css';
import { cleanupDuplicateChannels } from './store/globalStore';
import { initializeProviderPlugins } from './services/plugin/PluginInitializer';

// 应用启动时初始化
async function bootstrap() {
  // 1. 清理重复的渠道配置
  try {
    const count = await cleanupDuplicateChannels();
    if (count > 0) {
      console.log(`[Startup] 已清理 ${count} 条重复渠道配置`);
    }
  } catch (err) {
    console.warn('[Startup] 清理渠道配置失败:', err);
  }

  // 2. 初始化所有已启用的插件（注册 Provider 和渠道配置）
  try {
    const result = await initializeProviderPlugins();
    if (result.total > 0) {
      console.log(`[Startup] 插件初始化: ${result.success}/${result.total} 成功`);
      if (result.failed.length > 0) {
        console.warn(`[Startup] 初始化失败的插件:`, result.failed);
      }
    }
  } catch (err) {
    console.warn('[Startup] 插件初始化失败:', err);
  }
}

// 执行启动初始化
bootstrap();

// Antd 暗色主题配置 - Zinc + Emerald 色板
const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    // 主题色
    colorPrimary: '#10b981',        // emerald-500
    colorSuccess: '#10b981',        // emerald-500
    colorInfo: '#3b82f6',           // blue-500
    colorWarning: '#f59e0b',        // amber-500
    colorError: '#ef4444',          // red-500

    // 背景色
    colorBgContainer: '#18181b',    // zinc-900
    colorBgElevated: '#27272a',     // zinc-800
    colorBgLayout: '#09090b',       // zinc-950
    colorBgSpotlight: '#27272a',    // zinc-800

    // 边框
    colorBorder: '#3f3f46',         // zinc-700
    colorBorderSecondary: '#27272a', // zinc-800

    // 文字
    colorText: '#f4f4f5',           // zinc-100
    colorTextSecondary: '#a1a1aa',  // zinc-400
    colorTextTertiary: '#71717a',   // zinc-500
    colorTextQuaternary: '#52525b', // zinc-600

    // 圆角
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
  },
  components: {
    Card: {
      colorBgContainer: '#18181b',
    },
    Modal: {
      colorBgElevated: '#18181b',
    },
    Dropdown: {
      colorBgElevated: '#27272a',
    },
    Menu: {
      colorBgContainer: 'transparent',
      itemSelectedBg: 'rgba(16, 185, 129, 0.1)',
      itemSelectedColor: '#10b981',
    },
  },
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ConfigProvider theme={darkTheme} locale={zhCN}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);