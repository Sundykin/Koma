/**
 * Novel Promotion IPC Service
 * 前端调用后端 Novel Promotion 功能的服务层
 */

import type {
  Episode,
  Character,
  Location,
  Clip,
  Storyboard,
} from '../pages/NovelPromotion/types';

// 使用 Electron API 桥接
const getElectronAPI = (): any => {
  if (typeof window === 'undefined' || !(window as any).electronAPI) {
    throw new Error('Electron API not available');
  }
  return (window as any).electronAPI;
};

interface IPCResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

async function invoke<T>(channel: string, args?: any): Promise<T> {
  const api = getElectronAPI();

  // 使用通用的 IPC invoke 方法
  if (api.ipc && api.ipc.invoke) {
    const response: IPCResponse<T> = await api.ipc.invoke(channel, args);
    if (!response.ok) {
      throw new Error(response.error?.message || 'IPC call failed');
    }
    return response.data as T;
  }

  // 回退：直接调用（如果 API 已经暴露了特定方法）
  throw new Error(`IPC channel not available: ${channel}`);

  if (!response.ok) {
    throw new Error(response.error?.message || 'IPC call failed');
  }

  return response.data as T;
}

// ============ Episode API ============

export const episodeAPI = {
  async create(projectId: string, name: string): Promise<{ id: string }> {
    return invoke('novel-promotion:episode:create', { projectId, name });
  },

  async get(episodeId: string): Promise<Episode> {
    return invoke('novel-promotion:episode:get', { episodeId });
  },

  async list(projectId: string): Promise<Episode[]> {
    return invoke('novel-promotion:episode:list', { projectId });
  },

  async update(episodeId: string, updates: Partial<Episode>): Promise<void> {
    return invoke('novel-promotion:episode:update', { episodeId, updates });
  },

  async delete(episodeId: string): Promise<void> {
    return invoke('novel-promotion:episode:delete', { episodeId });
  },
};

// ============ Character API ============

export const characterAPI = {
  async create(
    projectId: string,
    data: Omit<Character, 'id' | 'projectId' | 'createdAt'>
  ): Promise<{ id: string }> {
    return invoke('novel-promotion:character:create', { projectId, ...data });
  },

  async list(projectId: string): Promise<Character[]> {
    return invoke('novel-promotion:character:list', { projectId });
  },

  async update(characterId: string, updates: Partial<Character>): Promise<void> {
    return invoke('novel-promotion:character:update', { characterId, updates });
  },

  async delete(characterId: string): Promise<void> {
    return invoke('novel-promotion:character:delete', { characterId });
  },
};

// ============ Location API ============

export const locationAPI = {
  async create(
    projectId: string,
    data: Omit<Location, 'id' | 'projectId' | 'createdAt'>
  ): Promise<{ id: string }> {
    return invoke('novel-promotion:location:create', { projectId, ...data });
  },

  async list(projectId: string): Promise<Location[]> {
    return invoke('novel-promotion:location:list', { projectId });
  },

  async update(locationId: string, updates: Partial<Location>): Promise<void> {
    return invoke('novel-promotion:location:update', { locationId, updates });
  },

  async delete(locationId: string): Promise<void> {
    return invoke('novel-promotion:location:delete', { locationId });
  },
};

// ============ Clip API ============

export const clipAPI = {
  async list(episodeId: string): Promise<Clip[]> {
    return invoke('novel-promotion:clip:list', { episodeId });
  },
};

// ============ Storyboard API ============

export const storyboardAPI = {
  async list(episodeId: string): Promise<Storyboard[]> {
    return invoke('novel-promotion:storyboard:list', { episodeId });
  },

  async updatePanelVideo(
    panelId: string,
    videoUrl: string,
    videoStatus: string
  ): Promise<void> {
    return invoke('novel-promotion:panel:update-video', {
      panelId,
      videoUrl,
      videoStatus,
    });
  },
};

// ============ Workflow API ============

export const workflowAPI = {
  async storyToScript(payload: {
    projectId: string;
    episodeId: string;
    novelText: string;
    theme?: string;
    videoRatio?: string;
  }): Promise<{ taskId: string }> {
    return invoke('novel-promotion:workflow:story-to-script', payload);
  },

  async scriptToStoryboard(payload: {
    projectId: string;
    episodeId: string;
    clipId: string;
    clipContent: string;
    characters: Array<{ name: string; description: string }>;
    location: string;
  }): Promise<{ taskId: string }> {
    return invoke('novel-promotion:workflow:script-to-storyboard', payload);
  },
};
