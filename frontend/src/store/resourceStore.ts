/**
 * 资源状态管理
 * 管理编辑器中的媒体资源（视频、音频、图片）
 */
import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  Resource,
  ResourceFilter,
  ResourceSort,
  createResource,
  updateResource,
  detectResourceType
} from '../types/resource';
import { ffmpegManager } from '../services/ffmpegManager';
import { fsStat, fsCopy, fsMkdir } from '../services/electronService';
import { createLogger } from './logger';

const logger = createLogger('ResourceStore');

// Store 状态
interface ResourceState {
  // 数据
  resources: Map<string, Resource>;
  selectedIds: Set<string>;

  // UI 状态
  filter: ResourceFilter;
  sort: ResourceSort;
  viewMode: 'grid' | 'list';
  loading: boolean;
  error: string | null;

  // 项目相关
  projectId: string | null;
  projectPath: string | null;
}

// Store 操作
interface ResourceActions {
  // 初始化
  init: (projectId: string, projectPath: string) => void;
  reset: () => void;

  // 资源 CRUD
  addResource: (resource: Resource) => void;
  removeResource: (id: string) => void;
  updateResource: (id: string, updates: Partial<Resource>) => void;
  getResource: (id: string) => Resource | undefined;

  // 资源导入
  importFile: (filePath: string, options?: {
    copyToProject?: boolean;
    extractFrames?: boolean;
    generateWaveform?: boolean;
  }) => Promise<Resource | null>;
  importFiles: (filePaths: string[], options?: {
    copyToProject?: boolean;
    extractFrames?: boolean;
    generateWaveform?: boolean;
  }) => Promise<Resource[]>;

  // 选择
  selectResource: (id: string) => void;
  deselectResource: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  toggleSelection: (id: string) => void;

  // 过滤/排序
  setFilter: (filter: Partial<ResourceFilter>) => void;
  setSort: (sort: ResourceSort) => void;
  setViewMode: (mode: 'grid' | 'list') => void;

  // 获取过滤后的资源列表
  getFilteredResources: () => Resource[];

  // 引用计数
  incrementRefCount: (id: string) => void;
  decrementRefCount: (id: string) => void;

  // 持久化
  loadFromProject: (data: any) => void;
  saveToProject: () => any;
}

// 初始状态
const initialState: ResourceState = {
  resources: new Map(),
  selectedIds: new Set(),
  filter: {},
  sort: { field: 'createdAt', order: 'desc' },
  viewMode: 'grid',
  loading: false,
  error: null,
  projectId: null,
  projectPath: null
};

