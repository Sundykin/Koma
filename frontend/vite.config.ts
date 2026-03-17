import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    root: '.',
    server: {
      port: 5173,
      host: env.VITE_DEV_HOST || '127.0.0.1',
    },
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            // xgplayer 播放器
            if (id.includes('xgplayer')) return 'vendor-player';

            // CodeMirror 编辑器
            if (id.includes('codemirror') || id.includes('@codemirror') || id.includes('@lezer'))
              return 'vendor-editor';

            // Google AI SDK
            if (id.includes('@google/genai')) return 'vendor-ai';

            // antd icons + 全部传递依赖，避免与 vendor-antd 循环引用
            // @ant-design/icons → icons-svg, colors(→fast-color), @rc-component/util, clsx
            if (
              id.includes('@ant-design/icons') ||
              id.includes('@ant-design/icons-svg') ||
              id.includes('@ant-design/colors') ||
              id.includes('@ant-design/fast-color') ||
              id.includes('@rc-component/util')
            )
              return 'vendor-antd-icons';

            // antd 核心 + rc-* 组件库 + @ant-design 共享基础设施
            if (
              id.includes('/antd/') ||
              id.includes('@ant-design/') ||
              id.includes('rc-') ||
              id.includes('@rc-component')
            )
              return 'vendor-antd';

            // React 核心（版本稳定，利于长期缓存）
            if (
              id.includes('/react-dom/') ||
              id.includes('/react/') ||
              id.includes('/scheduler/')
            )
              return 'vendor-react';

            // 其他第三方依赖
            return 'vendor-ui';
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
