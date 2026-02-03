import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    root: '.',
    server: {
      port: 5173,
      host: '0.0.0.0',
    },
    build: {
      outDir: '../public/dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // 将 node_modules 中的依赖分离到 vendor chunks
            if (id.includes('node_modules')) {
              // UI 组件库：合并 React + UI 组件避免循环依赖
              if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router') || id.includes('antd') || id.includes('@ant-design') || id.includes('lucide-react')) {
                return 'vendor-ui';
              }
              // 播放器
              if (id.includes('xgplayer')) {
                return 'vendor-player';
              }
              // 编辑器
              if (id.includes('codemirror') || id.includes('@codemirror') || id.includes('@lezer')) {
                return 'vendor-editor';
              }
              // AI SDK
              if (id.includes('@google/genai')) {
                return 'vendor-ai';
              }
              // 工具库
              if (id.includes('axios') || id.includes('zustand') || id.includes('immer') || id.includes('i18next') || id.includes('uuid')) {
                return 'vendor-utils';
              }
              // 其他 node_modules 依赖
              return 'vendor-other';
            }
          },
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
