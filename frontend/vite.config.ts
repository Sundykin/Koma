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
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'vendor-react';
              }
              if (id.includes('@mui') || id.includes('@emotion')) {
                return 'vendor-ui';
              }
              if (id.includes('axios') || id.includes('zustand') || id.includes('immer')) {
                return 'vendor-utils';
              }
              // 其他 node_modules 依赖
              return 'vendor-other';
            }
            // 将 workflow 相关代码分离
            if (id.includes('/workflow/')) {
              return 'workflow';
            }
            // 将 plugin 相关代码分离
            if (id.includes('/services/plugin/')) {
              return 'plugin';
            }
            // 将 store 相关代码分离
            if (id.includes('/store/')) {
              return 'store';
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
