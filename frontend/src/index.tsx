import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './index.css';

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
      colorItemBgSelected: 'rgba(16, 185, 129, 0.1)',
      colorItemTextSelected: '#10b981',
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