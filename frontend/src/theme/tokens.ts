/**
 * Design System Tokens
 * 统一的设计令牌，作为 CSS 变量和 JS 配置的单一来源
 */

export const tokens = {
  colors: {
    // 背景层级
    bg: {
      app: '#09090b',        // zinc-950 - 最深背景
      surface: '#18181b',    // zinc-900 - 侧边栏/表面
      elevated: '#27272a',   // zinc-800 - 悬浮/弹窗
      card: '#18181b',       // zinc-900 - 卡片背景
      hover: '#3f3f46',      // zinc-700 - 悬停背景
    },
    // 边框
    border: {
      base: '#3f3f46',       // zinc-700 - 主边框
      subtle: '#27272a',     // zinc-800 - 次级边框
      focus: '#10b981',      // emerald-500 - 焦点边框
    },
    // 文字
    text: {
      primary: '#f4f4f5',    // zinc-100
      secondary: '#a1a1aa',  // zinc-400
      tertiary: '#71717a',   // zinc-500
      muted: '#52525b',      // zinc-600
    },
    // 主题色
    accent: {
      base: '#10b981',       // emerald-500
      hover: '#059669',      // emerald-600
      glow: 'rgba(16, 185, 129, 0.2)',
    },
    // 状态色
    status: {
      success: '#10b981',    // emerald-500
      info: '#3b82f6',       // blue-500
      warning: '#f59e0b',    // amber-500
      error: '#ef4444',      // red-500
    },
  },
  // 布局尺寸
  layout: {
    sidebarWidth: 72,
    headerHeight: 56,
    headerHeightLg: 64,
  },
  // 圆角
  radius: {
    sm: 6,
    base: 8,
    lg: 12,
  },
  // 字体
  typography: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: {
      xs: 12,
      sm: 13,
      base: 14,
      lg: 16,
      xl: 18,
    },
  },
};
