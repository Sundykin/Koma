import type { Theme } from '../types';
import { amber, blue, emerald, red, slate } from '../palettes';

export const lightBusinessTheme = {
  meta: {
    id: 'light-business',
    name: '商务明亮',
    mode: 'light',
    description: '明亮商务风格，使用清爽蓝灰层次和轻量阴影。',
  },
  tokens: {
    bg: {
      app: slate[50],
      surface: '#ffffff',
      elevated: slate[100],
      card: '#ffffff',
      hover: slate[200],
    },
    border: {
      base: slate[300],
      subtle: slate[200],
      focus: blue[600],
    },
    text: {
      primary: slate[950],
      secondary: slate[700],
      tertiary: slate[500],
      muted: slate[400],
    },
    accent: {
      base: blue[600],
      hover: blue[700],
      glow: 'rgba(37, 99, 235, 0.14)',
    },
    status: {
      success: emerald[600],
      info: blue[600],
      warning: amber[600],
      error: red[600],
    },
    radius: {
      sm: 6,
      base: 8,
      lg: 12,
    },
    shadow: {
      sm: '0 1px 2px rgba(15, 23, 42, 0.08)',
      md: '0 8px 24px rgba(15, 23, 42, 0.1)',
      lg: '0 20px 48px rgba(15, 23, 42, 0.12)',
      glow: '0 0 0 1px rgba(37, 99, 235, 0.18), 0 0 24px rgba(37, 99, 235, 0.12)',
    },
    space: {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 24,
    },
    z: {
      base: 1,
      modal: 1000,
      dropdown: 1050,
      tooltip: 1100,
    },
    overlay: {
      onBg: 'rgba(15, 23, 42, 0.08)',
    },
  },
} satisfies Theme;

export default lightBusinessTheme;
