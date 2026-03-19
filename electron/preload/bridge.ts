/**
 * Electron-Egg 预加载脚本 (TypeScript)
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

type Listener = (event: IpcRendererEvent, ...args: any[]) => void;

const ALLOWED_INVOKE_CHANNELS = new Set([
  'chat:session:create', 'chat:session:get', 'chat:session:dispose',
  'chat:session:list', 'chat:session:updateConfig',
  'chat:message:send', 'chat:message:sendStream', 'chat:message:cancel',
  'chat:mcp:connect', 'chat:mcp:disconnect', 'chat:mcp:list',
  'chat:mcp:listTools', 'chat:mcp:callTool', 'chat:mcp:importConfig', 'chat:mcp:exportConfig',
  'chat:tool:approve', 'chat:tool:reject', 'chat:tool:listPending',
  'chat:tools:list', 'chat:tools:call',
  'chat:capability:list', 'chat:capability:invoke', 'chat:capability:resolve',
  // controller/* 显式白名单
  'controller/window/minimize', 'controller/window/maximize',
  'controller/window/close', 'controller/window/isMaximized',
  'controller/dialog/openFile', 'controller/dialog/openDirectory',
  'controller/dialog/saveFile',
  'controller/fs/readFile', 'controller/fs/readFileAsBase64',
  'controller/fs/writeFile', 'controller/fs/downloadFile',
  'controller/fs/exists', 'controller/fs/mkdir', 'controller/fs/readdir',
  'controller/fs/stat', 'controller/fs/remove', 'controller/fs/copy',
  'controller/app/openExternal', 'controller/app/showItemInFolder',
  'controller/app/getPath', 'controller/app/getVersion',
  'controller/project/list', 'controller/project/create',
  'controller/project/load', 'controller/project/save',
  'controller/project/update', 'controller/project/delete',
  'controller/project/rebuildIndex', 'controller/project/export',
  'controller/project/import',
  'controller/ffmpeg/isAvailable', 'controller/ffmpeg/getInfo',
  'controller/ffmpeg/extractFrames', 'controller/ffmpeg/waveform',
  'controller/ffmpeg/splitAudio', 'controller/ffmpeg/composeVideo',
  'controller/ffmpeg/getCacheDir', 'controller/ffmpeg/getTempDir',
  'controller/ffmpeg/ensureDir', 'controller/ffmpeg/saveFrame',
  'controller/ffmpeg/cleanupTemp', 'controller/ffmpeg/clearCache',
  'controller/ffmpeg/cancelTask', 'controller/ffmpeg/clearQueue',
  'controller/plugin/validate', 'controller/plugin/install',
  'controller/plugin/uninstall', 'controller/plugin/list',
  'controller/plugin/openFolder',
  'controller/net/fetch',
]);

const ALLOWED_LISTEN_CHANNELS = new Set([
  'chat:stream:chunk', 'chat:stream:tool', 'chat:stream:done', 'chat:stream:error',
  'chat:tool:pending', 'chat:tool:approved', 'chat:tool:rejected',
]);

function validateInvokeChannel(channel: string): void {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    throw new Error(`IPC channel not allowed: ${channel}`);
  }
}

function validateListenChannel(channel: string): void {
  if (!ALLOWED_LISTEN_CHANNELS.has(channel)) {
    throw new Error(`IPC listen channel not allowed: ${channel}`);
  }
}

function invokeMain(channel: string, args?: any) {
  validateInvokeChannel(channel);
  return ipcRenderer.invoke(channel, args);
}

const ipc = {
  invoke: (channel: string, args?: any) => {
    return invokeMain(channel, args);
  },
  on: (channel: string, listener: Listener) => {
    validateListenChannel(channel);
    ipcRenderer.on(channel, listener);
  },
  once: (channel: string, listener: Listener) => {
    validateListenChannel(channel);
    ipcRenderer.once(channel, listener);
  },
  removeListener: (channel: string, listener: Listener) => {
    ipcRenderer.removeListener(channel, listener);
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

const isEE = true;

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: ipc,
  isEE,
});

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => invokeMain('controller/window/minimize'),
    maximize: () => invokeMain('controller/window/maximize'),
    close: () => invokeMain('controller/window/close'),
    isMaximized: () => invokeMain('controller/window/isMaximized'),
  },
  dialog: {
    openFile: (options?: any) => invokeMain('controller/dialog/openFile', options),
    openDirectory: () => invokeMain('controller/dialog/openDirectory', {}),
    saveFile: (options?: any) => invokeMain('controller/dialog/saveFile', options),
  },
  fs: {
    readFile: (path: string) => invokeMain('controller/fs/readFile', { filePath: path }),
    readFileAsBase64: (path: string) => invokeMain('controller/fs/readFileAsBase64', { filePath: path }),
    writeFile: (path: string, data: string, binary?: boolean) =>
      invokeMain('controller/fs/writeFile', { filePath: path, data, binary }),
    downloadFile: (url: string, destPath: string) =>
      invokeMain('controller/fs/downloadFile', { url, destPath }),
    exists: (path: string) => invokeMain('controller/fs/exists', { filePath: path }),
    mkdir: (path: string) => invokeMain('controller/fs/mkdir', { dirPath: path }),
    readdir: (path: string) => invokeMain('controller/fs/readdir', { dirPath: path }),
    stat: (path: string) => invokeMain('controller/fs/stat', { filePath: path }),
    remove: (path: string) => invokeMain('controller/fs/remove', { filePath: path }),
    copy: (src: string, dest: string) => invokeMain('controller/fs/copy', { src, dest }),
  },
  shell: {
    openExternal: (url: string) => invokeMain('controller/app/openExternal', { url }),
    showItemInFolder: (path: string) => invokeMain('controller/app/showItemInFolder', { filePath: path }),
  },
  app: {
    getPath: (name: string) => invokeMain('controller/app/getPath', { name }),
    getVersion: () => invokeMain('controller/app/getVersion', {}),
  },
  project: {
    list: () => invokeMain('controller/project/list', {}),
    create: (meta: any) => invokeMain('controller/project/create', meta),
    load: (projectId: string) => invokeMain('controller/project/load', { projectId }),
    save: (projectId: string, data: any) => invokeMain('controller/project/save', { projectId, data }),
    update: (projectId: string, updates: any) =>
      invokeMain('controller/project/update', { projectId, updates }),
    remove: (projectId: string) => invokeMain('controller/project/delete', { projectId }),
    rebuildIndex: () => invokeMain('controller/project/rebuildIndex', {}),
    export: (projectId: string, destPath: string, options?: any) =>
      invokeMain('controller/project/export', { projectId, destPath, options }),
    import: (zipPath: string, newProjectId?: string) =>
      invokeMain('controller/project/import', { zipPath, newProjectId }),
  },
  ffmpeg: {
    isAvailable: () => invokeMain('controller/ffmpeg/isAvailable', {}),
    getInfo: (input: string) => invokeMain('controller/ffmpeg/getInfo', { input }),
    extractFrames: (options: any) => invokeMain('controller/ffmpeg/extractFrames', options),
    waveform: (options: any) => invokeMain('controller/ffmpeg/waveform', options),
    splitAudio: (input: string, output: string) =>
      invokeMain('controller/ffmpeg/splitAudio', { input, output }),
    composeVideo: (options: any) => invokeMain('controller/ffmpeg/composeVideo', options),
    getCacheDir: (subDir?: string) => invokeMain('controller/ffmpeg/getCacheDir', { subDir }),
    getTempDir: () => invokeMain('controller/ffmpeg/getTempDir', {}),
    ensureDir: (dirPath: string) => invokeMain('controller/ffmpeg/ensureDir', { dirPath }),
    saveFrame: (filePath: string, dataUrl: string) =>
      invokeMain('controller/ffmpeg/saveFrame', { filePath, dataUrl }),
    cleanupTemp: (tempDir: string) => invokeMain('controller/ffmpeg/cleanupTemp', { tempDir }),
    clearCache: (subDir?: string) => invokeMain('controller/ffmpeg/clearCache', { subDir }),
    cancelTask: () => invokeMain('controller/ffmpeg/cancelTask', {}),
    clearQueue: () => invokeMain('controller/ffmpeg/clearQueue', {}),
  },
  plugin: {
    validate: (zipPath: string) => invokeMain('controller/plugin/validate', { zipPath }),
    install: (zipPath: string, manifest: any) =>
      invokeMain('controller/plugin/install', { zipPath, manifest }),
    uninstall: (pluginPath: string) => invokeMain('controller/plugin/uninstall', { pluginPath }),
    list: () => invokeMain('controller/plugin/list', {}),
    openFolder: (pluginPath: string) => invokeMain('controller/plugin/openFolder', { pluginPath }),
  },
  net: {
    fetch: (args: { url: string; method?: string; headers?: Record<string, string>; body?: string }) =>
      invokeMain('controller/net/fetch', args),
  },
  chat: {
    // 会话管理
    createSession: (config?: any) => invokeMain('chat:session:create', { config }),
    getSession: (sessionId: string) => invokeMain('chat:session:get', { sessionId }),
    disposeSession: (sessionId: string) => invokeMain('chat:session:dispose', { sessionId }),
    listSessions: (windowId?: number) => invokeMain('chat:session:list', { windowId }),
    updateSessionConfig: (sessionId: string, config: any) =>
      invokeMain('chat:session:updateConfig', { sessionId, config }),

    // 消息发送
    sendMessage: (sessionId: string, input: any, options?: any) =>
      invokeMain('chat:message:send', { sessionId, input, options }),
    sendMessageStream: (sessionId: string, input: any, options?: any) =>
      invokeMain('chat:message:sendStream', { sessionId, input, options }),
    cancelStream: (requestIdOrSessionId: string) =>
      invokeMain('chat:message:cancel', { sessionId: requestIdOrSessionId }),

    // 流式事件监听
    onStreamChunk: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('chat:stream:chunk', callback);
      return () => ipcRenderer.removeListener('chat:stream:chunk', callback);
    },
    onStreamTool: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('chat:stream:tool', callback);
      return () => ipcRenderer.removeListener('chat:stream:tool', callback);
    },
    onStreamDone: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('chat:stream:done', callback);
      return () => ipcRenderer.removeListener('chat:stream:done', callback);
    },
    onStreamError: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('chat:stream:error', callback);
      return () => ipcRenderer.removeListener('chat:stream:error', callback);
    },

    // MCP 管理
    mcp: {
      connect: (config: any) => invokeMain('chat:mcp:connect', { config }),
      disconnect: (name: string) => invokeMain('chat:mcp:disconnect', { name }),
      list: (includeTools?: boolean) => invokeMain('chat:mcp:list', { includeTools }),
      listTools: () => invokeMain('chat:mcp:listTools', {}),
      callTool: (name: string, args: any) => invokeMain('chat:mcp:callTool', { name, arguments: args }),
      importConfig: (args: any) => invokeMain('chat:mcp:importConfig', args),
      exportConfig: (args?: any) => invokeMain('chat:mcp:exportConfig', args),
    },

    // 工具调用审批
    toolApproval: {
      approve: (callId: string) => invokeMain('chat:tool:approve', { callId }),
      reject: (callId: string, reason?: string) => invokeMain('chat:tool:reject', { callId, reason }),
      listPending: (sessionId?: string) => invokeMain('chat:tool:listPending', { sessionId }),
      onPending: (callback: (event: any, data: any) => void) => {
        ipcRenderer.on('chat:tool:pending', callback);
        return () => ipcRenderer.removeListener('chat:tool:pending', callback);
      },
      onApproved: (callback: (event: any, data: any) => void) => {
        ipcRenderer.on('chat:tool:approved', callback);
        return () => ipcRenderer.removeListener('chat:tool:approved', callback);
      },
      onRejected: (callback: (event: any, data: any) => void) => {
        ipcRenderer.on('chat:tool:rejected', callback);
        return () => ipcRenderer.removeListener('chat:tool:rejected', callback);
      },
    },

    // 统一工具（合并外部 MCP + 插件内部 MCP）
    tools: {
      list: () => invokeMain('chat:tools:list', {}),
      call: (name: string, args: any) => invokeMain('chat:tools:call', { name, arguments: args }),
    },

    // 统一能力查询
    capability: {
      list: (filter?: any) => invokeMain('chat:capability:list', filter),
      invoke: (id: string, args: any) => invokeMain('chat:capability:invoke', { id, arguments: args }),
      resolve: (requirements: string[]) => invokeMain('chat:capability:resolve', { requirements }),
    },
  },
});
