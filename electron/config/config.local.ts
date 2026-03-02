import { type AppConfig } from 'ee-core/config';

const config: () => AppConfig = () => {
  return {
    openDevTools: {
      mode: 'bottom',
    },
  };
};

export default config;
