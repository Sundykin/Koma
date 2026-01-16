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
    writeFile: (path: string, data: string) => ipcRenderer.invoke('fs:writeFile', path, data),
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
    export: (projectId: string, destPath: string, options?: any) =>
      ipcRenderer.invoke('controller', 'controller.project.export', { projectId, destPath, options }),
    import: (zipPath: string, newProjectId?: string) =>
      ipcRenderer.invoke('controller', 'controller.project.import', { zipPath, newProjectId }),
  },
});
