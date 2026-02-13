/**
 * Electron-Egg 预加载脚本 (TypeScript)
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

type Listener = (event: IpcRendererEvent, ...args: any[]) => void;

const ipc = {
  invoke: (channel: string, args?: any) => {
    if (channel.startsWith('controller.')) {
      return ipcRenderer.invoke('controller', channel, args);
    }
    return ipcRenderer.invoke(channel, args);
  },
  sendSync: (channel: string, args?: any) => ipcRenderer.sendSync(channel, args),
  on: (channel: string, listener: Listener) => {
    ipcRenderer.on(channel, listener);
  },
  once: (channel: string, listener: Listener) => {
    ipcRenderer.once(channel, listener);
  },
  removeListener: (channel: string, listener: Listener) => {
    ipcRenderer.removeListener(channel, listener);
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args);
  },
};

const isEE = true;

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: ipc,
  isEE,
});

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },
  dialog: {
    openFile: (options?: any) => ipcRenderer.invoke('dialog:openFile', options),
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    saveFile: (options?: any) => ipcRenderer.invoke('dialog:saveFile', options),
  },
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path: string, data: string, binary?: boolean) => ipcRenderer.invoke('fs:writeFile', path, data, binary),
    downloadFile: (url: string, destPath: string) => ipcRenderer.invoke('fs:downloadFile', url, destPath),
    exists: (path: string) => ipcRenderer.invoke('fs:exists', path),
    mkdir: (path: string) => ipcRenderer.invoke('fs:mkdir', path),
    readdir: (path: string) => ipcRenderer.invoke('fs:readdir', path),
    stat: (path: string) => ipcRenderer.invoke('fs:stat', path),
    remove: (path: string) => ipcRenderer.invoke('fs:remove', path),
    copy: (src: string, dest: string) => ipcRenderer.invoke('fs:copy', src, dest),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
  },
  app: {
    getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  project: {
    list: () => ipcRenderer.invoke('controller', 'controller.project.list'),
    create: (meta: any) => ipcRenderer.invoke('controller', 'controller.project.create', meta),
    load: (projectId: string) => ipcRenderer.invoke('controller', 'controller.project.load', { projectId }),
    save: (projectId: string, data: any) => ipcRenderer.invoke('controller', 'controller.project.save', { projectId, data }),
    update: (projectId: string, updates: any) => ipcRenderer.invoke('controller', 'controller.project.update', { projectId, updates }),
    remove: (projectId: string) => ipcRenderer.invoke('controller', 'controller.project.delete', { projectId }),
    rebuildIndex: () => ipcRenderer.invoke('controller', 'controller.project.rebuildIndex'),
    export: (projectId: string, destPath: string, options?: any) =>
      ipcRenderer.invoke('controller', 'controller.project.export', { projectId, destPath, options }),
    import: (zipPath: string, newProjectId?: string) =>
      ipcRenderer.invoke('controller', 'controller.project.import', { zipPath, newProjectId }),
  },
  ffmpeg: {
    isAvailable: () => ipcRenderer.invoke('controller', 'controller.ffmpeg.isAvailable'),
    getInfo: (input: string) => ipcRenderer.invoke('controller', 'controller.ffmpeg.getInfo', { input }),
    extractFrames: (options: any) => ipcRenderer.invoke('controller', 'controller.ffmpeg.extractFrames', options),
    waveform: (options: any) => ipcRenderer.invoke('controller', 'controller.ffmpeg.waveform', options),
    splitAudio: (input: string, output: string) =>
      ipcRenderer.invoke('controller', 'controller.ffmpeg.splitAudio', { input, output }),
    getCacheDir: (subDir?: string) => ipcRenderer.invoke('controller', 'controller.ffmpeg.getCacheDir', { subDir }),
    clearCache: (subDir?: string) => ipcRenderer.invoke('controller', 'controller.ffmpeg.clearCache', { subDir }),
    cancelTask: () => ipcRenderer.invoke('controller', 'controller.ffmpeg.cancelTask'),
    clearQueue: () => ipcRenderer.invoke('controller', 'controller.ffmpeg.clearQueue'),
  },
  plugin: {
    validate: (zipPath: string) => ipcRenderer.invoke('plugin:validate', zipPath),
    install: (zipPath: string, manifest: any) => ipcRenderer.invoke('plugin:install', { zipPath, manifest }),
    uninstall: (pluginPath: string) => ipcRenderer.invoke('plugin:uninstall', pluginPath),
    list: () => ipcRenderer.invoke('plugin:list'),
    openFolder: (pluginPath: string) => ipcRenderer.invoke('plugin:openFolder', pluginPath),
  },
  config: {
    get: (moduleId: string) => ipcRenderer.invoke('config:get', { moduleId }),
    set: (moduleId: string, payload: any) => ipcRenderer.invoke('config:set', { moduleId, payload }),
    reset: (moduleId: string) => ipcRenderer.invoke('config:reset', { moduleId }),
    list: () => ipcRenderer.invoke('config:list'),
  },
  workflow: {
    start: (definition: any, context?: any) => ipcRenderer.invoke('workflow:start', { definition, context }),
    pause: (runId: string) => ipcRenderer.invoke('workflow:pause', { runId }),
    resume: (runId: string) => ipcRenderer.invoke('workflow:resume', { runId }),
    cancel: (runId: string) => ipcRenderer.invoke('workflow:cancel', { runId }),
    approve: (runId: string, nodeId: string) => ipcRenderer.invoke('workflow:approve', { runId, nodeId }),
    getRun: (runId: string) => ipcRenderer.invoke('workflow:getRun', { runId }),
    listRuns: () => ipcRenderer.invoke('workflow:listRuns'),
    // 事件监听
    onEvent: (event: string, callback: (event: any, data: any) => void) => {
      const channel = `workflow:${event}`;
      ipcRenderer.on(channel, callback);
      return () => ipcRenderer.removeListener(channel, callback);
    },
    // 委托执行：监听后端发来的执行请求
    onDelegate: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('workflow:delegate', callback);
      return () => ipcRenderer.removeListener('workflow:delegate', callback);
    },
    // 委托结果回传
    sendDelegateResult: (delegateId: string, result: any, error?: string) => {
      ipcRenderer.send('workflow:delegate-result', { delegateId, result, error });
    },
  },
  chat: {
    // 会话管理
    createSession: (config?: any) => ipcRenderer.invoke('chat:session:create', { config }),
    getSession: (sessionId: string) => ipcRenderer.invoke('chat:session:get', { sessionId }),
    disposeSession: (sessionId: string) => ipcRenderer.invoke('chat:session:dispose', { sessionId }),
    listSessions: (windowId?: number) => ipcRenderer.invoke('chat:session:list', { windowId }),
    updateSessionConfig: (sessionId: string, config: any) =>
      ipcRenderer.invoke('chat:session:updateConfig', { sessionId, config }),

    // 消息发送
    sendMessage: (sessionId: string, input: any, options?: any) =>
      ipcRenderer.invoke('chat:message:send', { sessionId, input, options }),
    sendMessageStream: (sessionId: string, input: any, options?: any) =>
      ipcRenderer.invoke('chat:message:sendStream', { sessionId, input, options }),
    cancelStream: (requestIdOrSessionId: string) =>
      ipcRenderer.invoke('chat:message:cancel', { sessionId: requestIdOrSessionId }),

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
      connect: (config: any) => ipcRenderer.invoke('chat:mcp:connect', { config }),
      disconnect: (name: string) => ipcRenderer.invoke('chat:mcp:disconnect', { name }),
      list: (includeTools?: boolean) => ipcRenderer.invoke('chat:mcp:list', { includeTools }),
      listTools: () => ipcRenderer.invoke('chat:mcp:listTools'),
      callTool: (name: string, args: any) => ipcRenderer.invoke('chat:mcp:callTool', { name, arguments: args }),
      importConfig: (args: any) => ipcRenderer.invoke('chat:mcp:importConfig', args),
      exportConfig: (args?: any) => ipcRenderer.invoke('chat:mcp:exportConfig', args),
    },

    // 统一工具（合并外部 MCP + 插件内部 MCP）
    tools: {
      list: () => ipcRenderer.invoke('chat:tools:list'),
      call: (name: string, args: any) => ipcRenderer.invoke('chat:tools:call', { name, arguments: args }),
    },

    // 统一能力查询
    capability: {
      list: (filter?: any) => ipcRenderer.invoke('chat:capability:list', filter),
      invoke: (id: string, args: any) => ipcRenderer.invoke('chat:capability:invoke', { id, arguments: args }),
      resolve: (requirements: string[]) => ipcRenderer.invoke('chat:capability:resolve', { requirements }),
    },
  },
});
