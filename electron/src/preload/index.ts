/**
 * Electron-Egg 预加载脚本 (TypeScript)
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const invokeRpcRaw = (channel: string, args?: Record<string, unknown>) =>
  ipcRenderer.invoke('rpc:invoke', { channel, args });

const invokeRpc = async (channel: string, args?: Record<string, unknown>) => {
  const response = await invokeRpcRaw(channel, args);
  if (response?.ok) {
    return response.data;
  }

  const message = response?.error?.message || `RPC failed: ${channel}`;
  const error = new Error(message) as Error & { code?: string; details?: unknown };
  error.code = response?.error?.code;
  error.details = response?.error?.details;
  throw error;
};

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => invokeRpc('window:minimize'),
    maximize: () => invokeRpc('window:maximize'),
    close: () => invokeRpc('window:close'),
    isMaximized: () => invokeRpc('window:isMaximized'),
  },
  dialog: {
    openFile: (options?: any) => invokeRpc('dialog:openFile', options),
    openDirectory: () => invokeRpc('dialog:openDirectory'),
    saveFile: (options?: any) => invokeRpc('dialog:saveFile', options),
  },
  fs: {
    readFile: (path: string) => invokeRpc('fs:readFile', { filePath: path }),
    writeFile: (path: string, data: string, binary?: boolean) =>
      invokeRpc('fs:writeFile', { filePath: path, data, binary }),
    downloadFile: (url: string, destPath: string) => invokeRpc('fs:downloadFile', { url, destPath }),
    exists: (path: string) => invokeRpc('fs:exists', { filePath: path }),
    mkdir: (path: string) => invokeRpc('fs:mkdir', { dirPath: path }),
    readdir: (path: string) => invokeRpc('fs:readdir', { dirPath: path }),
    stat: (path: string) => invokeRpc('fs:stat', { filePath: path }),
    remove: (path: string) => invokeRpc('fs:remove', { filePath: path }),
    copy: (src: string, dest: string) => invokeRpc('fs:copy', { src, dest }),
  },
  shell: {
    openExternal: (url: string) => invokeRpc('app:openExternal', { url }),
    showItemInFolder: (path: string) => invokeRpc('app:showItemInFolder', { filePath: path }),
  },
  app: {
    getPath: (name: string) => invokeRpc('app:getPath', { name }),
    getVersion: () => invokeRpc('app:getVersion'),
  },
  project: {
    list: () => invokeRpc('project:list'),
    create: (meta: any) => invokeRpc('project:create', meta),
    load: (projectId: string) => invokeRpc('project:load', { projectId }),
    save: (projectId: string, data: any) => invokeRpc('project:save', { projectId, data }),
    update: (projectId: string, updates: any) => invokeRpc('project:update', { projectId, updates }),
    remove: (projectId: string) => invokeRpc('project:delete', { projectId }),
    rebuildIndex: () => invokeRpc('project:rebuildIndex'),
    export: (projectId: string, destPath: string, options?: any) =>
      invokeRpc('project:export', { projectId, destPath, options }),
    import: (zipPath: string, newProjectId?: string) => invokeRpc('project:import', { zipPath, newProjectId }),
  },
  ffmpeg: {
    isAvailable: () => invokeRpc('ffmpeg:isAvailable'),
    getInfo: (input: string) => invokeRpc('ffmpeg:getInfo', { input }),
    extractFrames: (options: any) => invokeRpc('ffmpeg:extractFrames', options),
    waveform: (options: any) => invokeRpc('ffmpeg:waveform', options),
    splitAudio: (input: string, output: string) => invokeRpc('ffmpeg:splitAudio', { input, output }),
    getCacheDir: (subDir?: string) => invokeRpc('ffmpeg:getCacheDir', { subDir }),
    clearCache: (subDir?: string) => invokeRpc('ffmpeg:clearCache', { subDir }),
    cancelTask: () => invokeRpc('ffmpeg:cancelTask'),
    clearQueue: () => invokeRpc('ffmpeg:clearQueue'),
    encodeVideo: (options: any) => invokeRpc('ffmpeg:encodeVideo', options),
    saveFrames: (frames: string[], subDir?: string) => invokeRpc('ffmpeg:saveFrames', { frames, subDir }),
  },
  plugin: {
    validate: (zipPath: string) => invokeRpc('plugin:validate', { zipPath }),
    install: (zipPath: string, manifest: any) => invokeRpc('plugin:install', { zipPath, manifest }),
    uninstall: (pluginPath: string) => invokeRpc('plugin:uninstall', { pluginPath }),
    list: () => invokeRpc('plugin:list'),
    openFolder: (pluginPath: string) => invokeRpc('plugin:openFolder', { pluginPath }),
    activate: (manifest: any) => invokeRpc('plugin:activate', { manifest }),
    deactivate: (pluginId: string) => invokeRpc('plugin:deactivate', { pluginId }),
    status: (pluginId: string) => invokeRpc('plugin:status', { pluginId }),
    listActive: () => invokeRpc('plugin:listActive'),
    listMCPTools: () => invokeRpc('plugin:listMCPTools'),
    listAgents: () => invokeRpc('plugin:listAgents'),
    listProviderStatus: (kind?: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting') =>
      invokeRpc('plugin:listProviderStatus', { kind }),
    testProvider: (
      kind: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting',
      type: string,
      config: Record<string, unknown>
    ) => invokeRpc('plugin:testProvider', { kind, type, config }),
    listRuntimeStates: () => invokeRpc('plugin:listRuntimeStates'),
    getRuntimeState: (pluginId: string) => invokeRpc('plugin:getRuntimeState', { pluginId }),
  },
  config: {
    get: (moduleId: string) => invokeRpc('config:get', { moduleId }),
    set: (moduleId: string, payload: any) => invokeRpc('config:set', { moduleId, payload }),
    reset: (moduleId: string) => invokeRpc('config:reset', { moduleId }),
    list: () => invokeRpc('config:list'),
    import: (moduleId: string, payload?: unknown, filePath?: string) =>
      invokeRpc('config:import', { moduleId, payload, filePath }),
    export: (moduleId: string, filePath?: string) => invokeRpc('config:export', { moduleId, filePath }),
  },
  workflow: {
    start: (definition: any, context?: any) => invokeRpc('workflow:start', { definition, context }),
    pause: (runId: string) => invokeRpc('workflow:pause', { runId }),
    resume: (runId: string) => invokeRpc('workflow:resume', { runId }),
    cancel: (runId: string) => invokeRpc('workflow:cancel', { runId }),
    approve: (runId: string, nodeId: string) => invokeRpc('workflow:approve', { runId, nodeId }),
    getRun: (runId: string) => invokeRpc('workflow:getRun', { runId }),
    listRuns: () => invokeRpc('workflow:listRuns'),
    onEvent: (event: string, callback: (event: any, data: any) => void) => {
      const channel = `workflow:${event}`;
      ipcRenderer.on(channel, callback);
      return () => ipcRenderer.removeListener(channel, callback);
    },
    onDelegate: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('workflow:delegate', callback);
      return () => ipcRenderer.removeListener('workflow:delegate', callback);
    },
    sendDelegateResult: (delegateId: string, result: any, error?: string) =>
      invokeRpc('workflow:delegateResult', { delegateId, result, error }),
  },
  chat: {
    createSession: (config?: any) => invokeRpc('chat:createSession', { config }),
    getSession: (sessionId: string) => invokeRpc('chat:getSession', { sessionId }),
    disposeSession: (sessionId: string) => invokeRpc('chat:disposeSession', { sessionId }),
    listSessions: (windowId?: number) => invokeRpc('chat:listSessions', { windowId }),
    updateSessionConfig: (sessionId: string, config: any) =>
      invokeRpc('chat:updateSessionConfig', { sessionId, config }),
    sendMessage: (sessionId: string, input: any, options?: any) =>
      invokeRpc('chat:sendMessage', { sessionId, input, options }),
    sendMessageStream: (sessionId: string, input: any, options?: any) =>
      invokeRpc('chat:sendMessageStream', { sessionId, input, options }),
    cancelStream: (requestIdOrSessionId: string) =>
      invokeRpc('chat:cancelStream', { sessionId: requestIdOrSessionId }),
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
    mcp: {
      connect: (config: any) => invokeRpc('chat:connectMCP', { config }),
      disconnect: (name: string) => invokeRpc('chat:disconnectMCP', { name }),
      list: (includeTools?: boolean) => invokeRpc('chat:listMCP', { includeTools }),
      listTools: () => invokeRpc('chat:listMCPTools'),
      listResources: () => invokeRpc('chat:listMCPResources'),
      readResource: (uri: string) => invokeRpc('chat:readMCPResource', { uri }),
      callTool: (name: string, args: any) => invokeRpc('chat:callMCPTool', { name, arguments: args }),
      importConfig: (args: any) => invokeRpc('chat:importMCPConfig', args),
      exportConfig: (args?: any) => invokeRpc('chat:exportMCPConfig', args),
    },
    tools: {
      list: () => invokeRpc('chat:listTools'),
      call: (name: string, args: any) => invokeRpc('chat:callTool', { name, arguments: args }),
    },
    capability: {
      list: (filter?: any) => invokeRpc('chat:listCapabilities', filter),
      invoke: (id: string, args: any) => invokeRpc('chat:invokeCapability', { id, arguments: args }),
      resolve: (requirements: string[]) => invokeRpc('chat:resolveCapabilities', { requirements }),
    },
    history: {
      loadMessages: (sessionId: string) => invokeRpc('chat:loadHistory', { sessionId }),
      saveMessages: (data: any) => invokeRpc('chat:saveHistory', data),
      deleteMessages: (sessionId: string) => invokeRpc('chat:deleteHistory', { sessionId }),
    },
  },
  persistence: {
    list: (projectId: string, entity: string) =>
      invokeRpc('persistence:list', { projectId, entity }),
    find: (projectId: string, entity: string, query?: Record<string, unknown>) =>
      invokeRpc('persistence:find', { projectId, entity, query }),
    findById: (projectId: string, entity: string, id: string) =>
      invokeRpc('persistence:findById', { projectId, entity, id }),
    save: (projectId: string, entity: string, data: any) =>
      invokeRpc('persistence:save', { projectId, entity, data }),
    delete: (projectId: string, entity: string, id: string) =>
      invokeRpc('persistence:delete', { projectId, entity, id }),
    batchSave: (projectId: string, operations: Array<{ entity: string; data: unknown }>) =>
      invokeRpc('persistence:batchSave', { projectId, operations }),
  },
  eventBus: {
    emit: (event: string, payload?: unknown) => invokeRpc('event:emit', { event, payload }),
    subscribe: (event: string) => invokeRpc('event:subscribe', { event }),
    unsubscribe: (event?: string) => invokeRpc('event:unsubscribe', { event }),
    onMessage: (callback: (data: { event: string; payload?: unknown }) => void) => {
      const listener = (_event: IpcRendererEvent, data: { event: string; payload?: unknown }) => callback(data);
      ipcRenderer.on('event:message', listener);
      return () => ipcRenderer.removeListener('event:message', listener);
    },
  },
});
