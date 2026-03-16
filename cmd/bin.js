/**
 * ee-bin configuration
 */
module.exports = {
  dev: {
    frontend: {
      directory: './frontend',
      cmd: 'npm',
      args: ['run', 'dev'],
      protocol: 'http://',
      hostname: 'localhost',
      port: 5173,
      indexPath: 'index.html',
      force: false,
      sync: false,
    },
    electron: {
      directory: './',
      cmd: 'electron',
      args: ['.', '--env=local', '--debuger=false'],
      loadingPage: '',
      watch: false,
      sync: false,
      delay: 1000,
    },
  },

  build: {
    frontend: {
      directory: './frontend',
      cmd: 'npm',
      args: ['run', 'build'],
    },
    electron: {
      type: 'typescript',
      bundler: 'esbuild',
      bundleType: 'bundle',
      typescript: {
        entryPoints: ['./electron/**/*.ts'],
        tsconfig: './electron/tsconfig.json',
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
    win_e: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder.json', '-w=portable', '--x64'],
    },
    mac: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder-mac.json', '-m'],
    },
    mac_arm64: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder-mac-arm64.json', '-m', '--arm64'],
    },
    linux: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder-linux.json', '-l=deb', '--x64'],
    },
  },

  move: {
    frontend_dist: {
      src: './frontend/dist',
      dest: './public/dist',
    },
  },

  encrypt: {
    frontend: {
      type: 'none',
      files: [
        './public/dist/**/*.(js|json)',
      ],
      cleanFiles: ['./public/dist'],
      confusionOptions: {
        compact: true,
        stringArray: true,
        stringArrayEncoding: ['none'],
        stringArrayCallsTransform: true,
        numbersToExpressions: true,
        target: 'browser',
      },
    },
    electron: {
      type: 'confusion',
      files: [
        './public/electron/**/*.(js|json)',
      ],
      cleanFiles: ['./public/electron'],
      specificFiles: [
        './public/electron/main.js',
        './public/electron/src/preload/index.js',
      ],
      confusionOptions: {
        compact: true,
        stringArray: true,
        stringArrayEncoding: ['none'],
        deadCodeInjection: false,
        stringArrayCallsTransform: true,
        numbersToExpressions: true,
        target: 'node',
      },
    },
  },

  start: {
    directory: './',
    cmd: 'electron',
    args: ['.', '--env=prod'],
  },
};
