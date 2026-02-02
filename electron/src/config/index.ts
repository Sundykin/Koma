/**
 * Electron-Egg 配置类型
 */
export interface WindowConfig {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  frame: boolean;
  titleBarStyle: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover';
  backgroundColor: string;
}

export interface DevConfig {
  frontendPort: number;
  openDevTools: boolean;
}

export interface StorageConfig {
  defaultRoot: string;
}

export interface AppConfig {
  name: string;
  version: string;
}

export interface EEConfig {
  app: AppConfig;
  dev: DevConfig;
  window: WindowConfig;
  storage: StorageConfig;
}

export const defaultConfig: EEConfig = {
  app: {
    name: 'Koma Studio',
    version: '1.0.0',
  },
  dev: {
    frontendPort: 5173,
    openDevTools: true,
  },
  window: {
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f0f',
  },
  storage: {
    defaultRoot: '.koma',
  },
};

export default defaultConfig;
