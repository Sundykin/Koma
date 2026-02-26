import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './index.css';
import { antdTheme } from './theme';
import { cleanupDuplicateChannels } from './store/globalStore';
import { initializeProviderPlugins } from './services/plugin/PluginInitializer';
import { initWorkflowDelegates } from './workflow/workflowAdapter';

// 应用启动时初始化
async function bootstrap() {
  // 1 & 2 并行：渠道清理和插件初始化互不依赖
  const [cleanupResult, pluginResult] = await Promise.allSettled([
    cleanupDuplicateChannels().then(count => {
      if (count > 0) console.log(`[Startup] 已清理 ${count} 条重复渠道配置`);
    }),
    initializeProviderPlugins().then(result => {
      if (result.total > 0) {
        console.log(`[Startup] 插件初始化: ${result.success}/${result.total} 成功`);
        if (result.failed.length > 0) {
          console.warn(`[Startup] 初始化失败的插件:`, result.failed);
        }
      }
    }),
  ]);

  if (cleanupResult.status === 'rejected') {
    console.warn('[Startup] 清理渠道配置失败:', cleanupResult.reason);
  }
  if (pluginResult.status === 'rejected') {
    console.warn('[Startup] 插件初始化失败:', pluginResult.reason);
  }

  // 3. 工作流委托延迟到首次使用时注册（见 workflowAdapter 内部懒初始化）
  // initWorkflowDelegates 保留调用但内部改为懒注册
  try {
    initWorkflowDelegates();
    console.log('[Startup] 工作流委托处理器已注册');
  } catch (err) {
    console.warn('[Startup] 工作流委托注册失败:', err);
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