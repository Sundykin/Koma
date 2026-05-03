import type { ReactNode } from 'react';
import type { ConfigProviderProps } from 'antd';

export interface SemanticTokens {
  bg: { app: string; surface: string; elevated: string; card: string; hover: string };
  border: { base: string; subtle: string; focus: string };
  text: { primary: string; secondary: string; tertiary: string; muted: string };
  accent: { base: string; hover: string; glow: string };
  status: { success: string; info: string; warning: string; error: string };
  radius: { sm: number; base: number; lg: number };
  shadow: { sm: string; md: string; lg: string; glow: string };
  space: { xs: number; sm: number; md: number; lg: number; xl: number };
  z: { base: number; modal: number; dropdown: number; tooltip: number };
  overlay: { onBg: string };
}

export type ThemeMode = 'dark' | 'light';

export type ThemeId = string;

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  mode: ThemeMode;
  description?: string;
}

export interface Theme {
  meta: ThemeMeta;
  tokens: SemanticTokens;
}

export type ThemeRegistry = Record<string, Theme>;

export interface ThemePersistence {
  loadThemeId?: () => ThemeId | null | undefined;
  saveThemeId?: (themeId: ThemeId) => void;
}

export interface ThemeContextValue {
  theme: Theme;
  themeId: ThemeId;
  antdTheme: import('antd').ThemeConfig;
  setTheme: (themeId: ThemeId) => void;
}

export interface ThemeProviderProps extends ThemePersistence {
  children: ReactNode;
  initialThemeId?: ThemeId;
  locale?: ConfigProviderProps['locale'];
}
