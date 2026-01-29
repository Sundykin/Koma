import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './index.css';
import { antdTheme } from './theme';
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

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);