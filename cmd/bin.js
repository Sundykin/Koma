/**
 * ee-bin configuration
 * Development environment only
 */
module.exports = {
  /**
   * development serve ("frontend" "electron")
   * ee-bin dev
   */
  dev: {
    frontend: {
      directory: './frontend',
      cmd: 'npm',
      args: ['run', 'dev'],
      port: 5173,
    },
    electron: {
      directory: './',
      cmd: 'electron',
      args: ['.', '--env=local'],
      watch: true,
      delay: 1000,
      env: { NO_COLOR: '1', FORCE_COLOR: '0' },
    }
  },

  /**
   * build
   * ee-bin build
   */
  build: {
    frontend: {
      directory: './frontend',
      cmd: 'npm',
      args: ['run', 'build'],
    },
    electron: {
      type: 'typescript',
    },
    win64: {
      cmd: 'electron-builder',
      directory: './',
      args: ['--config=./cmd/builder.json', '-w=nsis', '--x64'],
    },
    win32: {
      args: ['--config=./cmd/builder.json', '-w=nsis', '--ia32'],
    },
    win_e: {
      args: ['--config=./cmd/builder.json', '-w=portable', '--x64'],
    },
    mac: {
      args: ['--config=./cmd/builder-mac.json', '-m'],
    },
    mac_arm64: {
      args: ['--config=./cmd/builder-mac-arm64.json', '-m', '--arm64'],
    },
    linux: {
      args: ['--config=./cmd/builder-linux.json', '-l=deb', '--x64'],
    },
    linux_arm64: {
      args: ['--config=./cmd/builder-linux.json', '-l=deb', '--arm64'],
    },
  },

  /**
   * move resources
   * ee-bin move
   */
  move: {
    frontend_dist: {
      src: './frontend/dist',
      dest: './public/dist'
    },
  },

  /**
   * pre-release mode (prod)
   * ee-bin start
   */
  start: {
    directory: './',
    cmd: 'electron',
    args: ['.', '--env=prod']
  },

  /**
   * encrypt
   */
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
      }
    },
    electron: {
      type: 'confusion',
      files: [
        './public/electron/**/*.(js|json)',
      ],
      cleanFiles: ['./public/electron'],
      specificFiles: [
        './public/electron/main.js',
        './public/electron/preload/bridge.js',
      ],
      confusionOptions: {
        compact: true,
        stringArray: true,
        stringArrayEncoding: ['none'],
        deadCodeInjection: false,
        stringArrayCallsTransform: true,
        numbersToExpressions: true,
        target: 'node',
      }
    }
  },
};