// 创建 Store
export const useResourceStore = create<ResourceState & ResourceActions>((set, get) => ({
  ...initialState,

  // 初始化
  init: (projectId, projectPath) => {
    set({
      ...initialState,
      projectId,
      projectPath
    });
  },

  reset: () => {
    set(initialState);
  },

  // 添加资源
  addResource: (resource) => {
    set((state) => {
      const newResources = new Map(state.resources);
      newResources.set(resource.id, resource);
      return { resources: newResources };
    });
  },

  // 删除资源
  removeResource: (id) => {
    set((state) => {
      const newResources = new Map(state.resources);
      newResources.delete(id);
      const newSelectedIds = new Set(state.selectedIds);
      newSelectedIds.delete(id);
      return { resources: newResources, selectedIds: newSelectedIds };
    });
  },

  // 更新资源
  updateResource: (id, updates) => {
    set((state) => {
      const resource = state.resources.get(id);
      if (!resource) return state;

      const newResources = new Map(state.resources);
      newResources.set(id, updateResource(resource, updates));
      return { resources: newResources };
    });
  },

  // 获取资源
  getResource: (id) => {
    return get().resources.get(id);
  },

  // 导入单个文件
  importFile: async (filePath, options = {}) => {
    const { projectPath } = get();
    if (!projectPath) {
      logger.error('No project path');
      return null;
    }

    try {
      // 检测文件类型
      const type = detectResourceType(filePath);
      if (!type) {
        logger.warn('Unknown file type: ' + filePath);
        return null;
      }

      // 获取文件信息
      const stat = await fsStat(filePath);
      if (!stat) {
        logger.error('File not found: ' + filePath);
        return null;
      }

      // 创建资源
      const id = nanoid();
      const name = filePath.split(/[/\\]/).pop() || 'untitled';
      const resource = createResource(id, type, name, filePath, stat.size);

      // 添加到 store
      get().addResource(resource);

      // 更新状态为处理中
      get().updateResource(id, { status: 'processing' });

      // 复制到项目目录
      let localPath = filePath;
      if (options.copyToProject) {
        const resourceDir = `${projectPath}/resources/${type}s`;
        await fsMkdir(resourceDir);
        localPath = `${resourceDir}/${id}_${name}`;
        await fsCopy(filePath, localPath);
        get().updateResource(id, { localPath });
      }

      // 使用 FFmpeg 处理
      try {
        const result = await ffmpegManager.processResource(
          localPath,
          id,
          {
            extractFrames: options.extractFrames && type === 'video',
            generateWaveform: options.generateWaveform && (type === 'audio' || type === 'video'),
            framesFps: 1,
            framesWidth: 320
          }
        );

        // 更新媒体信息
        get().updateResource(id, {
          status: 'ready',
          duration: result.mediaInfo.duration,
          width: result.mediaInfo.width,
          height: result.mediaInfo.height,
          fps: result.mediaInfo.fps,
          format: result.mediaInfo.format,
          thumbnailPath: result.frames?.[0],
          waveformPath: result.waveform,
          framesPath: result.frames ? result.frames[0]?.replace(/[/\\][^/\\]+$/, '') : undefined
        });
      } catch (err) {
        logger.warn('FFmpeg processing failed', err);
        // FFmpeg 处理失败，但资源仍可用
        get().updateResource(id, { status: 'ready' });
      }

      return get().getResource(id) || null;
    } catch (err) {
      logger.error('Import failed', err);
      return null;
    }
  },

  // 批量导入
  importFiles: async (filePaths, options = {}) => {
    const results: Resource[] = [];
    set({ loading: true, error: null });

    for (const filePath of filePaths) {
      const resource = await get().importFile(filePath, options);
      if (resource) {
        results.push(resource);
      }
    }

    set({ loading: false });
    return results;
  },

  // 选择资源
  selectResource: (id) => {
    set((state) => {
      const newSelectedIds = new Set(state.selectedIds);
      newSelectedIds.add(id);
      return { selectedIds: newSelectedIds };
    });
  },

  deselectResource: (id) => {
    set((state) => {
      const newSelectedIds = new Set(state.selectedIds);
      newSelectedIds.delete(id);
      return { selectedIds: newSelectedIds };
    });
  },

  selectAll: () => {
    set((state) => ({
      selectedIds: new Set(state.resources.keys())
    }));
  },

  deselectAll: () => {
    set({ selectedIds: new Set() });
  },

  toggleSelection: (id) => {
    set((state) => {
      const newSelectedIds = new Set(state.selectedIds);
      if (newSelectedIds.has(id)) {
        newSelectedIds.delete(id);
      } else {
        newSelectedIds.add(id);
      }
      return { selectedIds: newSelectedIds };
    });
  },

  // 过滤/排序
  setFilter: (filter) => {
    set((state) => ({
      filter: { ...state.filter, ...filter }
    }));
  },

  setSort: (sort) => {
    set({ sort });
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  // 获取过滤后的资源列表
  getFilteredResources: () => {
    const { resources, filter, sort } = get();
    let list = Array.from(resources.values());

    // 过滤
    if (filter.type) {
      list = list.filter(r => r.type === filter.type);
    }
    if (filter.status) {
      list = list.filter(r => r.status === filter.status);
    }
    if (filter.search) {
      const search = filter.search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(search));
    }

    // 排序
    list.sort((a, b) => {
      let cmp = 0;
      switch (sort.field) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'createdAt':
          cmp = a.createdAt - b.createdAt;
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
        case 'duration':
          cmp = (a.duration || 0) - (b.duration || 0);
          break;
      }
      return sort.order === 'asc' ? cmp : -cmp;
    });

    return list;
  },

  // 引用计数
  incrementRefCount: (id) => {
    set((state) => {
      const resource = state.resources.get(id);
      if (!resource) return state;

      const newResources = new Map(state.resources);
      newResources.set(id, { ...resource, refCount: resource.refCount + 1 });
      return { resources: newResources };
    });
  },

  decrementRefCount: (id) => {
    set((state) => {
      const resource = state.resources.get(id);
      if (!resource) return state;

      const newResources = new Map(state.resources);
      newResources.set(id, { ...resource, refCount: Math.max(0, resource.refCount - 1) });
      return { resources: newResources };
    });
  },

  // 从项目数据加载
  loadFromProject: (data) => {
    if (!data?.resources) return;

    const resources = new Map<string, Resource>();
    for (const r of data.resources) {
      resources.set(r.id, r);
    }
    set({ resources });
  },

  // 保存到项目数据
  saveToProject: () => {
    const { resources } = get();
    return {
      resources: Array.from(resources.values())
    };
  }
}));

// 导出单例访问
export const resourceStore = {
  getState: () => useResourceStore.getState(),
  subscribe: useResourceStore.subscribe
};

export default useResourceStore;
