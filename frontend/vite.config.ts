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
      target: 'esnext',
      cssCodeSplit: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-antd': ['antd', '@ant-design/icons', '@ant-design/cssinjs'],
            'vendor-editor': ['codemirror', '@codemirror/view', '@codemirror/state', '@codemirror/language', '@codemirror/commands', '@codemirror/autocomplete'],
            'vendor-player': ['xgplayer', 'xgplayer-mp4'],
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
