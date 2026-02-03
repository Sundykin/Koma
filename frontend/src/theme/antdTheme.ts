/**
 * Ant Design 主题配置
 * 基于 tokens.ts 构建，确保与设计系统一致
 */
import { theme } from 'antd';
import type { ThemeConfig } from 'antd';
import { tokens } from './tokens';

export const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    // 主题色
    colorPrimary: tokens.colors.accent.base,
    colorSuccess: tokens.colors.status.success,
    colorInfo: tokens.colors.status.info,
    colorWarning: tokens.colors.status.warning,
    colorError: tokens.colors.status.error,

    // 背景色
    colorBgContainer: tokens.colors.bg.surface,
    colorBgElevated: tokens.colors.bg.elevated,
    colorBgLayout: tokens.colors.bg.app,
    colorBgSpotlight: tokens.colors.bg.elevated,

    // 边框
    colorBorder: tokens.colors.border.base,
    colorBorderSecondary: tokens.colors.border.subtle,

    // 文字
    colorText: tokens.colors.text.primary,
    colorTextSecondary: tokens.colors.text.secondary,
    colorTextTertiary: tokens.colors.text.tertiary,
    colorTextQuaternary: tokens.colors.text.muted,

    // 圆角
    borderRadius: tokens.radius.base,
    borderRadiusLG: tokens.radius.lg,
    borderRadiusSM: tokens.radius.sm,

    // 字体
    fontFamily: tokens.typography.fontFamily,
  },
  components: {
    // Card
    Card: {
      colorBgContainer: tokens.colors.bg.surface,
    },
    // Modal
    Modal: {
      contentBg: tokens.colors.bg.surface,
      headerBg: tokens.colors.bg.surface,
      colorBgElevated: tokens.colors.bg.surface,
    },
    // Dropdown
    Dropdown: {
      colorBgElevated: tokens.colors.bg.elevated,
    },
    // Menu
    Menu: {
      colorBgContainer: 'transparent',
      itemSelectedBg: tokens.colors.accent.glow,
      itemSelectedColor: tokens.colors.accent.base,
      itemHoverBg: tokens.colors.bg.hover,
    },
    // Input
    Input: {
      colorBgContainer: tokens.colors.bg.elevated,
      colorBorder: tokens.colors.border.base,
      hoverBorderColor: tokens.colors.accent.base,
      activeBorderColor: tokens.colors.accent.base,
    },
    // Select
    Select: {
      colorBgContainer: tokens.colors.bg.elevated,
      colorBgElevated: tokens.colors.bg.elevated,
      optionSelectedBg: tokens.colors.accent.glow,
    },
    // Button
    Button: {
      primaryShadow: 'none',
      defaultBorderColor: tokens.colors.border.base,
    },
    // Tabs
    Tabs: {
      colorBgContainer: 'transparent',
      itemSelectedColor: tokens.colors.accent.base,
      inkBarColor: tokens.colors.accent.base,
    },
    // Tooltip
    Tooltip: {
      colorBgSpotlight: tokens.colors.bg.elevated,
    },
    // Popover
    Popover: {
      colorBgElevated: tokens.colors.bg.elevated,
    },
    // Drawer
    Drawer: {
      colorBgElevated: tokens.colors.bg.surface,
    },
    // Table
    Table: {
      colorBgContainer: tokens.colors.bg.surface,
      headerBg: tokens.colors.bg.elevated,
    },
    // Form
    Form: {
      labelColor: tokens.colors.text.primary,
    },
    // Tag
    Tag: {
      colorBgContainer: tokens.colors.bg.elevated,
    },
    // Spin
    Spin: {
      colorPrimary: tokens.colors.accent.base,
    },
    // Empty
    Empty: {
      colorText: tokens.colors.text.muted,
      colorTextDescription: tokens.colors.text.muted,
    },
    // Progress
    Progress: {
      defaultColor: tokens.colors.accent.base,
    },
    // Segmented
    Segmented: {
      colorBgLayout: tokens.colors.bg.elevated,
      itemSelectedBg: tokens.colors.bg.surface,
    },
  },
};
