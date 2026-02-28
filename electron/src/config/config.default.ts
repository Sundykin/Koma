import path from 'path';
import { type AppConfig } from 'ee-core/config';
import { getBaseDir, getElectronDir } from 'ee-core/ps';

const config: () => AppConfig = () => {
  return {
    openDevTools: false,
    singleLock: true,
    windowsOption: {
      title: 'Koma Studio',
      width: 1400,
      height: 900,
      minWidth: 1024,
      minHeight: 768,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(getElectronDir(), 'preload', 'index.js'),
      },
      frame: false,
      show: false,
      backgroundColor: '#0f0f0f',
      icon: path.join(getBaseDir(), 'public', 'images', 'logo-32.png'),
    },
    logger: {
      level: 'INFO',
      outputJSON: false,
      appLogName: 'koma.log',
      coreLogName: 'ee-core.log',
      errorLogName: 'koma-error.log',
    },
    mainServer: {
      indexPath: '/public/dist/index.html',
    },
  };
};

export default config;
