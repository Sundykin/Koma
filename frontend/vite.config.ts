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
              // 播放器（独立，无循环依赖）
              if (id.includes('xgplayer')) {
                return 'vendor-player';
              }
              // 编辑器（独立，无循环依赖）
              if (id.includes('codemirror') || id.includes('@codemirror') || id.includes('@lezer')) {
                return 'vendor-editor';
              }
              // AI SDK（独立，无循环依赖）
              if (id.includes('@google/genai')) {
                return 'vendor-ai';
              }
              // 所有其他依赖合并到 vendor-ui
              // 包括 React、AntD、zustand、i18next 及所有共享依赖
              // 这样可以完全避免循环依赖
              return 'vendor-ui';
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
