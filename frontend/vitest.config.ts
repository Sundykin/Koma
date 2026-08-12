import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // 也收 electron 侧的纯函数测试（持久化 row ↔ entity 映射等）：
    // 那边没有独立 test runner，而这些映射一旦漏字段就是"存完再读就没了"的静默数据丢失。
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      '../electron/**/*.{test,spec}.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  // electron 测试文件在 frontend root 之外，需要放开 fs 访问
  server: {
    fs: { allow: [resolve(__dirname, '..')] },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
