import { theme as antdThemeAlgorithms } from 'antd';
import type { ThemeConfig } from 'antd';
import type { SemanticTokens, ThemeMode } from '../types';

export function themeToAntdConfig(tokens: SemanticTokens, mode: ThemeMode): ThemeConfig {
  return {
    algorithm: mode === 'dark' ? antdThemeAlgorithms.darkAlgorithm : antdThemeAlgorithms.defaultAlgorithm,
    token: {
      colorPrimary: tokens.accent.base,
      colorSuccess: tokens.status.success,
      colorInfo: tokens.status.info,
      colorWarning: tokens.status.warning,
      colorError: tokens.status.error,

      colorBgContainer: tokens.bg.surface,
      colorBgElevated: tokens.bg.elevated,
      colorBgLayout: tokens.bg.app,
      colorBgSpotlight: tokens.bg.elevated,

      colorBorder: tokens.border.base,
      colorBorderSecondary: tokens.border.subtle,

      colorText: tokens.text.primary,
      colorTextSecondary: tokens.text.secondary,
      colorTextTertiary: tokens.text.tertiary,
      colorTextQuaternary: tokens.text.muted,

      borderRadius: tokens.radius.base,
      borderRadiusLG: tokens.radius.lg,
      borderRadiusSM: tokens.radius.sm,

      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: tokens.shadow.md,
      boxShadowSecondary: tokens.shadow.sm,
    },
    components: {
      Card: {
        colorBgContainer: tokens.bg.surface,
      },
      Modal: {
        contentBg: tokens.bg.surface,
        headerBg: tokens.bg.surface,
        colorBgElevated: tokens.bg.surface,
      },
      Dropdown: {
        colorBgElevated: tokens.bg.elevated,
        zIndexPopup: tokens.z.dropdown,
      },
      Menu: {
        colorBgContainer: 'transparent',
        itemSelectedBg: tokens.accent.glow,
        itemSelectedColor: tokens.accent.base,
        itemHoverBg: tokens.bg.hover,
      },
      Input: {
        colorBgContainer: tokens.bg.elevated,
        colorBorder: tokens.border.base,
        hoverBorderColor: tokens.accent.base,
        activeBorderColor: tokens.accent.base,
      },
      Select: {
        colorBgContainer: tokens.bg.elevated,
        colorBgElevated: tokens.bg.elevated,
        optionSelectedBg: tokens.accent.glow,
      },
      Button: {
        primaryShadow: 'none',
        defaultBorderColor: tokens.border.base,
      },
      Tabs: {
        colorBgContainer: 'transparent',
        itemSelectedColor: tokens.accent.base,
        inkBarColor: tokens.accent.base,
      },
      Tooltip: {
        colorBgSpotlight: tokens.bg.elevated,
        zIndexPopup: tokens.z.tooltip,
      },
      Popover: {
        colorBgElevated: tokens.bg.elevated,
        zIndexPopup: tokens.z.dropdown,
      },
      Drawer: {
        colorBgElevated: tokens.bg.surface,
        zIndexPopup: tokens.z.modal,
      },
      Table: {
        colorBgContainer: tokens.bg.surface,
        headerBg: tokens.bg.elevated,
      },
      Form: {
        labelColor: tokens.text.primary,
      },
      Tag: {
        colorBgContainer: tokens.bg.elevated,
      },
      Spin: {
        colorPrimary: tokens.accent.base,
      },
      Empty: {
        colorText: tokens.text.muted,
        colorTextDescription: tokens.text.muted,
      },
      Progress: {
        defaultColor: tokens.accent.base,
      },
      Segmented: {
        colorBgLayout: tokens.bg.elevated,
        itemSelectedBg: tokens.bg.surface,
      },
    },
  };
}
