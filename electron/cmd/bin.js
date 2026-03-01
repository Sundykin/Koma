/**
 * ee-bin 配置
 * 与 electron-egg 参考工程保持同构
 */
module.exports = {
  dev: {
    frontend: {
      directory: '../frontend',
      cmd: 'npm',
      args: ['run', 'dev'],
      port: 5173,
    },
    electron: {
      directory: './',
      cmd: 'electron',
      args: ['.', '--env=local'],
      watch: false,
      delay: 2000,
    },
  },

  build: {
    frontend: {
      directory: '../frontend',
      cmd: 'npm',
      args: ['run', 'build'],
    },
    electron: {
      type: 'typescript',
      bundler: 'esbuild',
      bundleType: 'bundle',
      typescript: {
        entryPoints: ['./src/**/*.ts'],
        tsconfig: './tsconfig.json',
        platform: 'node',
        format: 'cjs',
        bundle: false,
        minify: false,
        outdir: 'public/electron',
        packages: 'external',
        sourcemap: false,
        sourcesContent: false,
      },
    },
    win64: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder.json', '-w=nsis', '--x64'],
    },
    mac: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder-mac.json', '-m'],
    },
    linux: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder-linux.json', '-l=deb', '--x64'],
    },
  },

  move: {
    frontend_dist: {
      src: '../public/dist',
      dest: './public/dist',
    },
  },

  start: {
    directory: './',
    cmd: 'electron',
    args: ['public/electron/main.js', '--env=prod'],
  },
};
